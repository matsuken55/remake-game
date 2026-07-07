import test from 'node:test';
import assert from 'node:assert/strict';
import { awardJokers, createDie, createEmptyBoard, createInitialState, evaluateBoard, evaluateDice, getGroups, hasEmptyCell, lockUnlockedDice, MAX_JOKERS, moveDie, placeDie, rollBalancedDice, rollDice, saveRanking, hasScoringCandidate } from '../src/game.js';

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

test('normal joker is awarded every 400 points and capped at two', () => {
  let state = createInitialState('normal');
  state = awardJokers(state, 399);
  assert.equal(state.jokerStock, 0);
  assert.equal(state.jokerCountdown, 1);
  state = awardJokers(state, 1);
  assert.equal(state.jokerStock, 1);
  assert.equal(state.jokerCountdown, 400);
  state = awardJokers(state, 2000);
  assert.equal(state.jokerStock, MAX_JOKERS);
  assert.equal(state.jokerCountdown, 0);
});

test('joker works as a wildcard', () => {
  const hand = evaluateDice([createDie('red', 1), createDie('red', 2), createDie('red', 3), createDie('joker', 0, true)]);
  assert.equal(hand.id, 'same-color-straight');
});

test('ranking registration keeps top ten and can be stored in localStorage', () => {
  const rankings = saveRanking([], 'AAA', 1200);
  assert.deepEqual(rankings.map(r => [r.name, r.score]), [['AAA', 1200]]);
  const fakeStorage = new Map();
  fakeStorage.set('rankings', JSON.stringify(rankings));
  assert.equal(JSON.parse(fakeStorage.get('rankings'))[0].score, 1200);
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

test('easy mode uses a 280 point joker threshold', () => {
  let state = createInitialState('easy');
  assert.equal(state.mode, 'easy');
  assert.equal(state.jokerThreshold, 280);
  assert.equal(state.jokerCountdown, 280);
  state = awardJokers(state, 280);
  assert.equal(state.jokerStock, 1);
  assert.equal(state.jokerCountdown, 280);
});
