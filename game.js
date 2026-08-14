// ==========================================
// 1. GLOBAL CONFIG & TRACK DATA
// ==========================================
const TRACK_WIDTH = 16;
const BARRIER_RADIUS = TRACK_WIDTH / 2 - 1.5;

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
let customProps = JSON.parse(localStorage.getItem("customProps")) || [];

let currentTrackPoints = [];
let currentCurve = null;

let carModel = 'sport';
let carColorHex = 0xff0055;

// Host Custom Settings
let selectedTrackKey = 'oval';
let hostTopSpeed = 0.5;
let hostTotalLaps = 3;
let hostBoosterDensity = 'medium';

// Race Progress Tracking
let currentLap = 1;
let passedCheckpoint = false;

// Nitro System
let nitroLevel = 100;
const MAX_NITRO = 100;
const NITRO_DRAIN = 0.8;
const NITRO_RECHARGE = 0.25;

// Global UI Nav
window.showMainMenu = function() { hideAllScreens(); document.getElementById("main-menu").classList.remove("hidden"); };
window.showGarage = function() { hideAllScreens(); document.getElementById("garage-menu").classList.remove("hidden"); };
window.showHostGrid = function() { hideAllScreens(); document.getElementById("host-modal").classList.remove("hidden"); };
window.showJoinMenu = function() { hideAllScreens(); document.getElementById("join-menu").classList.remove("hidden"); };

function hideAllScreens() {
    ['main-menu', 'garage-menu', 'host-modal', 'settings-modal', 'join-menu', 'game-hud', 'editor-ui'].forEach(id => {
        let el = document.getElementById(id);
        if (el) el.classList.add("hidden");
    });
}

window.openHostSettings = function(trackKey) {
    selectedTrackKey = trackKey;
    hideAllScreens();
    document.getElementById("settings-modal").classList.remove("hidden");
};

window.setLaps = function(laps, btn) {
    hostTotalLaps = laps;
    btn.parentNode.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

window.setBoosterDensity = function(density, btn) {
    hostBoosterDensity = density;
    btn.parentNode.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

window.confirmHostStart = function() {
    let speedInput = document.getElementById("setting-speed");
    if (speedInput) hostTopSpeed = parseFloat(speedInput.value);
    startRace(selectedTrackKey);
};

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
// 2. ENGINE & SCENE
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

    let ground = new THREE.Mesh(
        new THREE.PlaneGeometry(800, 800),
        new THREE.MeshLambertMaterial({ color: 0x3b7a57 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    window.addEventListener('keydown', e => keys[e.key] = true);
    window.addEventListener('keyup', e => keys[e.key] = false);
    window.addEventListener('resize', onResize);

    animate();
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
    } else {
        let body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 2.5), bodyMat);
        body.position.y = 0.3;
        let cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 1.1), cabinMat);
        cabin.position.set(0, 0.6, -0.2);
        car.add(body, cabin);
    }

    scene.add(car);
}

// ==========================================
// 3. TRACK & PROP BUILDER
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

    if (selectedTrackKey === 'custom') {
        customProps.forEach(p => {
            if (p.type === 'booster') createBoosterPad(p.x, p.z);
            if (p.type === 'ramp') createRampJump(p.x, p.z, 0);
        });
    } else {
        let step = hostBoosterDensity === 'high' ? 2 : (hostBoosterDensity === 'medium' ? 3 : 5);
        for (let i = 0; i < points.length; i++) {
            let p = points[i];
            let t = i / points.length;
            let tangent = currentCurve.getTangent(t);
            let angle = Math.atan2(tangent.x, tangent.z);

            if (i % step === 0) createBoosterPad(p.x, p.z);
            if (i % 4 === 0) createRampJump(p.x, p.z, angle);
        }
    }
}

function createBoosterPad(x, z) {
    let pad = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
    pad.position.set(x, 0.15, z);
    scene.add(pad);
    boosters.push({ mesh: pad, x: x, z: z });
}

function createRampJump(x, z, angle) {
    let ramp = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0xff3300 }));
    ramp.position.set(x, 0.4, z);
    ramp.rotation.y = angle;
    ramp.rotation.x = -Math.PI / 12; // Direction-aligned incline
    scene.add(ramp);
    jumps.push({ mesh: ramp, x: x, z: z });
}

