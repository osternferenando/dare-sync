// ============================================
// FIREBASE CONFIG (Fixed as requested)
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

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ============================================
// DEFAULT DATA
// ============================================
const DEFAULT_TRUTHS = [
  "What's your biggest fear?",
  "Who was your first crush?",
  "What's a secret you've never told anyone?",
  "What's the worst lie you've ever told?",
  "Who in this room do you trust the least?",
  "What's your guilty pleasure?"
];

const DEFAULT_DARES = [
  "Do 10 pushups right now",
  "Speak in an accent for 2 rounds",
  "Let the other player post a story",
  "Sing the chorus of a song out loud",
  "Show the last photo in your camera roll",
  "Do your best robot dance for 15s"
];

// ============================================
// STATE
// ============================================
let roomId = null;
let playerId = null;
let isHost = false;
let isMyTurn = true;
let roomRef = null;

let currentTruths = [...DEFAULT_TRUTHS];
let currentDares = [...DEFAULT_DARES];

let wheel1Angle = 0; // Truth/Dare wheel
let wheel2Angle = 0; // Prompt wheel
let isSpinning = false;
let lastSpinTime = 0;

// ============================================
// CANVAS SETUP
// ============================================
const canvas1 = document.getElementById('wheel1');
const ctx1 = canvas1.getContext('2d');
const canvas2 = document.getElementById('wheel2');
const ctx2 = canvas2.getContext('2d');

function drawWheel1() {
  const size = canvas1.width;
  const center = size / 2;
  const radius = center - 5;
  ctx1.clearRect(0, 0, size, size);
  
  const slices = ["TRUTH", "DARE"];
  const colors = ["#3b82f6", "#ec4899"];
  const sliceAngle = (Math.PI * 2) / 2;

  slices.forEach((text, i) => {
    const start = wheel1Angle + i * sliceAngle;
    ctx1.beginPath();
    ctx1.moveTo(center, center);
    ctx1.arc(center, center, radius, start, start + sliceAngle);
    ctx1.fillStyle = colors[i];
    ctx1.fill();
    ctx1.strokeStyle = "#fff";
    ctx1.lineWidth = 2;
    ctx1.stroke();

    ctx1.save();
    ctx1.translate(center, center);
    ctx1.rotate(start + sliceAngle / 2);
    ctx1.textAlign = "right";
    ctx1.fillStyle = "#fff";
    ctx1.font = "bold 14px sans-serif";
    ctx1.fillText(text, radius - 10, 5);
    ctx1.restore();
  });
  
  ctx1.beginPath();
  ctx1.arc(center, center, 20, 0, Math.PI*2);
  ctx1.fillStyle = "#fff";
  ctx1.fill();
}

function drawWheel2() {
  const size = canvas2.width;
  const center = size / 2;
  const radius = center - 5;
  ctx2.clearRect(0, 0, size, size);
  
  const items = isMyTurn || !isSpinning ? currentDares : currentTruths; // Fallback, actual pool determined at spin
  // For drawing, we just show a generic representation or the current active pool
  const pool = currentDares.length > 0 ? currentDares : ["Add Dares"];
  const numSlices = pool.length;
  const sliceAngle = (Math.PI * 2) / numSlices;
  const colors = ["#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe", "#e0e7ff", "#ddd6fe"];

  pool.forEach((text, i) => {
    const start = wheel2Angle + i * sliceAngle;
    ctx2.beginPath();
    ctx2.moveTo(center, center);
    ctx2.arc(center, center, radius, start, start + sliceAngle);
    ctx2.fillStyle = colors[i % colors.length];
    ctx2.fill();
    ctx2.strokeStyle = "#fff";
    ctx2.lineWidth = 2;
    ctx2.stroke();

    ctx2.save();
    ctx2.translate(center, center);
    ctx2.rotate(start + sliceAngle / 2);
    ctx2.textAlign = "right";
    ctx2.fillStyle = "#fff";
    ctx2.font = "bold 11px sans-serif";
    const displayText = text.length > 14 ? text.substring(0, 11) + "..." : text;
    ctx2.fillText(displayText, radius - 10, 4);
    ctx2.restore();
  });
  
  ctx2.beginPath();
  ctx2.arc(center, center, 20, 0, Math.PI*2);
  ctx2.fillStyle = "#fff";
  ctx2.fill();
}

