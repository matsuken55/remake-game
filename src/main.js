import { ALL_HANDS, BOARD_SIZE, COLOR_CODES, COLOR_LABELS, createInitialState, createJoker, evaluateBoard, hasEmptyCell, lockUnlockedDice, MAX_JOKERS, placeDie, rollDice, saveRanking, awardJokers } from './game.js';

const storage = { high: 'remakeDice.highScore', ranks: 'remakeDice.rankings' };
const state = createInitialState();
let gameOverSequence = 0;
let activeGameOverId = null;
let registeredGameOverId = null;
Object.assign(state, { highScore: loadHighScore(), rankings: loadRankings(), animating: false, dragging: null, rankRegistered: false });

const $ = s => document.querySelector(s);
const boardEl = $('#board'), trayEl = $('#tray'), rollButton = $('#roll'), scoreEl = $('#score'), highScoreEl = $('#highScore'), msgEl = $('#message'), jokerEl = $('#jokerWindow'), countEl = $('#jokerCountdown'), logEl = $('#log'), overEl = $('#gameOver'), rankingEl = $('#rankingList'), rulesDialog = $('#scoreDialog'), gameOverRestartButton = $('#gameOverRestart');

function loadHighScore() { return Number(localStorage.getItem(storage.high) || 0); }
function loadRankings() { return JSON.parse(localStorage.getItem(storage.ranks) || '[]'); }
function asset(die) { return die.joker ? 'assets/dice/JK.png' : `assets/dice/${COLOR_CODES[die.color]}${die.number}.png`; }
function dieElement(die) { const el = document.createElement('div'); el.className = `die ${die.color} ${die.locked ? 'locked' : 'unlocked'} ${die.joker ? 'joker' : ''}`; el.dataset.id = die.id; const img = document.createElement('img'); img.src = asset(die); img.alt = die.joker ? 'ジョーカー' : `${COLOR_LABELS[die.color]}${die.number}`; el.appendChild(img); if (die.locked) el.insertAdjacentHTML('beforeend', '<span class="lock">🔒</span>'); return el; }
function render() {
  boardEl.innerHTML = '';
  for (let r=0;r<BOARD_SIZE;r++) for (let c=0;c<BOARD_SIZE;c++) { const cell = document.createElement('div'); cell.className = 'cell'; cell.dataset.row = r; cell.dataset.col = c; const die = state.board[r][c]; if (die) { const d = dieElement(die); if (!die.locked && !state.animating) d.addEventListener('pointerdown', startDrag); cell.appendChild(d); } boardEl.appendChild(cell); }
  trayEl.innerHTML = ''; state.trayDice.filter(d => !isOnBoard(d.id)).forEach(die => { const slot = document.createElement('div'); slot.className = 'tray-slot'; const d = dieElement(die); if (!state.animating) d.addEventListener('pointerdown', startDrag); slot.appendChild(d); trayEl.appendChild(slot); });
  jokerEl.innerHTML = ''; for (let i=0;i<MAX_JOKERS;i++) { const slot = document.createElement('div'); slot.className = `joker-slot ${i < state.jokerStock ? 'filled' : ''}`; if (i < state.jokerStock) { const img = document.createElement('img'); img.src = 'assets/dice/JK.png'; img.alt = 'ジョーカー'; slot.appendChild(img); } else slot.textContent = '—'; if (i < state.jokerStock && !state.animating && !state.gameOver) slot.addEventListener('pointerdown', e => startDrag(e, createJoker())); jokerEl.appendChild(slot); }
  scoreEl.textContent = state.score; highScoreEl.textContent = state.highScore; countEl.textContent = state.jokerStock >= MAX_JOKERS ? 'MAX' : state.jokerCountdown; msgEl.textContent = state.message; rollButton.disabled = state.animating || state.gameOver; renderRankings(); }
