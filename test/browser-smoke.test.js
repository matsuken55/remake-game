import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this._className = '';
    this._textContent = '';
    this.disabled = false;
  }

  set className(value) { this._className = value; }
  get className() { return this._className; }

  set textContent(value) { this._textContent = String(value); this.children = []; }
  get textContent() { return this._textContent; }

  set innerHTML(value) { this._textContent = String(value); this.children = []; }
  get innerHTML() { return this._textContent; }

  appendChild(child) { this.children.push(child); return child; }
  prepend(child) { this.children.unshift(child); return child; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  click() { this.listeners.get('click')?.(); }
}

function createFakeDocument() {
  const elements = new Map([
    ['#board', new FakeElement('section')],
    ['#tray', new FakeElement('section')],
    ['#roll', new FakeElement('button')],
    ['#score', new FakeElement('span')],
    ['#message', new FakeElement('p')],
    ['#log', new FakeElement('ul')],
  ]);
  return {
    querySelector(selector) {
      const element = elements.get(selector);
      if (!element) throw new Error(`Missing fixture element: ${selector}`);
      return element;
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    elements,
  };
}

test('HTML references loadable CSS and JS assets', async () => {
  const html = await readFile('index.html', 'utf8');
  assert.match(html, /<link rel="stylesheet" href="\.\/src\/styles\.css"/);
  assert.match(html, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
  await assert.doesNotReject(readFile('src/styles.css', 'utf8'));
  await assert.doesNotReject(readFile('src/main.js', 'utf8'));
});

test('CSS keeps the 4x4 board usable at smartphone widths', async () => {
  const css = await readFile('src/styles.css', 'utf8');
  assert.match(css, /width:\s*min\(960px,\s*94vw\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(70px,\s*1fr\)\)/);
  assert.match(css, /aspect-ratio:\s*1/);
});

test('main module renders 4x4 board, rolls four dice, places all dice, and re-enables roll without JS errors', async () => {
  const document = createFakeDocument();
  globalThis.document = document;
  const originalRandom = Math.random;
  Math.random = () => 0.5;

  try {
    await import(`../src/main.js?smoke=${Date.now()}`);
    const board = document.elements.get('#board');
    const tray = document.elements.get('#tray');
    const roll = document.elements.get('#roll');
    const message = document.elements.get('#message');

    assert.equal(board.children.length, 16);
    assert.equal(roll.disabled, false);

    roll.click();
    assert.equal(tray.children.length, 4);
    assert.equal(roll.disabled, true);
    assert.match(message.textContent, /4つすべて/);

    for (let i = 0; i < 4; i++) {
      tray.children[0].click();
      board.children[i].click();
    }

    assert.equal(tray.children.length, 0);
    assert.equal(roll.disabled, false);
    assert.match(message.textContent, /次のROLLが可能/);
  } finally {
    Math.random = originalRandom;
    delete globalThis.document;
  }
});
