// ============================================
// FIREBASE CONFIG - REPLACE WITH YOURS
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyCoBjhH_xRBAmoRDZF3Yo36fGChtfd6-Bw",
  authDomain: "dare-game-3a8a3.firebaseapp.com",
  databaseURL: "https://dare-game-3a8a3-default-rtdb.firebaseio.com",
  projectId: "dare-game-3a8a3",
  storageBucket: "dare-game-3a8a3.firebasestorage.app",
  messagingSenderId: "879130223792",
  appId: "1:879130223792:web:33d8bd45169527abed8775"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ============================================
// GAME DATA
// ============================================
const DARES = [
  "Do 10 pushups right now",
  "Speak in an accent for the next 2 rounds",
  "Let the other player post a story on your phone",
  "Sing the chorus of your favorite song out loud",
  "Show the last photo in your camera roll",
  "Do your best robot dance for 15 seconds",
  "Tell a joke. If they don't laugh, do 5 burpees",
  "Hold an ice cube in your hand until it melts",
  "Let them style your hair however they want",
  "Talk without closing your mouth for 1 minute",
  "Do 15 jumping jacks",
  "Let the group give you a new nickname for the night"
];

// ============================================
// STATE
// ============================================
let roomId = null;
let playerId = null;
let isHost = false;
let isMyTurn = true;
let currentAngle = 0;
let spinning = false;
let roomRef = null;
let gameStarted = false; // Prevents duplicate startGame() calls

// ============================================
// CANVAS SETUP
// ============================================
const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const colors = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'];

function drawWheel() {
  const size = canvas.width;
  const center = size / 2;
  const radius = center - 10;
  ctx.clearRect(0, 0, size, size);
  
  const slice = (Math.PI * 2) / DARES.length;
  
  DARES.forEach((dare, i) => {
    const start = currentAngle + i * slice;
    const end = start + slice;
    
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, end);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(start + slice / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(dare.length > 18 ? dare.substring(0,15)+"..." : dare, radius - 15, 5);
    ctx.restore();
  });
  
  ctx.beginPath();
  ctx.arc(center, center, 30, 0, Math.PI*2);
  ctx.fillStyle = "#fff";
  ctx.fill();
}

drawWheel();

// ============================================
// ROOM MANAGEMENT
// ============================================

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generatePlayerId() {
  return 'player_' + Math.random().toString(36).substring(2, 10);
}

function createRoom() {
  const btn = document.getElementById('createBtn');
  btn.disabled = true;
  btn.innerText = "Creating...";
  
  roomId = generateRoomCode();
  playerId = generatePlayerId();
  isHost = true;
  isMyTurn = true;
  gameStarted = false;
  
  roomRef = db.ref('rooms/' + roomId);
  
  // Host creates room with gameState: 'waiting'
  roomRef.set({
    hostId: playerId,
    guestId: null,
    currentTurn: playerId,
    gameState: 'waiting',
    lastSpin: null
  }).then(() => {
    document.getElementById('step1').style.display = 'none';
    document.getElementById('step2').style.display = 'block';
    document.getElementById('myCodeDisplay').innerText = roomId;
    updateStatus("Room created! Share the code.", "connected");
    
    // Host listens for guest joining
    roomRef.on('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      
      // FIXED: Only check if guestId exists AND gameState is still 'waiting'
      // Guest does NOT change gameState, only host does
      if (data.guestId && data.gameState === 'waiting' && !gameStarted) {
        gameStarted = true;
        updateStatus("Player joined! Starting game...", "connected");
        
        // Host updates gameState to 'playing'
        roomRef.update({
          gameState: 'playing'
        }).then(() => {
          startGame();
        });
      }
    });
  }).catch((err) => {
    console.error(err);
    btn.disabled = false;
    btn.innerText = "Create Room";
    updateStatus("Error creating room.", "error");
  });
}

