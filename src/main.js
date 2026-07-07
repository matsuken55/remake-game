import { BOARD_SIZE, CLEARING_HANDS, COLOR_CODES, COLOR_LABELS, DEFAULT_MODE, GAME_MODES, SCORING_HANDS, createInitialState, createJoker, evaluateBoard, hasEmptyCell, lockUnlockedDice, MAX_JOKERS, placeDie, rollBalancedDice, saveRanking, awardJokers } from './game.js';
import { getDisplayedRankings, getLocalRankings, saveLocalRanking, submitRemoteRanking } from './rankings.js';

const storage = {
  legacyHigh: 'remakeDice.highScore',
  legacyRanks: 'remakeDice.rankings',
  high: { normal: 'diceBatchGridHighNormal', easy: 'diceBatchGridHighEasy' },
  ranks: { normal: 'diceBatchGridRankingsNormal', easy: 'diceBatchGridRankingsEasy' },
  bgmEnabled: 'diceBatchGridBgmEnabled',
};
const state = createInitialState();
let rankingViewMode = DEFAULT_MODE;
let gameOverSequence = 0;
let activeGameOverId = null;
let registeredGameOverId = null;
Object.assign(state, { highScore: loadHighScore(state.mode), rankings: loadRankings(state.mode), animating: false, dragging: null, rankRegistered: false, started: false });

const $ = s => document.querySelector(s);
const boardEl = $('#board'), trayEl = $('#tray'), rollButton = $('#roll'), actionHintEl = $('#actionHint'), scoreEl = $('#score'), highScoreEl = $('#highScore'), modeLabelEl = $('#modeLabel'), msgEl = $('#message'), bgmStatusEl = $('#bgmStatus'), jokerEl = $('#jokerWindow'), countEl = $('#jokerCountdown'), startEl = $('#startScreen'), overEl = $('#gameOver'), rankingEl = $('#rankingList'), rankingViewEl = $('#rankingView'), rankingViewListEl = $('#rankingViewList'), rulesDialog = $('#scoreDialog'), howToDialog = $('#howToDialog'), gameOverRestartButton = $('#gameOverRestart'), scoreExamplesEl = $('#scoreExamples'), bgmToggleEl = $('#bgmToggle'), gameOverMessageEl = $('#gameOverMessage'), playerNameEl = $('#playerName'), rankSubmitEl = $('#rankSubmit');

function formatPoints(value) { return `${value}点`; }
function formatSignedPoints(value) { return `+${value}点`; }
function formatJokerCountdown(value) { return value === 'MAX' ? value : formatPoints(value); }

const bgm = {
  audio: typeof Audio === 'function' ? new Audio('assets/audio/bgm.mp3') : null,
  enabled: localStorage.getItem(storage.bgmEnabled) !== 'off',
  unlocked: false,
  missing: false,
};
if (bgm.audio) {
  bgm.audio.loop = true;
  bgm.audio.volume = 0.35;
  bgm.audio.preload = 'auto';
  bgm.audio.addEventListener('ended', () => { bgm.audio.currentTime = 0; playBgm(); });
  bgm.audio.addEventListener('error', () => { bgm.missing = true; updateBgmUi('BGMファイルが見つかりません'); });
}
function updateBgmUi(status = '') { if (bgmToggleEl) bgmToggleEl.textContent = `BGM ${bgm.enabled ? 'ON' : 'OFF'}`; if (bgmStatusEl) bgmStatusEl.textContent = status; }
function playBgm() { if (!bgm.enabled || !bgm.audio) return; bgm.audio.play?.().catch(() => { bgm.missing = true; updateBgmUi('BGMファイルが見つかりません'); }); }
function unlockBgm() { bgm.unlocked = true; playBgm(); }
function toggleBgm() { bgm.enabled = !bgm.enabled; localStorage.setItem(storage.bgmEnabled, bgm.enabled ? 'on' : 'off'); if (!bgm.enabled) bgm.audio?.pause?.(); else if (bgm.unlocked) playBgm(); updateBgmUi(bgm.missing ? 'BGMファイルが見つかりません' : ''); }

