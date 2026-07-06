import test from 'node:test';
import assert from 'node:assert/strict';
import { createDie, createEmptyBoard, evaluateBoard, evaluateDice, getGroups, placeDie, rollDice } from '../src/game.js';

test('board groups are 20: rows, columns, diagonals, blocks, corners', () => {
  const groups = getGroups();
  assert.equal(groups.length, 20);
  assert.equal(groups.filter(g => g.type === 'row').length, 4);
  assert.equal(groups.filter(g => g.type === 'column').length, 4);
  assert.equal(groups.filter(g => g.type === 'diagonal').length, 2);
  assert.equal(groups.filter(g => g.type === 'block').length, 9);
  assert.equal(groups.filter(g => g.type === 'corners').length, 1);
});

test('roll creates four dice using four colors and numbers 1-4', () => {
  const dice = rollDice(() => 0.5, 0);
  assert.equal(dice.length, 4);
  assert.ok(dice.every(d => ['red', 'blue', 'yellow', 'green'].includes(d.color)));
  assert.ok(dice.every(d => [1, 2, 3, 4].includes(d.number)));
});

test('clearing hands outrank non-clearing hands', () => {
  const hand = evaluateDice([1, 2, 3, 4].map(n => createDie('red', n)));
  assert.equal(hand.id, 'same-color-straight');
  assert.equal(hand.clearing, true);
});

test('joker works as a wildcard', () => {
  const hand = evaluateDice([createDie('red', 1), createDie('red', 2), createDie('red', 3), createDie('joker', 0, true)]);
  assert.equal(hand.id, 'same-color-straight');
});

test('placing four dice can clear a row after evaluation', () => {
  let board = createEmptyBoard();
  [1, 2, 3, 4].forEach((n, c) => { board = placeDie(board, 0, c, createDie('blue', n)); });
  const result = evaluateBoard(board);
  assert.equal(result.matches.some(m => m.hand.id === 'same-color-straight'), true);
  assert.equal(result.nextBoard[0].every(cell => cell === null), true);
});
