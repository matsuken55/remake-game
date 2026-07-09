export const COLORS = ['red', 'blue', 'yellow', 'green'];
export const NUMBERS = [1, 2, 3, 4];
export const BOARD_SIZE = 4;
export const JOKER_THRESHOLDS = {
  easy: [80, 130, 190, 260],
  normal: [120, 200, 300, 420],
};
export const JOKER_THRESHOLD_INCREMENTS = { easy: 80, normal: 140 };
export const GAME_MODES = { normal: { label: 'NORMAL' }, easy: { label: 'EASY' } };
export const DEFAULT_MODE = 'normal';
export const JOKER_THRESHOLD = JOKER_THRESHOLDS.normal[0];
export const MAX_JOKERS = 2;

export const COLOR_LABELS = { red: '赤', blue: '青', yellow: '黄', green: '緑', joker: 'J' };
export const COLOR_CODES = { red: 'r', blue: 'b', yellow: 'y', green: 'g' };

export const CLEARING_HANDS = [
  { id: 'same-color-same-number', name: '同色同数字4個', points: 240 },
  { id: 'same-color-straight', name: '同色1-4', points: 200 },
  { id: 'rainbow-same-number', name: '4色同数字', points: 180 },
  { id: 'rainbow-straight', name: '4色1-4', points: 160 },
];
export const SCORING_HANDS = [
  { id: 'same-color', name: '色4個', points: 40 },
  { id: 'same-number', name: '数字4個', points: 40 },
  { id: 'two-color-pairs', name: '色2色x2個', points: 25 },
  { id: 'two-number-pairs', name: '数字2種類x2個', points: 25 },
  { id: 'rainbow', name: '4色', points: 20 },
  { id: 'straight', name: '数字1-4', points: 20 },
];
export const ALL_HANDS = [...CLEARING_HANDS, ...SCORING_HANDS];

let nextId = 1;
export function resetIds() { nextId = 1; }
export function createEmptyBoard() { return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null)); }
export function createDie(color, number, joker = false) { return { id: `die-${nextId++}`, color: joker ? 'joker' : color, number: joker ? 0 : number, joker, locked: false, source: 'batch' }; }
export function createJoker() { return { ...createDie('joker', 0, true), source: 'joker' }; }
export function rollDice(random = Math.random) { return Array.from({ length: 4 }, () => createDie(COLORS[Math.floor(random() * COLORS.length)], NUMBERS[Math.floor(random() * NUMBERS.length)])); }
export function getNextJokerThreshold(mode = DEFAULT_MODE, jokerRefillCount = 0) {
  const selectedMode = GAME_MODES[mode] ? mode : DEFAULT_MODE;
  const thresholds = JOKER_THRESHOLDS[selectedMode];
  const count = Math.max(0, Number(jokerRefillCount) || 0);
  if (count < thresholds.length) return thresholds[count];
  return thresholds[thresholds.length - 1] + (count - thresholds.length + 1) * JOKER_THRESHOLD_INCREMENTS[selectedMode];
}
export function createInitialState(mode = DEFAULT_MODE) { const selectedMode = GAME_MODES[mode] ? mode : DEFAULT_MODE; const jokerRefillCount = 0; const jokerThreshold = getNextJokerThreshold(selectedMode, jokerRefillCount); return { mode: selectedMode, jokerThreshold, jokerRefillCount, board: createEmptyBoard(), trayDice: [], previousBatchDice: [], jokerStock: 0, jokerCountdown: jokerThreshold, score: 0, highScore: 0, rankings: [], gameOver: false, message: '補充で4つのサイコロをストックしてください。' }; }