function isOnBoard(id) { return state.board.flat().some(d => d?.id === id); }
function startDrag(event, newDie = null) { if (state.animating || state.gameOver) return; const original = event.currentTarget; const id = newDie?.id || original.dataset.id; state.dragging = { id, die: newDie || findDie(id), fromJoker: Boolean(newDie), ghost: original.cloneNode(true) }; state.dragging.ghost.classList.add('dragging'); document.body.appendChild(state.dragging.ghost); original.setPointerCapture?.(event.pointerId); moveGhost(event); window.addEventListener('pointermove', moveGhost); window.addEventListener('pointerup', dropDie, { once: true }); }
function findDie(id) { return state.trayDice.find(d => d.id === id) || state.board.flat().find(d => d?.id === id); }
function moveGhost(e) { if (!state.dragging) return; state.dragging.ghost.style.left = `${e.clientX - 38}px`; state.dragging.ghost.style.top = `${e.clientY - 38}px`; }
function nearestCell(x, y) { let best = null, dist = Infinity; document.querySelectorAll('.cell').forEach(cell => { const rect = cell.getBoundingClientRect(); const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2; const d = Math.hypot(cx - x, cy - y); if (d < dist) { dist = d; best = cell; } }); return dist < 95 ? best : null; }
function dropDie(e) { window.removeEventListener('pointermove', moveGhost); const drag = state.dragging; if (!drag) return; drag.ghost.remove(); const cell = nearestCell(e.clientX, e.clientY); if (cell) { const r = Number(cell.dataset.row), c = Number(cell.dataset.col); const occupied = state.board[r][c]; const same = occupied?.id === drag.id; if (!occupied || same) { removeFromBoard(drag.id); state.board = placeDie(state.board, r, c, drag.die); if (drag.fromJoker) state.jokerStock--; state.message = '未固定サイコロはROLLで固定されます。'; } } state.dragging = null; render(); }
function removeFromBoard(id) { for (let r=0;r<BOARD_SIZE;r++) for (let c=0;c<BOARD_SIZE;c++) if (state.board[r][c]?.id === id && !state.board[r][c].locked) state.board[r][c] = null; }
async function roll() { if (state.animating || state.gameOver) return; if (state.trayDice.length === 0) { state.trayDice = rollDice(); state.message = '現在のバッチを盤面へドラッグしてください。'; render(); return; } const unlocked = state.board.flat().filter(d => d && !d.locked); if (unlocked.length === 0) { state.message = 'サイコロを盤面に配置してください'; render(); return; } const locked = lockUnlockedDice(state.board); state.board = locked.board; state.trayDice = state.trayDice.filter(d => !locked.locked.some(x => x.id === d.id)); await resolveMatches(); if (state.trayDice.length === 0 && !state.gameOver) state.message = 'バッチ完了。次のROLLで新しい4個を生成します。'; render(); }
async function resolveMatches() { state.animating = true; render(); const matches = evaluateBoard(state.board); let cleared = false; for (const match of matches) { await showMatch(match); state.score += match.hand.points; Object.assign(state, awardJokers(state, match.hand.points)); if (match.hand.clearing) { cleared = true; for (const [r,c] of match.cells) state.board[r][c] = null; } addLog(`+${match.hand.points} ${match.label} ${match.hand.name}`); render(); await wait(180); } state.highScore = Math.max(state.highScore, state.score); localStorage.setItem(storage.high, String(state.highScore)); state.animating = false; if (matches.length === 0) addLog('役なし'); if (!cleared && !hasEmptyCell(state.board)) endGame(); }
function showMatch(match) { return new Promise(resolve => { match.cells.forEach(([r,c]) => boardEl.children[r*4+c]?.classList.add('flash')); msgEl.textContent = `+${match.hand.points} ${match.hand.name}`; setTimeout(resolve, 1000); }); }
const wait = ms => new Promise(r => setTimeout(r, ms));
function addLog(text) { const li = document.createElement('li'); li.textContent = text; logEl.prepend(li); }
function endGame() { state.gameOver = true; state.rankRegistered = false; activeGameOverId = ++gameOverSequence; overEl.hidden = false; state.message = 'ゲームオーバー。ランキングに登録してください。'; render(); }
function renderRankings() { rankingEl.innerHTML = ''; state.rankings.forEach((r,i) => { const li = document.createElement('li'); li.textContent = `${i+1}. ${r.name} ${r.score}`; rankingEl.appendChild(li); }); }
function resetToNewGame() {
  state.dragging?.ghost?.remove?.();
  const ranks = state.rankings, high = state.highScore;
  Object.assign(state, createInitialState(), { rankings: ranks, highScore: high, animating: false, dragging: null, rankRegistered: false });
  activeGameOverId = null;
  overEl.hidden = true;
  render();
}
function restartGame(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  resetToNewGame();
}
function registerRanking(event) {
  event.preventDefault();
  if (!state.gameOver || overEl.hidden || state.rankRegistered || activeGameOverId === null || registeredGameOverId === activeGameOverId) return;
  state.rankings = saveRanking(state.rankings, $('#playerName').value, state.score);
  localStorage.setItem(storage.ranks, JSON.stringify(state.rankings));
  state.rankRegistered = true;
  registeredGameOverId = activeGameOverId;
  resetToNewGame();
}
$('#rankForm').addEventListener('submit', registerRanking);
$('#restart').addEventListener('click', restartGame);
gameOverRestartButton.addEventListener('click', restartGame);
overEl.addEventListener('click', event => { if (event.target?.id === 'gameOverRestart') restartGame(event); });
$('#rules').addEventListener('click', () => rulesDialog.showModal());
$('#closeRules').addEventListener('click', () => rulesDialog.close());
rollButton.addEventListener('click', roll);
overEl.hidden = true;
render();

export const __testing = { state, endGame, restartGame, registerRanking };
