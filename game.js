// ==========================================
// 1. TRACK PRESETS & DATA CONFIG
// ==========================================
const TRACK_WIDTH = 12; // Maximum distance allowed from lane center

const PRESET_TRACKS = {
    oval: [
        {x: -40, z: -80}, {x: 40, z: -80}, {x: 80, z: -40}, 
        {x: 80, z: 40}, {x: 40, z: 80}, {x: -40, z: 80}, 
        {x: -80, z: 40}, {x: -80, z: -40}
    ],
    twisty: [
        {x: -60, z: -60}, {x: 0, z: -90}, {x: 60, z: -60},
        {x: 20, z: 0}, {x: 80, z: 60}, {x: -20, z: 90},
        {x: -80, z: 30}, {x: -40, z: -30}
    ],
    stunt: [
        {x: -80, z: -80}, {x: 0, z: -100}, {x: 80, z: -80},
        {x: 100, z: 0}, {x: 80, z: 80}, {x: -80, z: 80}
    ]
};

let customTrackNodes = JSON.parse(localStorage.getItem("customTrackNodes")) || [
    {x: -50, z: -50}, {x: 50, z: -50}, {x: 50, z: 50}, {x: -50, z: 50}
];

let currentTrackPoints = [];
let currentCurve = null;
let selectedCarStyle = 'sport';

// UI Switcher
function selectCarStyle(style, btn) {
    selectedCarStyle = style;
    document.querySelectorAll('.car-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function hideAllScreens() {
    document.getElementById("main-menu").classList.add("hidden");
    document.getElementById("host-modal").classList.add("hidden");
    document.getElementById("join-menu").classList.add("hidden");
    document.getElementById("game-hud").classList.add("hidden");
    document.getElementById("editor-ui").classList.add("hidden");
}

function showMainMenu() { hideAllScreens(); document.getElementById("main-menu").classList.remove("hidden"); }
function showHostGrid() { hideAllScreens(); document.getElementById("host-modal").classList.remove("hidden"); }
function showJoinMenu() { hideAllScreens(); document.getElementById("join-menu").classList.remove("hidden"); }

// ==========================================
// 2. ENGINE, ENVIRONMENT & CAR SETUP
// ==========================================
let scene, camera, renderer, car;
let boosters = [];
let jumps = [];
let trackMesh = null, innerWall = null, outerWall = null;
let editorMarkers = [];

let speed = 0, rot = 0, verticalSpeed = 0, carY = 0;
let isGrounded = true;
let keys = {};
let isEditorMode = false;

function initEngine() {
    if (renderer) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.003);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    let sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(100, 200, 100);
    scene.add(sun);

    // Background Scenery (Ground Plane & Distant Mountains)
    let ground = new THREE.Mesh(
        new THREE.PlaneGeometry(800, 800),
        new THREE.MeshLambertMaterial({ color: 0x3b7a57 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    createBackgroundMountains();

    window.addEventListener('keydown', e => keys[e.key] = true);
    window.addEventListener('keyup', e => keys[e.key] = false);

    animate();
}

function createBackgroundMountains() {
    let mtnGeo = new THREE.ConeGeometry(30, 60, 5);
    let mtnMat = new THREE.MeshLambertMaterial({ color: 0x556677 });

    for (let i = 0; i < 20; i++) {
        let mountain = new THREE.Mesh(mtnGeo, mtnMat);
        let angle = (i / 20) * Math.PI * 2;
        mountain.position.set(Math.cos(angle) * 300, 25, Math.sin(angle) * 300);
        mountain.scale.set(1 + Math.random(), 1 + Math.random() * 0.8, 1 + Math.random());
        scene.add(mountain);
    }
}

// Custom Vehicle Models
function buildSelectedCar() {
    if (car) scene.remove(car);
    car = new THREE.Group();

    if (selectedCarStyle === 'truck') {
        let body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 2.6), new THREE.MeshLambertMaterial({ color: 0x3366cc }));
        body.position.y = 0.5;
        let cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.2), new THREE.MeshLambertMaterial({ color: 0x111111 }));
        cabin.position.set(0, 1.1, -0.2);
        car.add(body, cabin);
    } else if (selectedCarStyle === 'cyber') {
        let body = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.8, 4), new THREE.MeshLambertMaterial({ color: 0x00ffcc }));
        body.rotation.x = Math.PI / 2;
        body.position.y = 0.4;
        car.add(body);
    } else { // Sport
        let body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 2.5), new THREE.MeshLambertMaterial({ color: 0xff0055 }));
        body.position.y = 0.3;
        let cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 1.1), new THREE.MeshLambertMaterial({ color: 0x111111 }));
        cabin.position.set(0, 0.6, -0.2);
        car.add(body, cabin);
    }

    scene.add(car);
}

