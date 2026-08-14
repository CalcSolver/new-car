// ==========================================
// 1. GLOBAL CONFIG & TRACK DATA
// ==========================================
const TRACK_WIDTH = 16;
const BARRIER_RADIUS = TRACK_WIDTH / 2 - 1.5; // Boundary line where invisible wall hits

const PRESET_TRACKS = {
    oval: [
        {x: -60, z: -100}, {x: 60, z: -100}, {x: 100, z: -50}, 
        {x: 100, z: 50}, {x: 60, z: 100}, {x: -60, z: 100}, 
        {x: -100, z: 50}, {x: -100, z: -50}
    ],
    twisty: [
        {x: -70, z: -70}, {x: 0, z: -100}, {x: 70, z: -70},
        {x: 30, z: 0}, {x: 90, z: 70}, {x: -30, z: 100},
        {x: -90, z: 30}, {x: -50, z: -30}
    ],
    stunt: [
        {x: -90, z: -90}, {x: 0, z: -110}, {x: 90, z: -90},
        {x: 110, z: 0}, {x: 90, z: 90}, {x: -90, z: 90}
    ]
};

let customTrackNodes = JSON.parse(localStorage.getItem("customTrackNodes")) || [
    {x: -50, z: -50}, {x: 50, z: -50}, {x: 50, z: 50}, {x: -50, z: 50}
];

let currentTrackPoints = [];
let currentCurve = null;

let carModel = 'sport';
let carColorHex = 0xff0055;

// Nitro system variables
let nitroLevel = 100; // 0 to 100%
const MAX_NITRO = 100;
const NITRO_DRAIN = 0.8;
const NITRO_RECHARGE = 0.25;

// Global Scope UI Navigation Methods
window.showMainMenu = function() { hideAllScreens(); document.getElementById("main-menu").classList.remove("hidden"); };
window.showGarage = function() { hideAllScreens(); document.getElementById("garage-menu").classList.remove("hidden"); };
window.showHostGrid = function() { hideAllScreens(); document.getElementById("host-modal").classList.remove("hidden"); };
window.showJoinMenu = function() { hideAllScreens(); document.getElementById("join-menu").classList.remove("hidden"); };

function hideAllScreens() {
    ['main-menu', 'garage-menu', 'host-modal', 'join-menu', 'game-hud', 'editor-ui'].forEach(id => {
        let el = document.getElementById(id);
        if (el) el.classList.add("hidden");
    });
}

window.setCarModel = function(model, btn) {
    carModel = model;
    document.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
};

window.setCarColor = function(color, swatch) {
    carColorHex = color;
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    if (swatch) swatch.classList.add('active');
};

// ==========================================
// 2. ENGINE & SCENE INITIALIZATION
// ==========================================
let scene, camera, renderer, car;
let boosters = [], jumps = [];
let trackMesh = null;
let editorMarkers = [];

let speed = 0, rot = 0, verticalSpeed = 0, carY = 0;
let isGrounded = true;
let keys = {};
let isEditorMode = false;

function initEngine() {
    if (renderer) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.002);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    let sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(100, 200, 100);
    scene.add(sun);

    // Ground Plane
    let ground = new THREE.Mesh(
        new THREE.PlaneGeometry(800, 800),
        new THREE.MeshLambertMaterial({ color: 0x3b7a57 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    createBackgroundMountains();

    window.addEventListener('keydown', e => keys[e.key] = true);
    window.addEventListener('keyup', e => keys[e.key] = false);
    window.addEventListener('resize', onResize);

    animate();
}

function createBackgroundMountains() {
    let mtnGeo = new THREE.ConeGeometry(35, 70, 5);
    let mtnMat = new THREE.MeshLambertMaterial({ color: 0x556677 });

    for (let i = 0; i < 16; i++) {
        let mtn = new THREE.Mesh(mtnGeo, mtnMat);
        let angle = (i / 16) * Math.PI * 2;
        mtn.position.set(Math.cos(angle) * 320, 35, Math.sin(angle) * 320);
        scene.add(mtn);
    }
}

function buildCustomCar() {
    if (car) scene.remove(car);
    car = new THREE.Group();

    let bodyMat = new THREE.MeshLambertMaterial({ color: carColorHex });
    let cabinMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

    if (carModel === 'truck') {
        let body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 2.6), bodyMat);
        body.position.y = 0.5;
        let cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.2), cabinMat);
        cabin.position.set(0, 1.1, -0.2);
        car.add(body, cabin);
    } else if (carModel === 'cyber') {
        let body = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.8, 4), bodyMat);
        body.rotation.x = Math.PI / 2;
        body.position.y = 0.4;
        car.add(body);
    } else { // Sport
        let body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 2.5), bodyMat);
        body.position.y = 0.3;
        let cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 1.1), cabinMat);
        cabin.position.set(0, 0.6, -0.2);
        car.add(body, cabin);
    }

    scene.add(car);
}