// ==========================================
// 4. GAME CONTROLLERS
// ==========================================
window.startRace = function(trackKey) {
    initEngine();
    hideAllScreens();
    
    let hud = document.getElementById("game-hud");
    if (hud) hud.classList.remove("hidden");
    
    isEditorMode = false;
    nitroLevel = 100;
    currentLap = 1;
    passedCheckpoint = false;
    updateLapHUD();

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
    selectedTrackKey = 'custom';

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

window.addCustomBooster = function() {
    customProps.push({ type: 'booster', x: car.position.x, z: car.position.z });
    updateEditor();
};

window.addCustomRamp = function() {
    customProps.push({ type: 'ramp', x: car.position.x, z: car.position.z });
    updateEditor();
};

window.saveCustomTrack = function() {
    customTrackNodes = [...currentTrackPoints];
    localStorage.setItem("customTrackNodes", JSON.stringify(customTrackNodes));
    localStorage.setItem("customProps", JSON.stringify(customProps));
    alert("Custom Track & Props Saved!");
};

window.exitEditor = function() {
    editorMarkers.forEach(m => scene.remove(m));
    showMainMenu();
};

function updateLapHUD() {
    let lapEl = document.getElementById("hud-lap");
    if (lapEl) lapEl.innerText = `${currentLap} / ${hostTotalLaps}`;
}

function getClosestTrackPoint(pos) {
    if (!currentCurve) return { point: pos, distance: 0 };
    let minDistance = Infinity;
    let closestPt = pos;

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
    if (!car) return;

    // Nitro Active Logic
    let isNitroActive = false;
    if ((keys[' '] || keys['Space']) && nitroLevel > 0) {
        isNitroActive = true;
        nitroLevel = Math.max(0, nitroLevel - NITRO_DRAIN);
    } else {
        nitroLevel = Math.min(MAX_NITRO, nitroLevel + NITRO_RECHARGE);
    }

    let nitroFill = document.getElementById("nitro-bar-fill");
    if (nitroFill) nitroFill.style.width = `${nitroLevel}%`;

    // Speed Controls
    let maxCap = isNitroActive ? hostTopSpeed * 1.6 : hostTopSpeed;
    if (keys['w'] || keys['W'] || keys['ArrowUp']) speed = Math.min(speed + 0.012, maxCap);
    else if (keys['s'] || keys['S'] || keys['ArrowDown']) speed = Math.max(speed - 0.015, -0.2);
    else speed *= 0.98;

    // Steering
    if (Math.abs(speed) > 0.01) {
        let turnDir = speed >= 0 ? 1 : -1;
        if (keys['a'] || keys['A'] || keys['ArrowLeft']) rot += 0.026 * turnDir;
        if (keys['d'] || keys['D'] || keys['ArrowRight']) rot -= 0.026 * turnDir;
    }

    let nextX = car.position.x + Math.sin(rot) * speed;
    let nextZ = car.position.z + Math.cos(rot) * speed;

    // Bouncing Invisible Walls
    if (currentCurve && !isEditorMode) {
        let trackInfo = getClosestTrackPoint({ x: nextX, z: nextZ });

        if (trackInfo.distance > BARRIER_RADIUS) {
            // Calculate normal vector pushing inwards from wall
            let nx = (car.position.x - trackInfo.point.x) / trackInfo.distance;
            let nz = (car.position.z - trackInfo.point.z) / trackInfo.distance;

            // Reflect position outwards to keep car inside track
            nextX = trackInfo.point.x + nx * BARRIER_RADIUS;
            nextZ = trackInfo.point.z + nz * BARRIER_RADIUS;

            // Deflect orientation without sacrificing car velocity
            rot += Math.atan2(nx, nz) * 0.15;
        }

        // Lap Counter Logic
        let startPoint = currentTrackPoints[0];
        let distToStart = Math.hypot(car.position.x - startPoint.x, car.position.z - startPoint.z);
        if (distToStart < 12 && passedCheckpoint) {
            currentLap++;
            passedCheckpoint = false;
            updateLapHUD();
            if (currentLap > hostTotalLaps) {
                alert("RACE FINISHED!");
                showMainMenu();
            }
        } else if (distToStart > 40) {
            passedCheckpoint = true;
        }
    }

    car.position.x = nextX;
    car.position.z = nextZ;

    // Boost & Jump Pads
    boosters.forEach(b => {
        if (Math.hypot(b.x - car.position.x, b.z - car.position.z) < 4) speed = hostTopSpeed * 1.8;
    });

    jumps.forEach(j => {
        if (Math.hypot(j.x - car.position.x, j.z - car.position.z) < 4 && isGrounded) {
            verticalSpeed = 0.38;
            isGrounded = false;
        }
    });

    if (!isGrounded) {
        carY += verticalSpeed;
        verticalSpeed -= 0.02;
        if (carY <= 0) { carY = 0; isGrounded = true; }
    }

    car.position.y = carY;
    car.rotation.y = rot;

    // Camera
    camera.position.x = car.position.x - Math.sin(rot) * 12;
    camera.position.z = car.position.z - Math.cos(rot) * 12;
    camera.position.y = car.position.y + 6;
    camera.lookAt(car.position.x, car.position.y + 0.5, car.position.z);

    let speedDisplay = document.getElementById("hud-speed");
    if (speedDisplay) speedDisplay.innerText = `${Math.round(Math.abs(speed * 200))} KM/H`;

    renderer.render(scene, camera);
}

function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