function modeStorageKey(kind, mode) { return storage[kind][GAME_MODES[mode] ? mode : DEFAULT_MODE]; }
function loadRankings(mode) {
  const rankings = getLocalRankings(localStorage, modeStorageKey('ranks', mode));
  if (mode === 'normal' && rankings.length === 0) return getLocalRankings(localStorage, storage.legacyRanks);
  return rankings;
}
function loadHighScore(mode) {
  const stored = Number(localStorage.getItem(modeStorageKey('high', mode)) || 0);
  if (stored || mode !== 'normal') return stored;
  const legacyHigh = Number(localStorage.getItem(storage.legacyHigh) || 0);
  const legacyRankHigh = Math.max(0, ...loadRankings('normal').map(r => Number(r.score) || 0));
  return Math.max(legacyHigh, legacyRankHigh);
}
function saveHighScore(mode, score) { localStorage.setItem(modeStorageKey('high', mode), String(score)); }
function asset(die) { return die.joker ? 'assets/dice/JK.png' : `assets/dice/${COLOR_CODES[die.color]}${die.number}.png`; }
function dieElement(die) { const el = document.createElement('div'); el.className = `die ${die.color} ${die.locked ? 'locked' : 'unlocked'} ${die.joker ? 'joker' : ''}`; el.dataset.id = die.id; const img = document.createElement('img'); img.src = asset(die); img.alt = die.joker ? 'ジョーカー' : `${COLOR_LABELS[die.color]}${die.number}`; el.appendChild(img); if (die.locked) el.insertAdjacentHTML('beforeend', '<span class="lock">🔒</span>'); return el; }
function isRankedIn(score, rankings) { return rankings.length < 15 || score > (Number(rankings[14]?.score) || 0); }
function updateActionButton() { const hasStock = state.trayDice.some(d => !isOnBoard(d.id)); const hasUnlocked = state.board.flat().some(d => d && !d.locked); const isRoll = !hasStock && !hasUnlocked; rollButton.textContent = isRoll ? '補充' : '確定'; if (actionHintEl) actionHintEl.textContent = isRoll ? '補充：サイコロを4つ出します' : '確定：置いたサイコロをロックして判定します'; }
function render() {
  boardEl.innerHTML = '';
  for (let r=0;r<BOARD_SIZE;r++) for (let c=0;c<BOARD_SIZE;c++) { const cell = document.createElement('div'); cell.className = 'cell'; cell.dataset.row = r; cell.dataset.col = c; const die = state.board[r][c]; if (die) { const d = dieElement(die); if (!die.locked && !state.animating) d.addEventListener('pointerdown', startDrag); cell.appendChild(d); } boardEl.appendChild(cell); }
  trayEl.innerHTML = ''; state.trayDice.filter(d => !isOnBoard(d.id)).forEach(die => { const slot = document.createElement('div'); slot.className = 'tray-slot'; const d = dieElement(die); if (!state.animating) d.addEventListener('pointerdown', startDrag); slot.appendChild(d); trayEl.appendChild(slot); });
  jokerEl.innerHTML = ''; for (let i=0;i<MAX_JOKERS;i++) { const slot = document.createElement('div'); slot.className = `joker-slot ${i < state.jokerStock ? 'filled' : ''}`; if (i < state.jokerStock) { const img = document.createElement('img'); img.src = 'assets/dice/JK.png'; img.alt = 'ジョーカー'; slot.appendChild(img); } else slot.textContent = '—'; if (i < state.jokerStock && !state.animating && !state.gameOver) slot.addEventListener('pointerdown', e => startDrag(e, createJoker())); jokerEl.appendChild(slot); }
  scoreEl.textContent = formatPoints(state.score); highScoreEl.textContent = formatPoints(state.highScore); modeLabelEl.textContent = GAME_MODES[state.mode].label; countEl.textContent = formatJokerCountdown(state.jokerStock >= MAX_JOKERS ? 'MAX' : state.jokerCountdown); msgEl.textContent = state.message; rollButton.disabled = !state.started || state.animating || state.gameOver; updateActionButton(); renderRankings(); }
