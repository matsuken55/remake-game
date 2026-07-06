import { BOARD_SIZE, COLOR_LABELS, createEmptyBoard, evaluateBoard, rollDice, placeDie } from './game.js';

const state = {
  board: createEmptyBoard(),
  tray: [],
  selected: null,
  score: 0,
  message: 'ROLLで4つのサイコロを生成してください。',
  canRoll: true,
};

const boardEl = document.querySelector('#board');
const trayEl = document.querySelector('#tray');
const rollButton = document.querySelector('#roll');
const scoreEl = document.querySelector('#score');
const messageEl = document.querySelector('#message');
const logEl = document.querySelector('#log');

function render() {
  boardEl.innerHTML = '';
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      const die = state.board[r][c];
      if (die) cell.appendChild(dieElement(die));
      cell.disabled = Boolean(die) || state.selected === null;
      cell.addEventListener('click', () => placeSelected(r, c));
      boardEl.appendChild(cell);
    }
  }

  trayEl.innerHTML = '';
  state.tray.forEach((die, index) => {
    const button = document.createElement('button');
    button.className = `tray-die ${state.selected === index ? 'selected' : ''}`;
    button.appendChild(dieElement(die));
    button.addEventListener('click', () => {
      state.selected = state.selected === index ? null : index;
      render();
    });
    trayEl.appendChild(button);
  });

  rollButton.disabled = !state.canRoll;
  scoreEl.textContent = state.score;
  messageEl.textContent = state.message;
}

function dieElement(die) {
  const el = document.createElement('span');
  el.className = `die ${die.color}`;
  el.textContent = die.joker ? '★' : `${COLOR_LABELS[die.color]}${die.number}`;
  el.title = die.joker ? 'ジョーカー（ワイルド）' : `${COLOR_LABELS[die.color]} ${die.number}`;
  return el;
}

function roll() {
  if (!state.canRoll) return;
  state.tray = rollDice();
  state.selected = null;
  state.canRoll = false;
  state.message = '4つすべてを空きマスに配置してください。';
  render();
}

function placeSelected(row, col) {
  if (state.selected === null) return;
  const die = state.tray[state.selected];
  state.board = placeDie(state.board, row, col, die);
  state.tray.splice(state.selected, 1);
  state.selected = null;
  if (state.tray.length === 0) resolveTurn();
  else state.message = `残り${state.tray.length}個を配置してください。`;
  render();
}

function resolveTurn() {
  const result = evaluateBoard(state.board);
  state.board = result.nextBoard;
  state.score += result.score;
  state.canRoll = true;
  if (result.matches.length === 0) {
    state.message = '役なし。次のROLLが可能です。';
    addLog('役なし');
  } else {
    const names = result.matches.map(m => m.hand.name).join(' / ');
    state.message = `${result.matches.length}役成立: ${names}。次のROLLが可能です。`;
    addLog(`+${result.score}: ${names}`);
  }
}

function addLog(text) {
  const item = document.createElement('li');
  item.textContent = text;
  logEl.prepend(item);
}

rollButton.addEventListener('click', roll);
render();
