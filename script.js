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

// Initialize Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Core Game Variables
var database = typeof firebase !== 'undefined' ? firebase.database() : null;
var scene, camera, renderer;
var player = {
    x: 0,
    y: 0,
    z: 0,
    rot: 0,
    speed: 0,
    lap: 1,
    maxLaps: 5, // 5-Lap Mode
    color: 0
};

// Faster Car Performance Parameters
var BASE_MAX_SPEED = 1.1;     
var MAX_SPEED = BASE_MAX_SPEED;
var NITRO_SPEED = 2.4;
var ACCELERATION = 0.03; 
var FRICTION = 0.98;     
var TURN_SPEED = 0.048;  

// Nitro & Currency Inventory (Saved in Local Storage)
var coins = parseInt(localStorage.getItem("racingCoins")) || 0;
var nitroCount = parseInt(localStorage.getItem("nitroCount")) || 3; 
var isNitroActive = false;

// Visual Particles for Flame Effect
var flameParticles = [];
var flameGroup = null;

var opponents = {};
var keys = {};
var color = 0;

// ==========================================
// 2. NITRO & COIN FUNCTIONS
// ==========================================
function updateHUD() {
    var coinDisplay = document.getElementById("hud-coins");
    var nitroDisplay = document.getElementById("hud-nitro");
    var lapDisplay = document.getElementById("hud-lap");
    if (coinDisplay) coinDisplay.innerText = coins;
    if (nitroDisplay) nitroDisplay.innerText = nitroCount;
    if (lapDisplay) lapDisplay.innerText = player.lap;
}

function saveData() {
    localStorage.setItem("racingCoins", coins);
    localStorage.setItem("nitroCount", nitroCount);
}

function addCoins(amount) {
    coins += amount;
    saveData();
    updateHUD();
}

function buyNitro() {
    if (coins >= 50) {
        coins -= 50;
        nitroCount++;
        saveData();
        updateHUD();
        alert("Purchased 1 Nitro Bottle!");
    } else {
        alert("Not enough coins! You need 50 coins to buy Nitro.");
    }
}

function activateNitro() {
    if (nitroCount > 0 && !isNitroActive) {
        nitroCount--;
        isNitroActive = true;
        saveData();
        updateHUD();

        MAX_SPEED = NITRO_SPEED;
        player.speed = NITRO_SPEED;

        // Show 3D Flame Particles
        if (flameGroup) flameGroup.visible = true;

        // Nitro lasts for 2.5 seconds
        setTimeout(function() {
            MAX_SPEED = BASE_MAX_SPEED;
            isNitroActive = false;
            if (flameGroup) flameGroup.visible = false;
        }, 2500);
    }
}

// ==========================================
// 3. ENGINE & THREE.JS SCENE
// ==========================================
function updateColor() {
    var slider = document.getElementById("slider");
    if (slider) {
        slider.style.backgroundColor = "hsl(" + color + ", 100%, 50%)";
    }
}

function menu2() {
    var nameInput = document.getElementById("name");
    var playerName = nameInput ? nameInput.value.trim() : "";
    if (!playerName) playerName = "Racer" + Math.floor(Math.random() * 1000);
    
    player.name = playerName;
    player.color = color;

    var fore = document.getElementById("fore");
    if (fore) fore.style.display = "none";

    initEngine();
    initMultiplayer();
    updateHUD();
}

function initEngine() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Lighting
    var ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);

    // Ground Plane
    var groundGeo = new THREE.PlaneGeometry(600, 600);
    var groundMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Create Local Player Car with Flame Jets
    createCarMesh(player, true);

    // Input Listeners
    window.addEventListener('keydown', function(e) { 
        keys[e.key] = true; 
        if (e.code === 'Space' || e.key === ' ') {
            activateNitro();
        }
    });
    window.addEventListener('keyup', function(e) { keys[e.key] = false; });
    window.addEventListener('resize', onWindowResize);

    animate();
}