drawWheel1();
drawWheel2();

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
  
  roomRef = db.ref('rooms/' + roomId);
  
  roomRef.set({
    hostId: playerId,
    guestId: null,
    gameState: 'waiting',
    currentTurn: playerId,
    settings: { truths: currentTruths, dares: currentDares }
  }).then(() => {
    document.getElementById('step1').style.display = 'none';
    document.getElementById('step2').style.display = 'block';
    document.getElementById('myCodeDisplay').innerText = roomId;
    updateStatus("Room created! Share the code.", "connected");
    
    roomRef.on('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      
      // Sync settings if they change
      if (data.settings) {
        currentTruths = data.settings.truths || DEFAULT_TRUTHS;
        currentDares = data.settings.dares || DEFAULT_DARES;
        drawWheel2();
      }

      if (data.guestId && data.gameState === 'waiting') {
        updateStatus("Player joined! Starting...", "connected");
        roomRef.update({ gameState: 'playing' }).then(() => startGame());
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
  
  roomRef = db.ref('rooms/' + roomId);
  updateStatus("Joining room...", "");
  
  roomRef.once('value').then((snapshot) => {
    const data = snapshot.val();
    if (!data) return updateStatus("Room not found.", "error");
    if (data.gameState !== 'waiting') return updateStatus("Game in progress.", "error");
    
    roomRef.update({ guestId: playerId }).then(() => {
      updateStatus("Waiting for host...", "");
      roomRef.on('value', (snapshot) => {
        const d = snapshot.val();
        if (!d) return;
        if (d.settings) {
          currentTruths = d.settings.truths || DEFAULT_TRUTHS;
          currentDares = d.settings.dares || DEFAULT_DARES;
          drawWheel2();
        }
        if (d.gameState === 'playing') {
          updateStatus("Connected!", "connected");
          startGame();
        }
      });
    });
  });
}

function startGame() {
  document.getElementById('connectPanel').style.display = 'none';
  document.getElementById('gameArea').classList.add('active');
  
  roomRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;
    isMyTurn = (data.currentTurn === playerId);
    updateTurnIndicator();
  });

  // Listen for synchronized spins
  roomRef.child('spinState').on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data || !data.isSpinning) return;
    if (data.startTime === lastSpinTime) return; // Already processed
    
    lastSpinTime = data.startTime;
    animateDualWheels(data);
  });
  
  updateTurnIndicator();
}

// ============================================
// SPIN LOGIC (SYNCHRONIZED)
// ============================================

function getSpinAmount(numSlices, targetIndex, currentAngle) {
  const sliceAngle = (Math.PI * 2) / numSlices;
  const N = 5 + Math.floor(Math.random() * 4); // 5 to 8 rotations
  const targetRotation = 1.5 * Math.PI + (N * 2 * Math.PI);
  const sliceCenter = (targetIndex * sliceAngle) + (sliceAngle / 2);
  let spinAmount = targetRotation - currentAngle - sliceCenter;
  while (spinAmount < Math.PI * 2 * 5) spinAmount += Math.PI * 2;
  return spinAmount;
}