// ==========================================
// 3. TRACK & OBJECT BUILDER
// ==========================================
function clearObjects() {
    if (trackMesh) scene.remove(trackMesh);
    boosters.forEach(b => scene.remove(b.mesh));
    jumps.forEach(j => scene.remove(j.mesh));
    boosters = [];
    jumps = [];
}

function buildTrack(points) {
    clearObjects();

    if (!points || points.length < 3) return;

    let vectors = points.map(p => new THREE.Vector3(p.x, 0.1, p.z));
    currentCurve = new THREE.CatmullRomCurve3(vectors, true);

    let roadGeo = new THREE.TubeGeometry(currentCurve, 120, TRACK_WIDTH, 8, true);
    let roadMat = new THREE.MeshLambertMaterial({ color: 0x222225 });
    trackMesh = new THREE.Mesh(roadGeo, roadMat);
    trackMesh.scale.y = 0.01;
    scene.add(trackMesh);

    // Boost & Jump Pads
    for (let i = 0; i < points.length; i++) {
        let p = points[i];
        if (i % 2 === 0) createBoosterPad(p.x, p.z);
        if (i % 3 === 0) createRampJump(p.x, p.z);
    }
}

function createBoosterPad(x, z) {
    let pad = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
    pad.position.set(x, 0.15, z);
    scene.add(pad);
    boosters.push({ mesh: pad, x: x, z: z });
}

function createRampJump(x, z) {
    let ramp = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0xff3300 }));
    ramp.rotation.x = -Math.PI / 6;
    ramp.position.set(x, 0.4, z);
    scene.add(ramp);
    jumps.push({ mesh: ramp, x: x, z: z });
}

// ==========================================
// 4. GAME CONTROLLER HANDLERS
// ==========================================
window.startRace = function(trackKey) {
    initEngine();
    hideAllScreens();
    
    let hud = document.getElementById("game-hud");
    if (hud) hud.classList.remove("hidden");
    isEditorMode = false;
    nitroLevel = 100;

    currentTrackPoints = (trackKey === 'custom') ? customTrackNodes : PRESET_TRACKS[trackKey] || PRESET_TRACKS.oval;
    buildTrack(currentTrackPoints);
    buildCustomCar();

    car.position.set(currentTrackPoints[0].x, 0, currentTrackPoints[0].z);
    speed = 0; rot = 0; carY = 0;
};

window.launchTrackEditor = function() {
    initEngine();
    hideAllScreens();

    let editorUI = document.getElementById("editor-ui");
    if (editorUI) editorUI.classList.remove("hidden");
    isEditorMode = true;

    currentTrackPoints = [...customTrackNodes];
    updateEditor();
};

function updateEditor() {
    editorMarkers.forEach(m => scene.remove(m));
    editorMarkers = [];

    currentTrackPoints.forEach(p => {
        let marker = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3), new THREE.MeshBasicMaterial({ color: 0xaa00ff }));
        marker.position.set(p.x, 1.5, p.z);
        scene.add(marker);
        editorMarkers.push(marker);
    });

    buildTrack(currentTrackPoints);
    buildCustomCar();
}

window.addTrackNode = function() {
    let nx = car.position.x + Math.sin(rot) * 15;
    let nz = car.position.z + Math.cos(rot) * 15;
    currentTrackPoints.push({ x: nx, z: nz });
    updateEditor();
};

window.clearTrackNodes = function() {
    currentTrackPoints = [{x:-50,z:-50},{x:50,z:-50},{x:50,z:50},{x:-50,z:50}];
    updateEditor();
};

window.saveCustomTrack = function() {
    customTrackNodes = [...currentTrackPoints];
    localStorage.setItem("customTrackNodes", JSON.stringify(customTrackNodes));
    alert("Custom Track Saved!");
};

window.exitEditor = function() {
    editorMarkers.forEach(m => scene.remove(m));
    showMainMenu();
};

// Helper: Finds nearest point on track curve to position
function getClosestTrackPoint(pos) {
    if (!currentCurve) return { point: pos, distance: 0 };

    let minDistance = Infinity;
    let closestPt = pos;

    // Scan curve steps to find nearest point on track spline
    for (let u = 0; u <= 1; u += 0.01) {
        let pt = currentCurve.getPoint(u);
        let dist = Math.hypot(pt.x - pos.x, pt.z - pos.z);
        if (dist < minDistance) {
            minDistance = dist;
            closestPt = pt;
        }
    }
    return { point: closestPt, distance: minDistance };
}