function isOnBoard(id) { return state.board.flat().some(d => d?.id === id); }
function startDrag(event, newDie = null) { if (state.animating || state.gameOver) return; event.preventDefault?.(); state.dragging?.ghost?.remove?.(); const original = event.currentTarget; const id = newDie?.id || original.dataset.id; const die = newDie || findDie(id); if (!die || die.locked) return; state.dragging = { id, die, fromJoker: Boolean(newDie), ghost: dieElement(die) }; state.dragging.ghost.classList.add('dragging'); document.body.appendChild(state.dragging.ghost); original.setPointerCapture?.(event.pointerId); moveGhost(event); window.addEventListener('pointermove', moveGhost); window.addEventListener('pointerup', dropDie, { once: true }); window.addEventListener('pointercancel', cancelDrag, { once: true }); }
function findDie(id) { return state.trayDice.find(d => d.id === id) || state.board.flat().find(d => d?.id === id); }
function moveGhost(e) { if (!state.dragging) return; state.dragging.ghost.style.left = `${e.clientX}px`; state.dragging.ghost.style.top = `${e.clientY}px`; state.dragging.ghost.style.transform = 'translate(-50%, -50%)'; }
function nearestCell(x, y) { let best = null, dist = Infinity; document.querySelectorAll('.cell').forEach(cell => { const rect = cell.getBoundingClientRect(); const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2; const d = Math.hypot(cx - x, cy - y); if (d < dist) { dist = d; best = cell; } }); return dist < 95 ? best : null; }
function cleanupDrag() { window.removeEventListener('pointermove', moveGhost); state.dragging?.ghost?.remove?.(); }
function cancelDrag() { cleanupDrag(); state.dragging = null; render(); }
function dropDie(e) { cleanupDrag(); const drag = state.dragging; if (!drag) return; const cell = nearestCell(e.clientX, e.clientY); if (cell) { const r = Number(cell.dataset.row), c = Number(cell.dataset.col); const occupied = state.board[r][c]; const same = occupied?.id === drag.id; if (!occupied || same || (drag.die.joker && occupied.locked && !occupied.joker)) { removeFromBoard(drag.id); state.board = placeDie(state.board, r, c, drag.die); if (drag.fromJoker) state.jokerStock--; state.message = '未固定サイコロは確定で固定されます。'; } } state.dragging = null; render(); }
function removeFromBoard(id) { for (let r=0;r<BOARD_SIZE;r++) for (let c=0;c<BOARD_SIZE;c++) if (state.board[r][c]?.id === id && !state.board[r][c].locked) state.board[r][c] = null; }
async function roll() { if (state.animating || state.gameOver) return; const hasStock = state.trayDice.some(d => !isOnBoard(d.id)); const unlocked = state.board.flat().filter(d => d && !d.locked); if (!hasStock && unlocked.length === 0) { state.trayDice = rollBalancedDice(state.previousBatchDice); state.previousBatchDice = state.trayDice.map(d => ({ ...d })); state.message = 'ストックを盤面へドラッグしてください。'; render(); return; } if (unlocked.length === 0) { state.message = 'サイコロを配置してください'; render(); return; } const locked = lockUnlockedDice(state.board); state.board = locked.board; state.trayDice = state.trayDice.filter(d => !locked.locked.some(x => x.id === d.id)); await resolveMatches(locked.locked.map(d => d.id)); if (state.trayDice.length === 0 && !state.gameOver) state.message = 'ストック完了。次は補充で新しい4個を生成します。'; render(); }
async function resolveMatches(lockedIds) { state.animating = true; render(); const matches = evaluateBoard(state.board, lockedIds); let cleared = false; for (const match of matches) { await showMatch(match); state.score += match.hand.points; Object.assign(state, awardJokers(state, match.hand.points)); if (match.hand.clearing) { cleared = true; for (const [r,c] of match.cells) state.board[r][c] = null; } addLog(`${formatSignedPoints(match.hand.points)} ${match.label} ${match.hand.name}`); render(); await wait(120); } state.highScore = Math.max(state.highScore, state.score); saveHighScore(state.mode, state.highScore); state.animating = false; if (matches.length === 0) addLog('役なし'); if (!cleared && !hasEmptyCell(state.board)) endGame(); }
function showMatch(match) { return new Promise(resolve => { const cells = match.cells.map(([r,c]) => boardEl.children[r*4+c]).filter(Boolean); cells.forEach(cell => cell.classList.add('flash')); showScorePopup(match, formatSignedPoints(match.hand.points)); msgEl.textContent = `${formatSignedPoints(match.hand.points)} ${match.hand.name}`; setTimeout(resolve, 520); }); }
function showScorePopup(match, text) { const popup = document.createElement('div'); popup.className = 'score-popup'; popup.textContent = text; const boardRect = boardEl.getBoundingClientRect(); const centers = match.cells.map(([r,c]) => { const rect = boardEl.children[r*4+c].getBoundingClientRect(); return { x: rect.left + rect.width / 2 - boardRect.left, y: rect.top + rect.height / 2 - boardRect.top }; }); popup.style.left = `${centers.reduce((sum, p) => sum + p.x, 0) / centers.length}px`; popup.style.top = `${centers.reduce((sum, p) => sum + p.y, 0) / centers.length}px`; boardEl.appendChild(popup); setTimeout(() => popup.remove(), 520); }
const wait = ms => new Promise(r => setTimeout(r, ms));
function addLog(text) { console.info(`[game] ${text}`); }
function closeGameOverModal() { overEl.hidden = true; overEl.setAttribute?.('aria-hidden', 'true'); overEl.style.display = 'none'; }
function openGameOverModal() { overEl.hidden = false; overEl.setAttribute?.('aria-hidden', 'false'); overEl.style.display = ''; }
function setGameOverRankEligible(eligible) { playerNameEl.hidden = !eligible; rankSubmitEl.hidden = !eligible; gameOverMessageEl.textContent = eligible ? 'ランキング上位15位以内です。名前を登録できます。' : `ランキング圏外でした\nスコア：${formatPoints(state.score)}`; }
async function endGame() { state.gameOver = true; state.rankRegistered = false; activeGameOverId = ++gameOverSequence; openGameOverModal(); setGameOverRankEligible(false); state.message = 'ゲームオーバー。ランキングを確認しています。'; render(); const rankings = await renderDisplayedRankings(state.mode, rankingEl); const eligible = isRankedIn(state.score, rankings); setGameOverRankEligible(eligible); state.message = eligible ? 'ゲームオーバー。ランキングに登録してください。' : 'ゲームオーバー。ランキング圏外でした。'; msgEl.textContent = state.message; }
function fillRankingList(listEl, rankings = state.rankings) { listEl.innerHTML = ''; rankings.slice(0, 15).forEach((r,i) => { const li = document.createElement('li'); li.textContent = `${i+1}. ${r.name} ${formatPoints(r.score)}`; listEl.appendChild(li); }); }
function renderRankings() { fillRankingList(rankingEl, state.rankings); fillRankingList(rankingViewListEl, loadRankings(rankingViewMode)); }
async function renderDisplayedRankings(mode = rankingViewMode, listEl = rankingViewListEl) { const local = loadRankings(mode).slice(0, 15); fillRankingList(listEl, local); if (!document.head && !document.body) return local; const rankings = (await getDisplayedRankings(mode, local)).slice(0, 15); fillRankingList(listEl, rankings); return rankings; }
function renderScoreExamples() { const examples = { 'same-color-same-number': ['r1','r1','r1','r1'], 'same-color-straight': ['b1','b2','b3','b4'], 'rainbow-same-number': ['r2','b2','y2','g2'], 'rainbow-straight': ['r1','b2','y3','g4'], 'same-color': ['g1','g2','g3','g4'], 'same-number': ['r4','b4','y4','g4'], 'two-color-pairs': ['r1','r3','b2','b4'], 'two-number-pairs': ['r1','b1','y3','g3'], rainbow: ['r1','b3','y2','g4'], straight: ['r1','b2','y3','g4'] }; const descriptions = { 'same-color-same-number': '色と数字が4つ同じ', 'same-color-straight': '同じ色で数字が1,2,3,4', 'rainbow-same-number': '4色すべて違い、数字が4つ同じ', 'rainbow-straight': '4色すべて違い、数字が1,2,3,4', 'same-color': '色だけが4つ同じ', 'same-number': '数字だけが4つ同じ', 'two-color-pairs': '色が2色ずつ', 'two-number-pairs': '数字が2種類ずつ', rainbow: '4色すべて違う', straight: '数字が1,2,3,4' }; scoreExamplesEl.innerHTML = ''; const renderSection = (title, hands, resultText) => { const section = document.createElement('section'); section.className = 'score-section'; const heading = document.createElement('h3'); heading.textContent = title; section.appendChild(heading); hands.forEach(hand => { const row = document.createElement('div'); row.className = 'score-row'; const dice = document.createElement('div'); dice.className = 'mini-dice'; examples[hand.id].forEach(name => { const img = document.createElement('img'); img.src = `assets/dice/${name}.png`; img.alt = name; dice.appendChild(img); }); const label = document.createElement('strong'); label.textContent = descriptions[hand.id] || hand.name; const meta = document.createElement('span'); meta.textContent = `${hand.points}点 / ${resultText}`; row.appendChild(dice); row.appendChild(label); row.appendChild(meta); section.appendChild(row); }); scoreExamplesEl.appendChild(section); }; renderSection('消える組み合わせ（役）', CLEARING_HANDS, '消える'); renderSection('消えない加点', SCORING_HANDS, '消えない'); }
function startNewGame(mode = state.mode, showStart = false) { state.dragging?.ghost?.remove?.(); closeGameOverModal(); const next = createInitialState(mode); Object.assign(state, next, { rankings: loadRankings(next.mode), highScore: loadHighScore(next.mode), animating: false, dragging: null, rankRegistered: false, started: !showStart }); activeGameOverId = null; playerNameEl.value = ''; startEl.hidden = !showStart; startEl.setAttribute?.('aria-hidden', showStart ? 'false' : 'true'); startEl.style.display = showStart ? '' : 'none'; render(); }
function selectedStartMode() { return document.querySelector('input[name="gameMode"]:checked')?.value || DEFAULT_MODE; }
function startSelectedGame() { unlockBgm(); startNewGame(selectedStartMode(), false); }
const resetToNewGame = startNewGame;
function restartGame(event) { event?.preventDefault?.(); event?.stopPropagation?.(); resetToNewGame(); }
function registerRanking(event) { event.preventDefault(); if (playerNameEl.hidden || !state.gameOver || overEl.hidden || state.rankRegistered || activeGameOverId === null || registeredGameOverId === activeGameOverId) return; const mode = state.mode; const name = playerNameEl.value; const score = state.score; state.rankings = saveRanking(state.rankings, name, score); saveLocalRanking(localStorage, modeStorageKey('ranks', mode), state.rankings); state.rankRegistered = true; registeredGameOverId = activeGameOverId; resetToNewGame(); submitRemoteRanking(mode, name, score).catch(() => { state.message = 'オンラインランキング送信に失敗しました'; if (typeof document !== 'undefined') render(); }); }
$('#rankForm').addEventListener('submit', registerRanking);
$('#restart').addEventListener('click', restartGame);
gameOverRestartButton.addEventListener('click', restartGame);
overEl.addEventListener('click', event => { if (event.target?.id === 'gameOverRestart') restartGame(event); });
$('#howToPlay').addEventListener('click', () => howToDialog.showModal());
$('#howToPlayStart').addEventListener('click', () => howToDialog.showModal());
$('#closeHowTo').addEventListener('click', () => howToDialog.close());
$('#rules').addEventListener('click', () => rulesDialog.showModal());
$('#closeRules').addEventListener('click', () => rulesDialog.close());
$('#rankingButton').addEventListener('click', () => { rankingViewMode = state.mode; renderRankings(); rankingViewEl.showModal(); renderDisplayedRankings(rankingViewMode); });
$('#rankingNormal').addEventListener('click', () => { rankingViewMode = 'normal'; renderDisplayedRankings(rankingViewMode); });
$('#rankingEasy').addEventListener('click', () => { rankingViewMode = 'easy'; renderDisplayedRankings(rankingViewMode); });
$('#startGame').addEventListener('click', startSelectedGame);
$('#closeRankingView').addEventListener('click', () => rankingViewEl.close());
rollButton.addEventListener('click', event => { unlockBgm(); roll(event); });
bgmToggleEl?.addEventListener('click', toggleBgm);
renderScoreExamples();
updateBgmUi();
startNewGame(DEFAULT_MODE, true);

export const __testing = { state, endGame, restartGame, registerRanking, startNewGame, startDrag, dropDie, cancelDrag };
