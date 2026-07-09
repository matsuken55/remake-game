import test from 'node:test';
import assert from 'node:assert/strict';
import { awardJokers, createDie, createEmptyBoard, createInitialState, evaluateBoard, evaluateDice, getGroups, getNextJokerThreshold, hasEmptyCell, lockUnlockedDice, MAX_JOKERS, moveDie, placeDie, rollBalancedDice, rollDice, saveRanking, hasScoringCandidate } from '../src/game.js';

test('board groups are 20: rows, columns, diagonals, blocks, corners', () => {
  const groups = getGroups();
  assert.equal(groups.length, 20);
  assert.equal(groups.filter(g => g.type === 'row').length, 4);
  assert.equal(groups.filter(g => g.type === 'column').length, 4);
  assert.equal(groups.filter(g => g.type === 'diagonal').length, 2);
  assert.equal(groups.filter(g => g.type === 'block').length, 9);
  assert.equal(groups.filter(g => g.type === 'corners').length, 1);
});

test('ROLL creates four dice and never creates a random joker', () => {
  const dice = rollDice(() => 0.5);
  assert.equal(dice.length, 4);
  assert.ok(dice.every(d => ['red', 'blue', 'yellow', 'green'].includes(d.color)));
  assert.ok(dice.every(d => [1, 2, 3, 4].includes(d.number)));
  assert.ok(dice.every(d => !d.joker));
});

test('one placed die is locked by ROLL while the remaining batch is not replenished', () => {
  const state = createInitialState();
  state.trayDice = rollDice(() => 0.1);
  state.board = placeDie(state.board, 0, 0, state.trayDice[0]);
  const locked = lockUnlockedDice(state.board);
  state.board = locked.board;
  state.trayDice = state.trayDice.filter(d => !locked.locked.some(x => x.id === d.id));
  assert.equal(locked.locked.length, 1);
  assert.equal(state.board[0][0].locked, true);
  assert.equal(state.trayDice.length, 3);
});

test('unlocked dice can move but locked dice cannot move', () => {
  let board = createEmptyBoard();
  const die = createDie('blue', 1);
  board = placeDie(board, 0, 0, die);
  let moved = moveDie(board, die.id, 1, 1);
  assert.equal(moved.moved, true);
  assert.equal(moved.board[1][1].id, die.id);
  const locked = lockUnlockedDice(moved.board).board;
  moved = moveDie(locked, die.id, 2, 2);
  assert.equal(moved.moved, false);
  assert.equal(moved.board[1][1].id, die.id);
});

test('normal joker thresholds increase and stock is capped at two', () => {
  let state = createInitialState('normal');
  assert.equal(getNextJokerThreshold('normal', 0), 120);
  assert.equal(getNextJokerThreshold('normal', 1), 200);
  assert.equal(getNextJokerThreshold('normal', 2), 300);
  state = { ...state, ...awardJokers(state, 119) };
  assert.equal(state.jokerStock, 0);
  assert.equal(state.jokerCountdown, 1);
  state = { ...state, ...awardJokers(state, 1) };
  assert.equal(state.jokerStock, 1);
  assert.equal(state.jokerRefillCount, 1);
  assert.equal(state.jokerThreshold, 200);
  assert.equal(state.jokerCountdown, 200);
  state = { ...state, ...awardJokers(state, 2000) };
  assert.equal(state.jokerStock, MAX_JOKERS);
  assert.equal(state.jokerRefillCount, 2);
  assert.equal(state.jokerCountdown, 0);
});

test('joker works as a wildcard', () => {
  const hand = evaluateDice([createDie('red', 1), createDie('red', 2), createDie('red', 3), createDie('joker', 0, true)]);
  assert.equal(hand.id, 'same-color-straight');
});


test('joker can overwrite a locked normal die and is evaluated as a joker', () => {
  let board = createEmptyBoard();
  [createDie('red', 1), createDie('red', 2), createDie('red', 3), createDie('blue', 4)].forEach((die, c) => { board = placeDie(board, 0, c, die); });
  board = lockUnlockedDice(board).board;
  board = placeDie(board, 0, 3, createDie('joker', 0, true));
  assert.equal(board[0][3].joker, true);
  assert.equal(board[0][3].locked, false);
  const locked = lockUnlockedDice(board);
  const matches = evaluateBoard(locked.board, locked.locked.map(d => d.id));
  assert.equal(matches.some(match => match.hand.id === 'same-color-straight'), true);
});