// ==========================================
// 3. TRACK MESH & OBJECT BUILDER
// ==========================================
function clearSceneObjects() {
    if (trackMesh) scene.remove(trackMesh);
    if (innerWall) scene.remove(innerWall);
    if (outerWall) scene.remove(outerWall);
    boosters.forEach(b => scene.remove(b.mesh));
    jumps.forEach(j => scene.remove(j.mesh));
    boosters = [];
    jumps = [];
}

function buildTrack(points) {
    clearSceneObjects();

    let vectors = points.map(p => new THREE.Vector3(p.x, 0.1, p.z));
    currentCurve = new THREE.CatmullRomCurve3(vectors, true);

    // Asphalt Track
    let roadGeo = new THREE.TubeGeometry(currentCurve, 100, TRACK_WIDTH, 8, true);
    let roadMat = new THREE.MeshLambertMaterial({ color: 0x222225 });
    trackMesh = new THREE.Mesh(roadGeo, roadMat);
    trackMesh.scale.y = 0.01;
    scene.add(trackMesh);

    // Side Walls
    let wallGeo = new THREE.TubeGeometry(currentCurve, 100, TRACK_WIDTH + 1, 8, true);
    let wallMat = new THREE.MeshLambertMaterial({ color: 0xffaa00, wireframe: true });
    outerWall = new THREE.Mesh(wallGeo, wallMat);
    outerWall.scale.y = 0.1;
    scene.add(outerWall);

    // Spawn Boost Pads & Stunt Ramps on Track Path
    for (let i = 0; i < points.length; i++) {
        let p = points[i];
        if (i % 2 === 0) createBoosterPad(p.x, p.z);
        if (i % 3 === 0) createRampJump(p.x, p.z);
    }
}

function createBoosterPad(x, z) {
    let padGeo = new THREE.BoxGeometry(4, 0.2, 4);
    let padMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    let pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(x, 0.15, z);
    scene.add(pad);
    boosters.push({ mesh: pad, x: x, z: z });
}

function createRampJump(x, z) {
    let rampGeo = new THREE.BoxGeometry(6, 1.5, 6);
    let rampMat = new THREE.MeshLambertMaterial({ color: 0xff3300 });
    let ramp = new THREE.Mesh(rampGeo, rampMat);
    ramp.rotation.x = -Math.PI / 6;
    ramp.position.set(x, 0.5, z);
    scene.add(ramp);
    jumps.push({ mesh: ramp, x: x, z: z });
}

// ==========================================
// 4. GAME & EDITOR LAUNCHERS
// ==========================================
function startRace(trackKey) {
    initEngine();
    hideAllScreens();
    document.getElementById("game-hud").classList.remove("hidden");
    isEditorMode = false;

    currentTrackPoints = (trackKey === 'custom') ? customTrackNodes : PRESET_TRACKS[trackKey] || PRESET_TRACKS.oval;
    buildTrack(currentTrackPoints);
    buildSelectedCar();

    car.position.set(currentTrackPoints[0].x, 0, currentTrackPoints[0].z);
    speed = 0; rot = 0; carY = 0;
}

function launchTrackEditor() {
    initEngine();
    hideAllScreens();
    document.getElementById("editor-ui").classList.remove("hidden");
    isEditorMode = true;

    currentTrackPoints = [...customTrackNodes];
    updateEditor();
}

