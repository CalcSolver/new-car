// ==========================================
// 1. TRACK PRESETS & DATA CONFIG
// ==========================================
const WORLD_BOUNDS = 220; // Radius limit for invisible world walls

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
    figure8: [
        {x: -60, z: -60}, {x: -20, z: -30}, {x: 20, z: 30},
        {x: 60, z: 60}, {x: 60, z: 20}, {x: -60, z: -20}
    ],
    desert: [
        {x: -90, z: -90}, {x: 90, z: -90}, {x: 100, z: 0},
        {x: 90, z: 90}, {x: -90, z: 90}, {x: -100, z: 0}
    ]
};

let customTrackNodes = JSON.parse(localStorage.getItem("customTrackNodes")) || [
    {x: -50, z: -50}, {x: 50, z: -50}, {x: 50, z: 50}, {x: -50, z: 50}
];

let currentTrackPoints = [];

// ==========================================
// 2. UI NAVIGATION ENGINE
// ==========================================
function hideAllScreens() {
    document.getElementById("main-menu").classList.add("hidden");
    document.getElementById("host-modal").classList.add("hidden");
    document.getElementById("join-menu").classList.add("hidden");
    document.getElementById("game-hud").classList.add("hidden");
    document.getElementById("editor-ui").classList.add("hidden");
}

function showMainMenu() {
    hideAllScreens();
    document.getElementById("main-menu").classList.remove("hidden");
}

function showHostGrid() {
    hideAllScreens();
    document.getElementById("host-modal").classList.remove("hidden");
}

function showJoinMenu() {
    hideAllScreens();
    document.getElementById("join-menu").classList.remove("hidden");
}

// ==========================================
// 3. THREE.JS ENGINE & WORLD SETUP
// ==========================================
let scene, camera, renderer, car;
let trackAsphaltMesh = null;
let wallMeshes = [];
let editorMarkers = [];

// Slower, Tuned Physics Parameters
const ACCELERATION = 0.015;
const MAX_SPEED = 0.65;
const REVERSE_SPEED = -0.25;
const FRICTION = 0.985;
const TURN_SPEED = 0.038;

let speed = 0;
let rot = 0;
let keys = {};
let isEditorMode = false;

function initEngine() {
    if (renderer) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Lights
    let ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    let sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(80, 150, 80);
    scene.add(sun);

    // Grass Field
    let grassGeo = new THREE.PlaneGeometry(600, 600);
    let grassMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
    let grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    scene.add(grass);

    // Build Player Car
    createCarMesh();

    // Event Listeners
    window.addEventListener('keydown', e => keys[e.key] = true);
    window.addEventListener('keyup', e => keys[e.key] = false);
    window.addEventListener('resize', onWindowResize);

    animate();
}

function createCarMesh() {
    car = new THREE.Group();

    // Body
    let bodyMat = new THREE.MeshLambertMaterial({ color: 0xff0055 });
    let body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 2.5), bodyMat);
    body.position.y = 0.3;
    car.add(body);

    // Cabin
    let cabinMat = new THREE.MeshLambertMaterial({ color: 0x111122 });
    let cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 1.2), cabinMat);
    cabin.position.set(0, 0.65, -0.2);
    car.add(cabin);

    scene.add(car);
}

// ==========================================
// 4. TRACK GENERATOR & WALL SYSTEM
// ==========================================
function clearTrackMeshes() {
    if (trackAsphaltMesh) scene.remove(trackAsphaltMesh);
    wallMeshes.forEach(w => scene.remove(w));
    wallMeshes = [];
}

function buildTrackAndWalls(points) {
    clearTrackMeshes();

    // Create Smooth Curved Track Path
    let curveVectors = points.map(p => new THREE.Vector3(p.x, 0.05, p.z));
    let curve = new THREE.CatmullRomCurve3(curveVectors, true);

    // 1. Asphalt Road Surface
    let roadGeo = new THREE.TubeGeometry(curve, 120, 7, 8, true);
    let roadMat = new THREE.MeshLambertMaterial({ color: 0x222225 });
    trackAsphaltMesh = new THREE.Mesh(roadGeo, roadMat);
    trackAsphaltMesh.scale.y = 0.02; // Flatten Tube to Road Surface
    scene.add(trackAsphaltMesh);

    // 2. Outer & Inner Guardrail Walls
    let wallGeo = new THREE.TubeGeometry(curve, 120, 7.8, 8, true);
    let wallMat = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
    let wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.scale.y = 0.15; // Vertical barrier profile
    scene.add(wallMesh);
    wallMeshes.push(wallMesh);
}

