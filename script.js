// ==========================================
// 1. FIREBASE CONFIGURATION (Your Database)
// ==========================================
var firebaseConfig = {
  apiKey: "AIzaSyBhBjB9cD8IDFarhBMUoG_jhL_Gl277ZG8",
  authDomain: "racing-game-67477.firebaseapp.com",
  databaseURL: "https://racing-game-67477-default-rtdb.firebaseio.com",
  projectId: "racing-game-67477",
  storageBucket: "racing-game-67477.firebasestorage.app",
  messagingSenderId: "48596697348",
  appId: "1:48596697348:web:897b9f78e511bc2f635051",
  measurementId: "G-R80VNMYKWR"
};

// Initialize Firebase compatibility SDK
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Global Variables & Game Settings
var database = typeof firebase !== 'undefined' ? firebase.database() : null;
var scene, camera, renderer;
var player = {
    x: 0,
    y: 0,
    z: 0,
    rot: 0,
    speed: 0,
    lap: 1,
    maxLaps: 5, // UPGRADED: Set to 5 Laps
    color: 0
};

// UPGRADED: Physics parameters for faster car performance
var MAX_SPEED = 1.0;     // Increased top speed (Original was ~0.5)
var ACCELERATION = 0.025; // Punchier takeoff speed
var FRICTION = 0.98;     // Momentum decay rate
var TURN_SPEED = 0.045;  // Sharper handling

var opponents = {};
var keys = {};

// ==========================================
// 2. MENU & UI LOGIC
// ==========================================
var color = 0;

function updateColor() {
    var slider = document.getElementById("slider");
    if (slider) {
        slider.style.backgroundColor = "hsl(" + color + ", 100%, 50%)";
    }
}

function menu2() {
    var nameInput = document.getElementById("name");
    var playerName = nameInput ? nameInput.value.trim() : "";
    if (!playerName) playerName = "Player" + Math.floor(Math.random() * 1000);
    
    player.name = playerName;
    player.color = color;

    // Hide Menu Overlay
    var fore = document.getElementById("fore");
    if (fore) fore.style.display = "none";

    // Initialize 3D Engine & Multiplayer
    initEngine();
    initMultiplayer();
}

// Frame-busting / prevent embedding in unauthorized external sites
if (window.top !== window.self) {
    try {
        window.top.location.href = window.self.location.href;
    } catch(e) {}
}

// ==========================================
// 3. THREE.JS 3D SCENE SETUP
// ==========================================
function initEngine() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Basic Ambient and Directional Lighting
    var ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);

    // Track Ground Plane
    var groundGeo = new THREE.PlaneGeometry(500, 500);
    var groundMat = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Create Local Player Car Mesh
    createCarMesh(player);

    // Controls listeners
    window.addEventListener('keydown', function(e) { keys[e.key] = true; });
    window.addEventListener('keyup', function(e) { keys[e.key] = false; });
    window.addEventListener('resize', onWindowResize);

    // Start Game Loop
    animate();
}

function createCarMesh(pObj) {
    var carGroup = new THREE.Group();
    var bodyGeo = new THREE.BoxGeometry(1.5, 0.6, 2.8);
    var bodyMat = new THREE.MeshLambertMaterial({ color: new THREE.Color("hsl(" + (pObj.color || 0) + ", 100%, 50%)") });
    var body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.3;
    carGroup.add(body);

    scene.add(carGroup);
    pObj.mesh = carGroup;
}

// ==========================================
// 4. GAMEPLAY LOOP & CAR PHYSICS
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    // Drive Input Mechanics
    if (keys['ArrowUp'] || keys['w'] || keys['W']) {
        player.speed = Math.min(player.speed + ACCELERATION, MAX_SPEED);
    } else if (keys['ArrowDown'] || keys['s'] || keys['S']) {
        player.speed = Math.max(player.speed - ACCELERATION, -MAX_SPEED * 0.4);
    } else {
        player.speed *= FRICTION;
    }

    if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
        player.rot += TURN_SPEED * (player.speed >= 0 ? 1 : -1);
    }
    if (keys['ArrowRight'] || keys['d'] || keys['D']) {
        player.rot -= TURN_SPEED * (player.speed >= 0 ? 1 : -1);
    }

    // Position updates
    player.x += Math.sin(player.rot) * player.speed;
    player.z += Math.cos(player.rot) * player.speed;

    if (player.mesh) {
        player.mesh.position.set(player.x, 0, player.z);
        player.mesh.rotation.y = player.rot;
    }

    // Follow-Camera Logic
    camera.position.x = player.x - Math.sin(player.rot) * 8;
    camera.position.z = player.z - Math.cos(player.rot) * 8;
    camera.position.y = player.y + 4;
    camera.lookAt(player.x, player.y + 1, player.z);

    // Broadcast Position to Firebase
    syncPositionToFirebase();

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// 5. FIREBASE MULTIPLAYER SYNC
// ==========================================
var playerRef = null;

function initMultiplayer() {
    if (!database) return;

    var playersRef = database.ref('players');
    playerRef = playersRef.push();

    // Remove player on disconnect
    playerRef.onDisconnect().remove();

    // Listen for other players joining/moving
    playersRef.on('child_added', function(snapshot) {
        var id = snapshot.key;
        if (id !== playerRef.key) {
            var data = snapshot.val();
            opponents[id] = data;
            createCarMesh(opponents[id]);
        }
    });

    playersRef.on('child_changed', function(snapshot) {
        var id = snapshot.key;
        if (id !== playerRef.key && opponents[id]) {
            var data = snapshot.val();
            opponents[id].x = data.x;
            opponents[id].z = data.z;
            opponents[id].rot = data.rot;
            if (opponents[id].mesh) {
                opponents[id].mesh.position.set(data.x, 0, data.z);
                opponents[id].mesh.rotation.y = data.rot;
            }
        }
    });

    playersRef.on('child_removed', function(snapshot) {
        var id = snapshot.key;
        if (opponents[id]) {
            if (opponents[id].mesh) scene.remove(opponents[id].mesh);
            delete opponents[id];
        }
    });
}

function syncPositionToFirebase() {
    if (playerRef) {
        playerRef.set({
            name: player.name,
            x: player.x,
            z: player.z,
            rot: player.rot,
            color: player.color,
            lap: player.lap
        });
    }
}