function updateEditor() {
    editorMarkers.forEach(m => scene.remove(m));
    editorMarkers = [];

    currentTrackPoints.forEach(p => {
        let marker = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 3),
            new THREE.MeshBasicMaterial({ color: 0xaa00ff })
        );
        marker.position.set(p.x, 1.5, p.z);
        scene.add(marker);
        editorMarkers.push(marker);
    });

    buildTrack(currentTrackPoints);
    buildSelectedCar();
}

function addTrackNode() {
    let nx = car.position.x + Math.sin(rot) * 15;
    let nz = car.position.z + Math.cos(rot) * 15;
    currentTrackPoints.push({ x: nx, z: nz });
    updateEditor();
}

function clearTrackNodes() {
    currentTrackPoints = [{x:-40,z:-40},{x:40,z:-40},{x:40,z:40},{x:-40,z:40}];
    updateEditor();
}

function saveCustomTrack() {
    customTrackNodes = [...currentTrackPoints];
    localStorage.setItem("customTrackNodes", JSON.stringify(customTrackNodes));
    alert("Track Saved!");
}

function exitEditor() {
    editorMarkers.forEach(m => scene.remove(m));
    showMainMenu();
}

// ==========================================
// 5. ANIMATION & TRACK-BOUND PHYSICS
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    // Throttle & Turn
    if (keys['w'] || keys['W'] || keys['ArrowUp']) speed = Math.min(speed + 0.012, 0.55);
    else if (keys['s'] || keys['S'] || keys['ArrowDown']) speed = Math.max(speed - 0.012, -0.2);
    else speed *= 0.985;

    if (keys['a'] || keys['A'] || keys['ArrowLeft']) rot += 0.035;
    if (keys['d'] || keys['D'] || keys['ArrowRight']) rot -= 0.035;

    let nextX = car.position.x + Math.sin(rot) * speed;
    let nextZ = car.position.z + Math.cos(rot) * speed;

    // Strict Track-Lane Constraint System
    if (currentCurve && !isEditorMode) {
        // Find closest point on spline path
        let closestU = 0, minDistance = Infinity;
        for (let u = 0; u <= 1; u += 0.02) {
            let pt = currentCurve.getPoint(u);
            let dist = Math.hypot(pt.x - nextX, pt.z - nextZ);
            if (dist < minDistance) {
                minDistance = dist;
                closestU = u;
            }
        }

        let statusText = document.getElementById("hud-status");
        if (minDistance > TRACK_WIDTH * 0.75) {
            // Repel / Bounce off lane edges
            speed = -speed * 0.5;
            if (statusText) { statusText.innerText = "LANE WARNING!"; statusText.style.color = "#ff3355"; }
        } else {
            if (statusText) { statusText.innerText = "ON TRACK"; statusText.style.color = "#00ffcc"; }
            car.position.x = nextX;
            car.position.z = nextZ;
        }
    } else {
        car.position.x = nextX;
        car.position.z = nextZ;
    }

    // Boost Pad Collisions
    boosters.forEach(b => {
        if (Math.hypot(b.x - car.position.x, b.z - car.position.z) < 3.5) {
            speed = 1.1; // Instant Speed Surge
        }
    });

    // Jump Ramp Physics
    jumps.forEach(j => {
        if (Math.hypot(j.x - car.position.x, j.z - car.position.z) < 3.5 && isGrounded) {
            verticalSpeed = 0.45; // Launch into air
            isGrounded = false;
        }
    });

    // Gravity for Airborne Jumps
    if (!isGrounded) {
        carY += verticalSpeed;
        verticalSpeed -= 0.025; // Gravity acceleration
        if (carY <= 0) {
            carY = 0;
            isGrounded = true;
        }
    }

    car.position.y = carY;
    car.rotation.y = rot;

    // Dynamic Camera Tracking
    camera.position.x = car.position.x - Math.sin(rot) * 11;
    camera.position.z = car.position.z - Math.cos(rot) * 11;
    camera.position.y = car.position.y + 5.5 + carY * 0.5;
    camera.lookAt(car.position.x, car.position.y + 0.5, car.position.z);

    // HUD Update
    let speedDisplay = document.getElementById("hud-speed");
    if (speedDisplay) speedDisplay.innerText = `${Math.round(Math.abs(speed * 180))} KM/H`;

    renderer.render(scene, camera);
}