// ==========================================
// 5. GAME & EDITOR LAUNCH CONTROLLERS
// ==========================================
function startRace(trackKey) {
    initEngine();
    hideAllScreens();
    document.getElementById("game-hud").classList.remove("hidden");
    isEditorMode = false;

    // Load Track Data
    if (trackKey === 'custom') {
        currentTrackPoints = customTrackNodes;
    } else {
        currentTrackPoints = PRESET_TRACKS[trackKey] || PRESET_TRACKS.oval;
    }

    buildTrackAndWalls(currentTrackPoints);

    // Position Car at Start Line
    car.position.set(currentTrackPoints[0].x, 0, currentTrackPoints[0].z);
    speed = 0;
    rot = 0;
}

function launchTrackEditor() {
    initEngine();
    hideAllScreens();
    document.getElementById("editor-ui").classList.remove("hidden");
    isEditorMode = true;

    currentTrackPoints = [...customTrackNodes];
    updateEditorVisuals();
}

function updateEditorVisuals() {
    // Clear old point cylinders
    editorMarkers.forEach(m => scene.remove(m));
    editorMarkers = [];

    // Render interactive nodes
    currentTrackPoints.forEach((pt) => {
        let nodeGeo = new THREE.CylinderGeometry(1.2, 1.2, 2.5, 12);
        let nodeMat = new THREE.MeshBasicMaterial({ color: 0xaa00ff });
        let marker = new THREE.Mesh(nodeGeo, nodeMat);
        marker.position.set(pt.x, 1.25, pt.z);
        scene.add(marker);
        editorMarkers.push(marker);
    });

    buildTrackAndWalls(currentTrackPoints);
}

function addTrackNode() {
    // Drop node relative to car facing direction
    let dropX = car.position.x + Math.sin(rot) * 12;
    let dropZ = car.position.z + Math.cos(rot) * 12;
    currentTrackPoints.push({ x: dropX, z: dropZ });
    updateEditorVisuals();
}

function clearTrackNodes() {
    currentTrackPoints = [
        {x: -40, z: -40}, {x: 40, z: -40}, {x: 40, z: 40}, {x: -40, z: 40}
    ];
    updateEditorVisuals();
}

function saveCustomTrack() {
    customTrackNodes = [...currentTrackPoints];
    localStorage.setItem("customTrackNodes", JSON.stringify(customTrackNodes));
    alert("Custom Track Saved Successfully!");
}

function exitEditor() {
    editorMarkers.forEach(m => scene.remove(m));
    showMainMenu();
}

// ==========================================
// 6. MAIN ANIMATION & PHYSICS LOOP
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    // Car Acceleration Controls
    if (keys['w'] || keys['W'] || keys['ArrowUp']) {
        speed = Math.min(speed + ACCELERATION, MAX_SPEED);
    } else if (keys['s'] || keys['S'] || keys['ArrowDown']) {
        speed = Math.max(speed - ACCELERATION, REVERSE_SPEED);
    } else {
        speed *= FRICTION;
    }

    // Steering
    if (keys['a'] || keys['A'] || keys['ArrowLeft']) {
        rot += TURN_SPEED * (speed >= 0 ? 1 : -1);
    }
    if (keys['d'] || keys['D'] || keys['ArrowRight']) {
        rot -= TURN_SPEED * (speed >= 0 ? 1 : -1);
    }

    // Calculate Target Position
    let nextX = car.position.x + Math.sin(rot) * speed;
    let nextZ = car.position.z + Math.cos(rot) * speed;

    // Invisible World Boundary Collision
    let distanceFromCenter = Math.sqrt(nextX * nextX + nextZ * nextZ);
    if (distanceFromCenter < WORLD_BOUNDS) {
        car.position.x = nextX;
        car.position.z = nextZ;
    } else {
        speed = -speed * 0.5; // Bounce off invisible world perimeter
    }

    car.rotation.y = rot;

    // Smooth Third-Person Camera Tracking
    camera.position.x = car.position.x - Math.sin(rot) * 10;
    camera.position.z = car.position.z - Math.cos(rot) * 10;
    camera.position.y = car.position.y + 5;
    camera.lookAt(car.position.x, car.position.y + 0.6, car.position.z);

    // HUD Updates
    let kmh = Math.abs(Math.round(speed * 180));
    let speedElem = document.getElementById("hud-speed");
    if (speedElem) speedElem.innerText = `${kmh} KM/H`;

    renderer.render(scene, camera);
}

function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
