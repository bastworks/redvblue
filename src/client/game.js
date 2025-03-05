import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Game state and networking
let socket;
let gameState = {
    players: {},
    localPlayerId: null
};

// Three.js setup
let scene, camera, renderer, controls;
let playerMeshes = {};

// Performance monitoring
let fpsCounter = document.getElementById('fps-counter');
let lastFrameTime = performance.now();
let frameCount = 0;

// Initialize the game
function init() {
    initThreeJS();
    initWebSocket();
    animate();
}

// Set up Three.js scene
function initThreeJS() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 20);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);
    
    // Add orbit controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    // Add a grid helper
    const gridHelper = new THREE.GridHelper(50, 50);
    scene.add(gridHelper);
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

// Connect to WebSocket server
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        console.log('Connected to server');
        document.getElementById('connection-status').textContent = 'Connected';
        document.getElementById('connection-status').classList.remove('disconnected');
        document.getElementById('connection-status').classList.add('connected');
    };
    
    socket.onclose = () => {
        console.log('Disconnected from server');
        document.getElementById('connection-status').textContent = 'Disconnected';
        document.getElementById('connection-status').classList.remove('connected');
        document.getElementById('connection-status').classList.add('disconnected');
        
        // Try to reconnect after a delay
        setTimeout(initWebSocket, 3000);
    };
    
    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
            case 'init':
                handleInitMessage(message);
                break;
            case 'gameState':
                handleGameStateMessage(message);
                break;
            case 'playerJoined':
                handlePlayerJoinedMessage(message);
                break;
            case 'playerLeft':
                handlePlayerLeftMessage(message);
                break;
            default:
                console.log('Unknown message type:', message.type);
        }
    };
}

// Handle initial connection message
function handleInitMessage(message) {
    gameState.localPlayerId = message.playerId;
    gameState.players = message.players;
    
    // Create meshes for all existing players
    Object.keys(gameState.players).forEach(playerId => {
        createPlayerMesh(playerId);
    });
    
    // Update player count
    document.getElementById('player-count').textContent = Object.keys(gameState.players).length;
}

// Handle game state update message
function handleGameStateMessage(message) {
    // Update game state with new player positions
    Object.keys(message.players).forEach(playerId => {
        if (gameState.players[playerId]) {
            gameState.players[playerId] = message.players[playerId];
        }
    });
}

// Handle new player joined message
function handlePlayerJoinedMessage(message) {
    const { playerId, player } = message;
    gameState.players[playerId] = player;
    createPlayerMesh(playerId);
    
    // Update player count
    document.getElementById('player-count').textContent = Object.keys(gameState.players).length;
}

// Handle player left message
function handlePlayerLeftMessage(message) {
    const { playerId } = message;
    
    // Remove player from game state
    delete gameState.players[playerId];
    
    // Remove player mesh from scene
    if (playerMeshes[playerId]) {
        scene.remove(playerMeshes[playerId]);
        delete playerMeshes[playerId];
    }
    
    // Update player count
    document.getElementById('player-count').textContent = Object.keys(gameState.players).length;
}

// Create a mesh for a player
function createPlayerMesh(playerId) {
    const player = gameState.players[playerId];
    const isLocalPlayer = playerId === gameState.localPlayerId;
    
    // Create a different colored cube based on team
    const color = player.team === 'red' ? 0xff0000 : 0x0000ff;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ color });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(player.position.x, player.position.y, player.position.z);
    
    // Add wireframe for local player to distinguish it
    if (isLocalPlayer) {
        const wireframe = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            new THREE.LineBasicMaterial({ color: 0xffffff })
        );
        mesh.add(wireframe);
    }
    
    scene.add(mesh);
    playerMeshes[playerId] = mesh;
}

// Send player input to server
function sendPlayerInput(input) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'playerInput',
            input
        }));
    }
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update controls
    controls.update();
    
    // Update player meshes based on game state
    Object.keys(gameState.players).forEach(playerId => {
        const player = gameState.players[playerId];
        const mesh = playerMeshes[playerId];
        
        if (mesh) {
            mesh.position.set(player.position.x, player.position.y, player.position.z);
            mesh.rotation.y = player.rotation || 0;
        }
    });
    
    // Render scene
    renderer.render(scene, camera);
    
    // Update FPS counter
    frameCount++;
    const now = performance.now();
    const elapsed = now - lastFrameTime;
    
    if (elapsed >= 1000) {
        const fps = Math.round((frameCount * 1000) / elapsed);
        fpsCounter.textContent = fps;
        frameCount = 0;
        lastFrameTime = now;
    }
}

// Initialize the game when the page loads
window.addEventListener('load', init);

// Set up keyboard controls
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    
    // Send input to server
    const input = {
        forward: keys['w'] || keys['ArrowUp'] || false,
        backward: keys['s'] || keys['ArrowDown'] || false,
        left: keys['a'] || keys['ArrowLeft'] || false,
        right: keys['d'] || keys['ArrowRight'] || false,
        jump: keys[' '] || false
    };
    
    sendPlayerInput(input);
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
    
    // Send input to server
    const input = {
        forward: keys['w'] || keys['ArrowUp'] || false,
        backward: keys['s'] || keys['ArrowDown'] || false,
        left: keys['a'] || keys['ArrowLeft'] || false,
        right: keys['d'] || keys['ArrowRight'] || false,
        jump: keys[' '] || false
    };
    
    sendPlayerInput(input);
});
