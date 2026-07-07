import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeElement {
  constructor(tagName){this.tagName=tagName.toUpperCase();this.children=[];this.dataset={};this.listeners=new Map();this.style={};this.hidden=false;this._className='';this._textContent='';this.disabled=false;}
  set className(v){this._className=v} get className(){return this._className}
  get classList(){return { add: c => { this._className += ` ${c}`; } };}
  set textContent(v){this._textContent=String(v);this.children=[]} get textContent(){return this._textContent}
  set innerHTML(v){this._textContent=String(v);this.children=[]} get innerHTML(){return this._textContent}
  appendChild(c){this.children.push(c);return c} prepend(c){this.children.unshift(c);return c}
  addEventListener(t,l){this.listeners.set(t,l)} click(){this.listeners.get('click')?.({ preventDefault(){} })}
  insertAdjacentHTML(){this.children.push(new FakeElement('span'))}
  showModal(){this.open=true} close(){this.open=false}
  querySelector(){return null}
}
function createFakeDocument(){const ids=['#board','#tray','#roll','#score','#highScore','#message','#jokerWindow','#jokerCountdown','#log','#gameOver','#rankingList','#scoreDialog','#rankForm','#playerName','#rules','#closeRules','#restart','#closeGameOver'];const elements=new Map(ids.map(id=>[id,new FakeElement(id.slice(1)==='rankForm'?'form':'div')]));elements.get('#playerName').value='AAA';return{querySelector:s=>{const e=elements.get(s);if(!e)throw Error(`Missing ${s}`);return e},querySelectorAll:s=>s==='.cell'?elements.get('#board').children:[],createElement:t=>new FakeElement(t),elements};}

test('HTML references loadable CSS and JS assets', async()=>{const html=await readFile('index.html','utf8');assert.match(html,/<link rel="stylesheet" href="\.\/src\/styles\.css"/);assert.match(html,/<script type="module" src="\.\/src\/main\.js"><\/script>/);await assert.doesNotReject(readFile('src/styles.css','utf8'));await assert.doesNotReject(readFile('src/main.js','utf8'));});

test('CSS keeps the 4x4 board usable at smartphone widths', async()=>{const css=await readFile('src/styles.css','utf8');assert.match(css,/width:min\(960px,94vw\)/);assert.match(css,/grid-template-columns:repeat\(4,minmax\(70px,1fr\)\)/);assert.match(css,/aspect-ratio:1/);assert.match(css,/\.overlay\[hidden\]\{display:none\}/);});

test('main module renders 4x4 board and ROLL creates four current-batch dice', async()=>{const document=createFakeDocument();globalThis.document=document;globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.localStorage={store:new Map([['remakeDice.gameOver','true'],['remakeDice.board','stale']]),getItem(k){return this.store.get(k)||null},setItem(k,v){this.store.set(k,String(v))}};const random=Math.random;Math.random=()=>0.5;try{await import(`../src/main.js?smoke=${Date.now()}`);const board=document.elements.get('#board');const tray=document.elements.get('#tray');const roll=document.elements.get('#roll');const message=document.elements.get('#message');const gameOver=document.elements.get('#gameOver');assert.equal(gameOver.hidden,true);assert.equal(board.children.length,16);assert.equal(roll.disabled,false);roll.click();assert.equal(tray.children.length,4);assert.equal(roll.disabled,false);assert.match(message.textContent,/現在のバッチ/);const js=await readFile('src/main.js','utf8');assert.match(js,/assets\/dice\/JK\.png/);}finally{Math.random=random;delete globalThis.document;delete globalThis.window;delete globalThis.localStorage;}});