// Car Geometry Builder
function createCarMesh(pObj, isLocalPlayer) {
    var carGroup = new THREE.Group();

    // Body
    var bodyGeo = new THREE.BoxGeometry(1.5, 0.6, 2.8);
    var bodyMat = new THREE.MeshLambertMaterial({ color: new THREE.Color("hsl(" + (pObj.color || 0) + ", 100%, 50%)") });
    var body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.3;
    carGroup.add(body);

    // Cabin
    var cabinGeo = new THREE.BoxGeometry(1.2, 0.5, 1.3);
    var cabinMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    var cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.7, -0.2);
    carGroup.add(cabin);

    // Build 3D Exhaust Flames for Player Car
    if (isLocalPlayer) {
        flameGroup = new THREE.Group();
        
        var particleGeo = new THREE.ConeGeometry(0.18, 0.8, 6);
        particleGeo.rotateX(-Math.PI / 2); // Point exhaust backwards
        
        var flameMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
        var innerFlameMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });

        var leftFlame = new THREE.Mesh(particleGeo, flameMat);
        leftFlame.position.set(-0.4, 0.3, -1.7);

        var rightFlame = new THREE.Mesh(particleGeo, flameMat);
        rightFlame.position.set(0.4, 0.3, -1.7);

        var coreFlame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 6), innerFlameMat);
        coreFlame.geometry.rotateX(-Math.PI / 2);
        coreFlame.position.set(0, 0.3, -1.6);

        flameGroup.add(leftFlame);
        flameGroup.add(rightFlame);
        flameGroup.add(coreFlame);

        flameGroup.visible = false; // Hidden until Nitro is activated
        carGroup.add(flameGroup);
    }

    scene.add(carGroup);
    pObj.mesh = carGroup;
}

// ==========================================
// 4. ANIMATION LOOP & PHYSICS
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    // Acceleration & Reverse
    if (keys['ArrowUp'] || keys['w'] || keys['W']) {
        player.speed = Math.min(player.speed + ACCELERATION, MAX_SPEED);
    } else if (keys['ArrowDown'] || keys['s'] || keys['S']) {
        player.speed = Math.max(player.speed - ACCELERATION, -MAX_SPEED * 0.4);
    } else {
        player.speed *= FRICTION;
    }

    // Steering
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
        player.rot += TURN_SPEED * (player.speed >= 0 ? 1 : -1);
    }
    if (keys['ArrowRight'] || keys['d'] || keys['D']) {
        player.rot -= TURN_SPEED * (player.speed >= 0 ? 1 : -1);
    }

    // Flame flicker animation
    if (isNitroActive && flameGroup) {
        var scaleFlicker = 0.8 + Math.random() * 0.5;
        flameGroup.scale.set(scaleFlicker, scaleFlicker, scaleFlicker * 1.3);
    }

    // Move Car Position
    player.x += Math.sin(player.rot) * player.speed;
    player.z += Math.cos(player.rot) * player.speed;

    if (player.mesh) {
        player.mesh.position.set(player.x, 0, player.z);
        player.mesh.rotation.y = player.rot;
    }

    // Smooth Third-Person Camera
    camera.position.x = player.x - Math.sin(player.rot) * 8;
    camera.position.z = player.z - Math.cos(player.rot) * 8;
    camera.position.y = player.y + 4;
    camera.lookAt(player.x, player.y + 1, player.z);

    // Sync to Firebase
    syncPositionToFirebase();

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// 5. FIREBASE MULTIPLAYER
// ==========================================
var playerRef = null;

function initMultiplayer() {
    if (!database) return;

    var playersRef = database.ref('players');
    playerRef = playersRef.push();

    playerRef.onDisconnect().remove();

    playersRef.on('child_added', function(snapshot) {
        var id = snapshot.key;
        if (id !== playerRef.key) {
            var data = snapshot.val();
            opponents[id] = data;
            createCarMesh(opponents[id], false);
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
