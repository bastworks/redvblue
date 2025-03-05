import { serve } from 'bun';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../../public');
const clientDir = join(__dirname, '../client');

// Game state
const gameState = {
    players: {},
    lastUpdate: Date.now()
};

// Connected clients
const clients = new Map();

// Game settings
const TICK_RATE = 60; // Updates per second
const PLAYER_SPEED = 0.1;
const TEAMS = ['red', 'blue'];

// WebSocket server and HTTP server
const server = serve({
    port: 3000,
    fetch(req, server) {
        const url = new URL(req.url);
        
        // Handle WebSocket connections
        if (url.pathname === '/ws') {
            const upgraded = server.upgrade(req);
            if (!upgraded) {
                return new Response('Upgrade failed', { status: 400 });
            }
            return;
        }
        
        // Serve client-side JS files
        if (url.pathname.startsWith('/client/')) {
            const filePath = join(clientDir, url.pathname.replace('/client/', ''));
            return new Response(Bun.file(filePath));
        }
        
        // Serve static files from public directory
        const filePath = url.pathname === '/' 
            ? join(publicDir, 'index.html') 
            : join(publicDir, url.pathname);
            
        const file = Bun.file(filePath);
        return new Response(file);
    },
    websocket: {
        open(ws) {
            // Generate a unique player ID
            const playerId = generatePlayerId();
            ws.playerId = playerId;
            
            // Store client connection
            clients.set(playerId, ws);
            
            // Assign player to a team (balance teams)
            const team = assignTeam();
            
            // Create player in game state
            gameState.players[playerId] = {
                id: playerId,
                team,
                position: { x: 0, y: 0.5, z: 0 },
                rotation: 0,
                input: {
                    forward: false,
                    backward: false,
                    left: false,
                    right: false,
                    jump: false
                }
            };
            
            console.log(`Player ${playerId} (${team}) connected`);
            
            // Send initial game state to the new player
            ws.send(JSON.stringify({
                type: 'init',
                playerId,
                players: gameState.players
            }));
            
            // Notify all other players about the new player
            broadcastToOthers(playerId, {
                type: 'playerJoined',
                playerId,
                player: gameState.players[playerId]
            });
        },
        message(ws, message) {
            try {
                const data = JSON.parse(message);
                const playerId = ws.playerId;
                
                if (!playerId || !gameState.players[playerId]) {
                    return;
                }
                
                switch (data.type) {
                    case 'playerInput':
                        // Update player input
                        gameState.players[playerId].input = data.input;
                        break;
                    default:
                        console.log(`Unknown message type: ${data.type}`);
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        },
        close(ws) {
            const playerId = ws.playerId;
            
            if (playerId && gameState.players[playerId]) {
                console.log(`Player ${playerId} disconnected`);
                
                // Remove player from game state
                delete gameState.players[playerId];
                
                // Remove client connection
                clients.delete(playerId);
                
                // Notify all other players
                broadcastToAll({
                    type: 'playerLeft',
                    playerId
                });
            }
        }
    }
});

console.log(`Server running at http://localhost:3000`);

// Generate a unique player ID
function generatePlayerId() {
    return Math.random().toString(36).substring(2, 10);
}

// Assign a team to balance teams
function assignTeam() {
    const teamCounts = TEAMS.reduce((counts, team) => {
        counts[team] = 0;
        return counts;
    }, {});
    
    // Count players in each team
    Object.values(gameState.players).forEach(player => {
        teamCounts[player.team]++;
    });
    
    // Find team with fewest players
    return TEAMS.reduce((minTeam, team) => {
        return teamCounts[team] < teamCounts[minTeam] ? team : minTeam;
    }, TEAMS[0]);
}

// Broadcast message to all connected clients
function broadcastToAll(message) {
    const messageStr = JSON.stringify(message);
    for (const ws of clients.values()) {
        ws.send(messageStr);
    }
}

// Broadcast message to all clients except the sender
function broadcastToOthers(senderId, message) {
    const messageStr = JSON.stringify(message);
    for (const [playerId, ws] of clients.entries()) {
        if (playerId !== senderId) {
            ws.send(messageStr);
        }
    }
}

// Game loop
setInterval(() => {
    const now = Date.now();
    const deltaTime = now - gameState.lastUpdate;
    gameState.lastUpdate = now;
    
    // Update player positions based on input
    Object.values(gameState.players).forEach(player => {
        const { input } = player;
        
        // Calculate movement direction
        let dx = 0;
        let dz = 0;
        
        if (input.forward) dz -= PLAYER_SPEED;
        if (input.backward) dz += PLAYER_SPEED;
        if (input.left) dx -= PLAYER_SPEED;
        if (input.right) dx += PLAYER_SPEED;
        
        // Normalize diagonal movement
        if (dx !== 0 && dz !== 0) {
            const length = Math.sqrt(dx * dx + dz * dz);
            dx /= length;
            dz /= length;
            dx *= PLAYER_SPEED;
            dz *= PLAYER_SPEED;
        }
        
        // Update position
        player.position.x += dx * deltaTime;
        player.position.z += dz * deltaTime;
        
        // Update rotation if moving
        if (dx !== 0 || dz !== 0) {
            player.rotation = Math.atan2(dx, -dz);
        }
    });
    
    // Send game state update to all clients
    broadcastToAll({
        type: 'gameState',
        players: gameState.players
    });
}, 1000 / TICK_RATE);
