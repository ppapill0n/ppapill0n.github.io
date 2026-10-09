// Optional DOM integration, not layout/browser/device QA.
// HAPPY_DOM_MODULE=/tmp/gomoku-dom/node_modules/happy-dom/lib/index.js node tests/freeplay-dom.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installFakeClock } from './fake-clock.mjs';
import { PASS_KEY, issuePass } from '../gate/common/session-pass.js';
const { Window } = await import(process.env.HAPPY_DOM_MODULE || 'happy-dom');
const window = new Window({ url:'https://example.test/play/' });
const document=window.document;
const html=await readFile(new URL('../play/index.html',import.meta.url),'utf8');
document.body.innerHTML=html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
document.documentElement.setAttribute('data-private-pending','');
const frames=new Map();let frameId=0;
const workers=[];
class FakeWorker {
  constructor(url){this.url=url;this.terminated=false;workers.push(this);}
  postMessage(data){this.sent=data;}
  terminate(){this.terminated=true;}
}
Object.assign(globalThis,{window,document,sessionStorage:window.sessionStorage,localStorage:window.localStorage,AbortController:window.AbortController,Worker:FakeWorker,
  requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id)});
const canvasContext=new Proxy({}, {get:(object,key)=>object[key]??(()=>{}),set:(object,key,value)=>{object[key]=value;return true;}});
window.HTMLCanvasElement.prototype.getContext=()=>canvasContext;
window.HTMLElement.prototype.setPointerCapture=function(id){this.captured=id;};
window.HTMLElement.prototype.hasPointerCapture=function(id){return this.captured===id;};
window.HTMLElement.prototype.releasePointerCapture=function(id){if(this.captured===id)this.captured=null;};
const clock=installFakeClock();
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function tickFrame(now=performance.now()+16){const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(now));}
const passNow=Date.now();assert.ok(issuePass(passNow));const original=sessionStorage.getItem(PASS_KEY);
await import(`../play/play.js?dom=${Date.now()}`);
assert.ok(!document.documentElement.hasAttribute('data-private-pending'));
assert.equal(document.querySelectorAll('[data-select-game]').length,7);assert.equal(workers.length,0);assert.equal(frames.size,0);
assert.equal(document.querySelector('#enter'),null);
const selection=()=>document.querySelector('#selection');
const choose=id=>document.querySelector(`[data-select-game="${id}"]`).click();
const back=()=>document.querySelector('#all-games').click();
const root=()=>document.querySelector('#game');
for (const id of ['dial','cannon','slots','soda','cube','cube2','gomoku']) {
  choose(id);assert.equal(root().dataset.game,id);assert.equal(window.location.search,`?game=${id}`);assert.ok(selection().hidden);
  assert.doesNotMatch(root().textContent,/unlock|activate Enter|to enter/);
  tickFrame();assert.equal(sessionStorage.getItem(PASS_KEY),original);
  document.querySelector('#restart').click();assert.equal(root().dataset.game,id);tickFrame();
  assert.equal(sessionStorage.getItem(PASS_KEY),original);back();await flush();
  assert.equal(frames.size,0);assert.equal(root().childElementCount,0);assert.ok(!selection().hidden);assert.equal(window.location.search,'');
}
assert.ok(workers.every(worker=>worker.terminated));
// Dial keyboard stays inside the game, never on shell navigation controls.
choose('dial');const dial=document.querySelector('#dial');const value=dial.getAttribute('aria-valuenow');
document.querySelector('#restart').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',code:'ArrowRight',bubbles:true,cancelable:true}));
assert.equal(frames.size,0);assert.equal(dial.getAttribute('aria-valuenow'),value);
dial.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',code:'ArrowRight',bubbles:true,cancelable:true}));assert.equal(frames.size,1);
dial.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(sessionStorage.getItem(PASS_KEY),original);
back();assert.equal(frames.size,0);window.dispatchEvent(new window.KeyboardEvent('keyup',{key:'ArrowRight',code:'ArrowRight'}));assert.equal(frames.size,0);
// Slots reset / leaving during a spin cancels animation and celebration state.
choose('slots');document.querySelector('#lever').click();assert.equal(root().dataset.phase,'spinning');assert.ok(frames.size>0);
back();assert.equal(frames.size,0);assert.ok(!root().classList.contains('slots-spinning'));
// Language changes keep the same game/worker and stored pass.
choose('gomoku');const worker=workers.at(-1),stale=worker.onmessage,id=worker.sent.id;
const count=workers.length;document.querySelector('[data-lang="ko"]').click();assert.equal(document.documentElement.lang,'ko');assert.equal(workers.length,count);assert.equal(document.querySelector('#game-title').textContent,'오목');
assert.equal(document.querySelector('#all-games').textContent,'← 모든 게임');assert.equal(sessionStorage.getItem(PASS_KEY),original);
back();assert.ok(worker.terminated);stale({data:{id,index:112}});clock.advance(1200);await flush();assert.equal(root().childElementCount,0);assert.equal(document.querySelector('#state').textContent,'');
// Safe unknown-query fallback, followed by popstate selection and bfcache rebuild.
window.history.pushState(null,'','?game=%3Cscript%3E');window.dispatchEvent(new window.PopStateEvent('popstate'));assert.equal(window.location.search,'');assert.ok(!selection().hidden);
window.history.pushState(null,'','?game=cube2');window.dispatchEvent(new window.PopStateEvent('popstate'));assert.equal(root().dataset.game,'cube2');
window.dispatchEvent(new window.Event('pagehide'));assert.equal(frames.size,0);assert.equal(root().childElementCount,0);assert.ok(document.documentElement.hasAttribute('data-private-pending'));
window.dispatchEvent(new window.Event('pageshow'));assert.equal(root().dataset.game,'cube2');assert.ok(!document.documentElement.hasAttribute('data-private-pending'));assert.equal(sessionStorage.getItem(PASS_KEY),original);
// Returning to hub destroys work; repeated focus events never grant/renew access.
back();for(let i=0;i<10;i++)window.dispatchEvent(new window.Event('focus'));assert.equal(sessionStorage.getItem(PASS_KEY),original);assert.equal(frames.size,0);
// Expiry discovered inside a real render defers teardown until DOM use finishes.
const {createFreeplayController}=await import('../play/controller.js');
const {createDialGame}=await import('../gate/games/dial/game.js');
const {createCannonGame}=await import('../gate/games/cannon/game.js');
for (const id of ['dial','cannon']) {
  const host=document.createElement('div');host.setAttribute('data-game-input-scope','');document.querySelector('main').append(host);
  let allowed=true,time=0,denied=0;
  const definition={id,next:()=>({target:42,start:0}),create:id==='dial'?createDialGame:(root,changed,enter)=>createCannonGame(root,changed,enter,()=>time)};
  const controller=createFreeplayController({registry:[definition],root:host,allowed:()=>allowed,denied:()=>denied++});
  controller.select(id);
  if(id==='dial') host.querySelector('#dial').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',code:'ArrowRight',bubbles:true}));
  else {
    time=250;host.querySelector('#fire').dispatchEvent(new window.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
    time=500;window.dispatchEvent(new window.KeyboardEvent('keyup',{key:' ',code:'Space'}));time=5000;
  }
  allowed=false;assert.doesNotThrow(()=>tickFrame());await flush();
  assert.equal(denied,1);assert.equal(host.childElementCount,0);assert.equal(frames.size,0);assert.doesNotThrow(()=>tickFrame());host.remove();
}
window.dispatchEvent(new window.Event('pagehide'));clock.restore();await window.happyDOM.close();
console.log('PASS actual seven adapters in freeplay DOM: create/restart/switch, frame cleanup, input scoping, no Enter/pass renewal, localization without restart, lazy/cancelled Gomoku, stale responses, invalid routing, pagehide/pageshow, expiry inside real dial/cannon renders. Canvas drawing is stubbed; no layout/browser/device claim.');