function joinRoom() {
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (code.length < 4) return alert("Please enter a valid room code.");
  
  roomId = code;
  playerId = generatePlayerId();
  isHost = false;
  isMyTurn = false;
  gameStarted = false;
  
  roomRef = db.ref('rooms/' + roomId);
  
  updateStatus("Joining room...", "");
  
  // Check if room exists
  roomRef.once('value').then((snapshot) => {
    const data = snapshot.val();
    
    if (!data) {
      updateStatus("Room not found. Check code.", "error");
      return;
    }
    
    if (data.gameState !== 'waiting') {
      updateStatus("Game already in progress.", "error");
      return;
    }
    
    // FIXED: Guest ONLY sets guestId, does NOT change gameState
    // Host will detect this and update gameState to 'playing'
    roomRef.update({
      guestId: playerId
    }).then(() => {
      updateStatus("Waiting for host to start...", "loading");
      
      // Guest listens for gameState change (host will set it to 'playing')
      roomRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        
        // When host sets gameState to 'playing', guest starts the game
        if (data.gameState === 'playing' && !gameStarted) {
          gameStarted = true;
          updateStatus("Connected!", "connected");
          startGame();
        }
      });
    });
  }).catch((err) => {
    console.error(err);
    updateStatus("Error joining room.", "error");
  });
}

function startGame() {
  document.getElementById('connectPanel').style.display = 'none';
  document.getElementById('gameArea').classList.add('active');
  
  // Listen for game state changes (turns, spins)
  roomRef.on('value', handleGameStateChange);
  
  updateTurnIndicator();
}

function handleGameStateChange(snapshot) {
  const data = snapshot.val();
  if (!data) return;
  
  // Update whose turn it is
  if (data.currentTurn === playerId) {
    isMyTurn = true;
  } else {
    isMyTurn = false;
  }
  
  updateTurnIndicator();
  
  // Handle spin result
  if (data.lastSpin && data.lastSpin.dare) {
    // Show the dare if it's new (not yet processed by this player)
    if (!data.lastSpin.processedBy || !data.lastSpin.processedBy.includes(playerId)) {
      showResult(data.lastSpin.dare);
      
      // Mark as processed by this player
      const processedBy = data.lastSpin.processedBy || [];
      processedBy.push(playerId);
      roomRef.child('lastSpin/processedBy').set(processedBy);
    }
  }
}

// ============================================
// GAME LOGIC
// ============================================

function updateTurnIndicator() {
  const ind = document.getElementById('turnIndicator');
  const btn = document.getElementById('spinBtn');
  
  if (isMyTurn) {
    ind.innerText = "👉 YOUR TURN";
    ind.classList.add('visible');
    btn.disabled = false;
    btn.style.opacity = 1;
  } else {
    ind.innerText = "⏳ WAITING FOR OPPONENT...";
    ind.classList.add('visible');
    btn.disabled = true;
    btn.style.opacity = 0.5;
  }
}

function handleSpin() {
  if (spinning || !isMyTurn) return;
  
  spinning = true;
  document.getElementById('spinBtn').disabled = true;
  document.getElementById('resultCard').classList.remove('show');
  
  const spinAmount = Math.PI * 2 * (5 + Math.random() * 5);
  const duration = 4000;
  const startTime = performance.now();
  const startAngle = currentAngle;
  
  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    
    currentAngle = startAngle + spinAmount * ease;
    drawWheel();
    
    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      finishSpin();
    }
  }
  requestAnimationFrame(animate);
}

function finishSpin() {
  spinning = false;
  
  const slice = (Math.PI * 2) / DARES.length;
  const normalized = ((Math.PI * 2 - (currentAngle % (Math.PI * 2))) + Math.PI * 1.5) % (Math.PI * 2);
  const index = Math.floor(normalized / slice) % DARES.length;
  const result = DARES[index];
  
  showResult(result);
  
  // FIXED: Determine next player correctly
  // If I'm the host, next turn is guest (but we don't know guest's ID here)
  // Solution: Store both player IDs in the room, then alternate
  roomRef.once('value').then((snapshot) => {
    const data = snapshot.val();
    const nextPlayerId = (data.currentTurn === data.hostId) ? data.guestId : data.hostId;
    
    roomRef.update({
      currentTurn: nextPlayerId,
      lastSpin: {
        dare: result,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        processedBy: [playerId] // Mark as processed by the spinner
      }
    });
  });
  
  isMyTurn = false;
  updateTurnIndicator();
}

function showResult(dare) {
  document.getElementById('dareText').innerText = dare;
  document.getElementById('resultCard').classList.add('show');
}

function updateStatus(msg, type) {
  const el = document.getElementById('status');
  el.innerText = msg;
  el.className = 'status ' + (type || '');
}

function copyCode() {
  const code = document.getElementById('myCodeDisplay').innerText;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.querySelector('.btn-copy');
    const original = btn.innerText;
    btn.innerText = "✅ Copied!";
    setTimeout(() => btn.innerText = original, 2000);
  });
    }