export function getGroups() {
  const groups = [];
  for (let r = 0; r < BOARD_SIZE; r++) groups.push({ type: 'row', label: `横${r + 1}`, cells: [[r,0],[r,1],[r,2],[r,3]] });
  for (let c = 0; c < BOARD_SIZE; c++) groups.push({ type: 'column', label: `縦${c + 1}`, cells: [[0,c],[1,c],[2,c],[3,c]] });
  groups.push({ type: 'diagonal', label: '斜めA', cells: [[0,0],[1,1],[2,2],[3,3]] }, { type: 'diagonal', label: '斜めB', cells: [[0,3],[1,2],[2,1],[3,0]] });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) groups.push({ type: 'block', label: `2x2 ${r + 1}-${c + 1}`, cells: [[r,c],[r,c+1],[r+1,c],[r+1,c+1]] });
  groups.push({ type: 'corners', label: '四隅', cells: [[0,0],[0,3],[3,0],[3,3]] });
  return groups;
}
function counts(values) { const map = new Map(); for (const value of values) map.set(value, (map.get(value) || 0) + 1); return [...map.values()].sort((a,b)=>b-a); }
function isStraight(dice) { return dice.map(d => d.number).sort().join(',') === '1,2,3,4'; }
function canAssign(dice, predicate) { const jokers = dice.filter(d => d.joker).length; const fixed = dice.filter(d => !d.joker); function backtrack(i, current) { if (i === jokers) return predicate([...fixed, ...current]); for (const color of COLORS) for (const number of NUMBERS) if (backtrack(i + 1, [...current, { color, number, joker: false }])) return true; return false; } return backtrack(0, []); }
const predicates = {
  'same-color-same-number': dice => dice.every(d => d.color === dice[0].color && d.number === dice[0].number),
  'same-color-straight': dice => dice.every(d => d.color === dice[0].color) && isStraight(dice),
  'rainbow-same-number': dice => new Set(dice.map(d => d.color)).size === 4 && dice.every(d => d.number === dice[0].number),
  'rainbow-straight': dice => new Set(dice.map(d => d.color)).size === 4 && isStraight(dice),
  'same-color': dice => dice.every(d => d.color === dice[0].color),
  'same-number': dice => dice.every(d => d.number === dice[0].number),
  'two-color-pairs': dice => counts(dice.map(d => d.color)).join(',') === '2,2',
  'two-number-pairs': dice => counts(dice.map(d => d.number)).join(',') === '2,2',
  rainbow: dice => new Set(dice.map(d => d.color)).size === 4,
  straight: isStraight,
};
export function evaluateDice(dice) { if (dice.length !== 4) return null; for (const hand of ALL_HANDS) if (canAssign(dice, predicates[hand.id])) return { ...hand, clearing: CLEARING_HANDS.some(h => h.id === hand.id) }; return null; }
export function hasScoringCandidate(dice) {
  if (dice.length < 4) return false;
  for (let a = 0; a < dice.length - 3; a++) for (let b = a + 1; b < dice.length - 2; b++) for (let c = b + 1; c < dice.length - 1; c++) for (let d = c + 1; d < dice.length; d++) {
    if (evaluateDice([dice[a], dice[b], dice[c], dice[d]])) return true;
  }
  return false;
}
export function rollBalancedDice(previousBatch = [], random = Math.random) {
  if (!previousBatch.length) return rollDice(random);
  for (let tries = 0; tries < 100; tries++) {
    const batch = rollDice(random);
    if (hasScoringCandidate([...previousBatch, ...batch])) return batch;
  }
  const numbers = [1, 2, 3, 4];
  return numbers.map(number => createDie('red', number));
}
export function evaluateBoard(board, triggeringIds = null) { const matches = []; const triggerSet = triggeringIds ? new Set(triggeringIds) : null; for (const group of getGroups()) { const dice = group.cells.map(([r,c]) => board[r][c]); const hasTrigger = triggerSet ? dice.some(d => d && triggerSet.has(d.id)) : dice.some(d => d?.locked); if (dice.every(Boolean) && hasTrigger) { const hand = evaluateDice(dice); if (hand) matches.push({ ...group, hand }); } } return matches; }
function cloneDie(die) { return die ? { ...die, underlyingDie: cloneDie(die.underlyingDie) } : null; }
export function cloneBoard(board) { return board.map(row => row.map(cloneDie)); }
export function moveDie(board, dieId, row, col) { const next = cloneBoard(board); let die = null; for (let r=0;r<BOARD_SIZE;r++) for (let c=0;c<BOARD_SIZE;c++) if (next[r][c]?.id === dieId) { if (next[r][c].locked) return { board, moved: false }; die = next[r][c]; next[r][c] = null; } if (next[row][col]) return { board, moved: false }; next[row][col] = die; return { board: next, moved: true }; }
export function placeDie(board, row, col, die) {
  const occupied = board[row][col];
  const canOverwriteLockedNormal = die?.joker && occupied?.locked && !occupied?.joker;
  if (occupied && !canOverwriteLockedNormal) throw new Error('Cell is already occupied');
  const next = cloneBoard(board);
  next[row][col] = { ...die, locked: false, ...(canOverwriteLockedNormal ? { underlyingDie: cloneDie(occupied) } : {}) };
  return next;
}
export function lockUnlockedDice(board) { const next = cloneBoard(board); const locked = []; for (let r=0;r<BOARD_SIZE;r++) for (let c=0;c<BOARD_SIZE;c++) if (next[r][c] && !next[r][c].locked) { delete next[r][c].underlyingDie; next[r][c].locked = true; locked.push(next[r][c]); } return { board: next, locked }; }
export function hasEmptyCell(board) { return board.some(row => row.some(cell => cell === null)); }
export function awardJokers(state, points) {
  let countdown = state.jokerCountdown ?? getNextJokerThreshold(state.mode, state.jokerRefillCount);
  let stock = state.jokerStock;
  let refillCount = state.jokerRefillCount || 0;
  if (stock >= MAX_JOKERS) return { jokerStock: MAX_JOKERS, jokerCountdown: 0, jokerRefillCount: refillCount, jokerThreshold: getNextJokerThreshold(state.mode, refillCount) };
  countdown -= points;
  while (countdown <= 0 && stock < MAX_JOKERS) {
    stock++;
    refillCount++;
    countdown += getNextJokerThreshold(state.mode, refillCount);
  }
  const nextThreshold = getNextJokerThreshold(state.mode, refillCount);
  if (stock >= MAX_JOKERS) countdown = 0;
  return { jokerStock: stock, jokerCountdown: countdown, jokerRefillCount: refillCount, jokerThreshold: nextThreshold };
}
export function saveRanking(rankings, name, score) { return [...rankings, { name: (name || 'NO NAME').slice(0, 12), score, date: new Date().toISOString() }].sort((a,b)=>b.score-a.score).slice(0,15); }