// ==========================================
// 5. GAME LOOP & PHYSICS
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    if (!car) {
        if (renderer && scene && camera) renderer.render(scene, camera);
        return;
    }

    // --- NITRO SYSTEM ---
    let isNitroActive = false;
    if ((keys[' '] || keys['Space']) && nitroLevel > 0) {
        isNitroActive = true;
        nitroLevel = Math.max(0, nitroLevel - NITRO_DRAIN);
    } else {
        nitroLevel = Math.min(MAX_NITRO, nitroLevel + NITRO_RECHARGE);
    }

    // Update Nitro UI Bar
    let nitroFill = document.getElementById("nitro-bar-fill");
    if (nitroFill) {
        nitroFill.style.width = `${nitroLevel}%`;
        nitroFill.style.background = isNitroActive 
            ? "linear-gradient(90deg, #ff9900, #ff0055)" 
            : "linear-gradient(90deg, #0088ff, #00ffff)";
    }

    // Driving Physics
    let maxSpeed = isNitroActive ? 0.85 : 0.45;
    let accelRate = isNitroActive ? 0.025 : 0.008;

    if (keys['w'] || keys['W'] || keys['ArrowUp']) speed = Math.min(speed + accelRate, maxSpeed);
    else if (keys['s'] || keys['S'] || keys['ArrowDown']) speed = Math.max(speed - 0.012, -0.15);
    else speed *= 0.98;

    // Steering
    if (Math.abs(speed) > 0.01) {
        let turnDir = speed >= 0 ? 1 : -1;
        if (keys['a'] || keys['A'] || keys['ArrowLeft']) rot += 0.024 * turnDir;
        if (keys['d'] || keys['D'] || keys['ArrowRight']) rot -= 0.024 * turnDir;
    }

    let nextX = car.position.x + Math.sin(rot) * speed;
    let nextZ = car.position.z + Math.cos(rot) * speed;

    // --- INVISIBLE BARRIER COLLISION SYSTEM ---
    if (currentCurve && !isEditorMode) {
        let testPos = { x: nextX, z: nextZ };
        let trackInfo = getClosestTrackPoint(testPos);

        if (trackInfo.distance > BARRIER_RADIUS) {
            // Push car back inside boundary edge
            let dx = testPos.x - trackInfo.point.x;
            let dz = testPos.z - trackInfo.point.z;
            let angle = Math.atan2(dz, dx);

            // Set car position right at boundary limit
            nextX = trackInfo.point.x + Math.cos(angle) * BARRIER_RADIUS;
            nextZ = trackInfo.point.z + Math.sin(angle) * BARRIER_RADIUS;

            // Bounce momentum drop
            speed *= 0.3;
        }

        let statusText = document.getElementById("hud-status");
        if (statusText) {
            if (isNitroActive) {
                statusText.innerText = "BOOSTING!";
                statusText.style.color = "#ffaa00";
            } else {
                statusText.innerText = "ON TRACK";
                statusText.style.color = "#00ffcc";
            }
        }
    }

    car.position.x = nextX;
    car.position.z = nextZ;

    // Boost Pads
    boosters.forEach(b => {
        if (Math.hypot(b.x - car.position.x, b.z - car.position.z) < 4) {
            speed = 0.9;
        }
    });

    // Jump Ramps
    jumps.forEach(j => {
        if (Math.hypot(j.x - car.position.x, j.z - car.position.z) < 4 && isGrounded) {
            verticalSpeed = 0.35;
            isGrounded = false;
        }
    });

    // Gravity
    if (!isGrounded) {
        carY += verticalSpeed;
        verticalSpeed -= 0.02;
        if (carY <= 0) {
            carY = 0;
            isGrounded = true;
        }
    }

    car.position.y = carY;
    car.rotation.y = rot;

    // Camera Tracking
    camera.position.x = car.position.x - Math.sin(rot) * 12;
    camera.position.z = car.position.z - Math.cos(rot) * 12;
    camera.position.y = car.position.y + 6;
    camera.lookAt(car.position.x, car.position.y + 0.5, car.position.z);

    // Speedometer
    let speedDisplay = document.getElementById("hud-speed");
    if (speedDisplay) speedDisplay.innerText = `${Math.round(Math.abs(speed * 180))} KM/H`;

    renderer.render(scene, camera);
}

function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