test('pending joker overlay keeps the covered locked die until the joker is locked', () => {
  let board = createEmptyBoard();
  const coveredDie = createDie('blue', 4);
  board = placeDie(board, 0, 0, coveredDie);
  board = lockUnlockedDice(board).board;
  board = placeDie(board, 0, 0, createDie('joker', 0, true));
  assert.equal(board[0][0].joker, true);
  assert.equal(board[0][0].locked, false);
  assert.equal(board[0][0].underlyingDie.id, coveredDie.id);
  assert.equal(board[0][0].underlyingDie.locked, true);
  const locked = lockUnlockedDice(board);
  assert.equal(locked.board[0][0].joker, true);
  assert.equal(locked.board[0][0].locked, true);
  assert.equal(locked.board[0][0].underlyingDie, undefined);
});

test('normal dice cannot overwrite locked cells', () => {
  let board = createEmptyBoard();
  board = placeDie(board, 0, 0, createDie('red', 1));
  board = lockUnlockedDice(board).board;
  assert.throws(() => placeDie(board, 0, 0, createDie('blue', 2)), /occupied/);
});

test('ranking registration keeps top fifteen and can be stored in localStorage', () => {
  const seed = Array.from({ length: 16 }, (_, i) => ({ name: `P${i}`, score: 1000 - i, date: '' }));
  const rankings = saveRanking(seed, 'AAA', 1200);
  assert.equal(rankings.length, 15);
  assert.equal(rankings.some(r => r.name === 'AAA'), true);
  const fakeStorage = new Map();
  fakeStorage.set('rankings', JSON.stringify(rankings));
  assert.equal(JSON.parse(fakeStorage.get('rankings')).length, 15);
});

test('full board without clearing match has no empty cell and can be game over', () => {
  let board = createEmptyBoard();
  const colors = ['red','red','blue','blue'];
  for (let r=0;r<4;r++) for (let c=0;c<4;c++) board = placeDie(board, r, c, createDie(colors[(r+c)%4], ((r*2+c)%4)+1));
  board = lockUnlockedDice(board).board;
  assert.equal(hasEmptyCell(board), false);
  assert.ok(Array.isArray(evaluateBoard(board)));
});

test('board evaluation can be limited to groups touched by newly locked dice', () => {
  let board = createEmptyBoard();
  const oldDice = [createDie('red', 1), createDie('red', 1), createDie('red', 1), createDie('red', 1)];
  oldDice.forEach((die, c) => { board = placeDie(board, 0, c, die); });
  board = lockUnlockedDice(board).board;
  const newDie = createDie('blue', 2);
  board = placeDie(board, 3, 3, newDie);
  const locked = lockUnlockedDice(board);
  const matches = evaluateBoard(locked.board, locked.locked.map(d => d.id));
  assert.equal(matches.some(match => match.label === '横1'), false);
});


test('balanced ROLL ensures recent two batches contain a scoring candidate', () => {
  const previous = [createDie('red', 1), createDie('blue', 2), createDie('yellow', 3), createDie('green', 1)];
  const randomValues = Array.from({ length: 100 * 8 }, () => 0.01);
  const random = () => randomValues.shift() ?? 0.01;
  const batch = rollBalancedDice(previous, random);
  assert.equal(batch.length, 4);
  assert.equal(hasScoringCandidate([...previous, ...batch]), true);
});

test('easy mode uses increasing joker thresholds', () => {
  let state = createInitialState('easy');
  assert.equal(state.mode, 'easy');
  assert.equal(getNextJokerThreshold('easy', 0), 80);
  assert.equal(getNextJokerThreshold('easy', 1), 130);
  assert.equal(getNextJokerThreshold('easy', 2), 190);
  assert.equal(state.jokerThreshold, 80);
  assert.equal(state.jokerCountdown, 80);
  state = { ...state, ...awardJokers(state, 80) };
  assert.equal(state.jokerStock, 1);
  assert.equal(state.jokerRefillCount, 1);
  assert.equal(state.jokerThreshold, 130);
  assert.equal(state.jokerCountdown, 130);
});

test('full joker stock does not increase refill count', () => {
  const state = { ...createInitialState('easy'), jokerStock: MAX_JOKERS, jokerRefillCount: 1, jokerCountdown: 0 };
  const awarded = awardJokers(state, 999);
  assert.equal(awarded.jokerStock, MAX_JOKERS);
  assert.equal(awarded.jokerRefillCount, 1);
});
