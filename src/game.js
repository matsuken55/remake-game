export const COLORS = ['red', 'blue', 'yellow', 'green'];
export const NUMBERS = [1, 2, 3, 4];
export const BOARD_SIZE = 4;

export const COLOR_LABELS = {
  red: '赤',
  blue: '青',
  yellow: '黄',
  green: '緑',
  joker: 'J',
};

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

export function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null));
}

export function createDie(color, number, joker = false) {
  return joker ? { color: 'joker', number: 0, joker: true } : { color, number, joker: false };
}

export function rollDice(random = Math.random, jokerChance = 0.08) {
  return Array.from({ length: 4 }, () => {
    if (random() < jokerChance) return createDie('joker', 0, true);
    const color = COLORS[Math.floor(random() * COLORS.length)];
    const number = NUMBERS[Math.floor(random() * NUMBERS.length)];
    return createDie(color, number);
  });
}

export function getGroups() {
  const groups = [];
  for (let r = 0; r < BOARD_SIZE; r++) groups.push({ type: 'row', cells: [[r,0],[r,1],[r,2],[r,3]] });
  for (let c = 0; c < BOARD_SIZE; c++) groups.push({ type: 'column', cells: [[0,c],[1,c],[2,c],[3,c]] });
  groups.push({ type: 'diagonal', cells: [[0,0],[1,1],[2,2],[3,3]] });
  groups.push({ type: 'diagonal', cells: [[0,3],[1,2],[2,1],[3,0]] });
  for (let r = 0; r < BOARD_SIZE - 1; r++) {
    for (let c = 0; c < BOARD_SIZE - 1; c++) groups.push({ type: 'block', cells: [[r,c],[r,c+1],[r+1,c],[r+1,c+1]] });
  }
  groups.push({ type: 'corners', cells: [[0,0],[0,3],[3,0],[3,3]] });
  return groups;
}

function counts(values) {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) || 0) + 1);
  return [...map.values()].sort((a, b) => b - a);
}

function canAssign(dice, predicate) {
  const jokers = dice.filter(d => d.joker).length;
  const fixed = dice.filter(d => !d.joker);
  const assignments = [];
  function backtrack(i, current) {
    if (i === jokers) return predicate([...fixed, ...current]);
    for (const color of COLORS) {
      for (const number of NUMBERS) {
        if (backtrack(i + 1, [...current, createDie(color, number)])) return true;
      }
    }
    return false;
  }
  return backtrack(0, assignments);
}

const predicates = {
  'same-color-same-number': dice => dice.every(d => d.color === dice[0].color && d.number === dice[0].number),
  'same-color-straight': dice => dice.every(d => d.color === dice[0].color) && isStraight(dice),
  'rainbow-same-number': dice => new Set(dice.map(d => d.color)).size === 4 && dice.every(d => d.number === dice[0].number),
  'rainbow-straight': dice => new Set(dice.map(d => d.color)).size === 4 && isStraight(dice),
  'same-color': dice => dice.every(d => d.color === dice[0].color),
  'same-number': dice => dice.every(d => d.number === dice[0].number),
  'two-color-pairs': dice => counts(dice.map(d => d.color)).join(',') === '2,2',
  'two-number-pairs': dice => counts(dice.map(d => d.number)).join(',') === '2,2',
  'rainbow': dice => new Set(dice.map(d => d.color)).size === 4,
  'straight': isStraight,
};

function isStraight(dice) {
  return dice.map(d => d.number).sort().join(',') === '1,2,3,4';
}

export function evaluateDice(dice) {
  if (dice.length !== 4) return null;
  for (const hand of CLEARING_HANDS) if (canAssign(dice, predicates[hand.id])) return { ...hand, clearing: true };
  for (const hand of SCORING_HANDS) if (canAssign(dice, predicates[hand.id])) return { ...hand, clearing: false };
  return null;
}

export function evaluateBoard(board) {
  const matches = [];
  for (const group of getGroups()) {
    const dice = group.cells.map(([r, c]) => board[r][c]);
    if (dice.every(Boolean)) {
      const hand = evaluateDice(dice);
      if (hand) matches.push({ ...group, hand });
    }
  }
  const clearCells = new Set();
  let score = 0;
  for (const match of matches) {
    score += match.hand.points;
    if (match.hand.clearing) for (const [r, c] of match.cells) clearCells.add(`${r},${c}`);
  }
  const nextBoard = board.map(row => row.map((die, c) => die));
  for (const key of clearCells) {
    const [r, c] = key.split(',').map(Number);
    nextBoard[r][c] = null;
  }
  return { matches, score, clearCells, nextBoard };
}

export function placeDie(board, row, col, die) {
  if (board[row][col]) throw new Error('Cell is already occupied');
  const next = board.map(r => [...r]);
  next[row][col] = die;
  return next;
}