function handleSpin() {
  if (isSpinning || !isMyTurn) return;
  
  // 1. Determine outcome
  const isTruth = Math.random() < 0.5;
  const pool = isTruth ? currentTruths : currentDares;
  const pIndex = Math.floor(Math.random() * pool.length);
  const resultPrompt = pool[pIndex];
  
  // 2. Calculate exact spin amounts to land on target
  const spin1 = getSpinAmount(2, isTruth ? 0 : 1, wheel1Angle);
  const spin2 = getSpinAmount(pool.length, pIndex, wheel2Angle);
  
  // 3. Push to Firebase to sync with other player
  const spinData = {
    isSpinning: true,
    spinAmount1: spin1,
    spinAmount2: spin2,
    resultType: isTruth ? 'TRUTH' : 'DARE',
    resultPrompt: resultPrompt,
    startTime: firebase.database.ServerValue.TIMESTAMP
  };
  
  roomRef.update({
    spinState: spinData,
    currentTurn: isHost ? (roomRef.child('guestId') ? 'guest' : 'host') : 'host' // Simplified turn flip
  });
  
  // Get actual next player ID for robust turn flipping
  roomRef.once('value').then(snap => {
    const d = snap.val();
    const nextId = (d.currentTurn === d.hostId) ? d.guestId : d.hostId;
    roomRef.update({ currentTurn: nextId });
  });

  // 4. Animate locally immediately
  animateDualWheels(spinData);
}

function animateDualWheels(spinData) {
  isSpinning = true;
  document.getElementById('spinBtn').disabled = true;
  document.getElementById('resultCard').classList.remove('show');
  
  const duration = 4000;
  const start1 = wheel1Angle;
  const start2 = wheel2Angle;
  const startTime = Date.now();

  function animate() {
    const elapsed = Date.now() - startTime;
    const t = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // Cubic ease-out

    wheel1Angle = start1 + spinData.spinAmount1 * ease;
    wheel2Angle = start2 + spinData.spinAmount2 * ease;

    drawWheel1();
    drawWheel2();

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      isSpinning = false;
      document.getElementById('resultType').innerText = spinData.resultType;
      document.getElementById('resultType').className = 'result-label ' + (spinData.resultType === 'TRUTH' ? 'truth' : 'dare');
      document.getElementById('dareText').innerText = spinData.resultPrompt;
      document.getElementById('resultCard').classList.add('show');
      
      roomRef.child('spinState/isSpinning').set(false);
      updateTurnIndicator();
    }
  }
  animate();
}

// ============================================
// UI HELPERS
// ============================================

function updateStatus(msg, type) {
  const el = document.getElementById('status');
  el.innerText = msg;
  el.className = 'status ' + (type || '');
}

function updateTurnIndicator() {
  const ind = document.getElementById('turnIndicator');
  const btn = document.getElementById('spinBtn');
  if (isMyTurn && !isSpinning) {
    ind.innerText = "👉 YOUR TURN";
    ind.classList.add('visible');
    btn.disabled = false;
    btn.style.opacity = 1;
  } else if (isSpinning) {
    ind.innerText = "🌀 SPINNING...";
    ind.classList.add('visible');
    btn.disabled = true;
    btn.style.opacity = 0.5;
  } else {
    ind.innerText = "⏳ OPPONENT'S TURN";
    ind.classList.add('visible');
    btn.disabled = true;
    btn.style.opacity = 0.5;
  }
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

// ============================================
// SETTINGS MODAL
// ============================================

function openSettings() {
  document.getElementById('truthsInput').value = currentTruths.join('\n');
  document.getElementById('daresInput').value = currentDares.join('\n');
  document.getElementById('settingsModal').classList.add('active');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('active');
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  
  if (tab === 'truths') {
    document.getElementById('truthsInput').style.display = 'block';
    document.getElementById('daresInput').style.display = 'none';
  } else {
    document.getElementById('truthsInput').style.display = 'none';
    document.getElementById('daresInput').style.display = 'block';
  }
}

function saveSettings() {
  const newTruths = document.getElementById('truthsInput').value.split('\n').map(s => s.trim()).filter(Boolean);
  const newDares = document.getElementById('daresInput').value.split('\n').map(s => s.trim()).filter(Boolean);
  
  if (newTruths.length === 0 || newDares.length === 0) {
    alert("You must have at least one Truth and one Dare!");
    return;
  }
  
  if (roomRef) {
    roomRef.child('settings').set({
      truths: newTruths,
      dares: newDares
    }).then(() => {
      currentTruths = newTruths;
      currentDares = newDares;
      drawWheel2();
      closeSettings();
    });
  } else {
    // Offline fallback
    currentTruths = newTruths;
    currentDares = newDares;
    drawWheel2();
    closeSettings();
  }
      }
