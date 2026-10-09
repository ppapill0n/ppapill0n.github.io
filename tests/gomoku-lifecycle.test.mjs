import assert from 'node:assert/strict';
import { createGomokuGame } from '../gate/games/gomoku/game.js';
import test, { beforeEach, afterEach } from 'node:test';
import { installFakeClock } from './fake-clock.mjs';
import { seededRandom } from '../gate/games/gomoku/ai.js';
import { canEnter } from '../gate/common/engine.js';
let clock;
beforeEach(() => { clock = installFakeClock(); });
afterEach(() => { clock.restore(); });
class Element extends EventTarget {
 constructor(index){super();this.dataset=index===undefined?{}:{index:String(index)};this.attrs={};this.classList={toggle(){}};this.hidden=false;this.innerHTML='';this.textContent='';}
 setAttribute(key,value){this.attrs[key]=value;}
 closest(){return this;}
 focus(){document.activeElement=this;}
}
function setup(humanFirst=false, random=()=>0.5) {
 globalThis.document=new EventTarget();document.hidden=false;globalThis.window=new EventTarget();
 const root=new Element(),cells=Array.from({length:225},(_,i)=>new Element(i)),board=new Element(),message=new Element(),rematch=new Element();
 root.querySelectorAll=()=>cells;root.querySelector=key=>({'.gomoku-board':board,'#gomoku-status':message,'#rematch':rematch}[key]);board.contains=cell=>cells.includes(cell);
 const requests=[],states=[];let cancelled=0,destroyed=0;
 const engine={findMove(board,player,{signal}){return new Promise((resolve,reject)=>requests.push({resolve,reject,signal,board:Array.from(board),player}));},cancel(){cancelled++;},destroy(){destroyed++;}};
 const game=createGomokuGame(root,x=>states.push(x),null,{engine,humanFirst,random});
 const click=index=>{const event=new Event('click');Object.defineProperty(event,'target',{value:cells[index]});board.dispatchEvent(event);};
 return {game,root,cells,board,message,rematch,requests,states,click,counts:()=>({cancelled,destroyed})};
}
const tick=(milliseconds=1000)=>{clock.advance(milliseconds);return new Promise(resolve=>setImmediate(resolve));};
test('controller lifecycle rejects obsolete work, pauses safely, retries errors and gates real wins', async () => {
{
 const f=setup();f.game.reset();assert.equal(f.requests.length,1);f.click(0);assert.equal(f.cells[0].dataset.stone,'0');assert.equal(f.game.getState().stopped,false);
 const old=f.requests[0];f.game.reset();assert.ok(old.signal.aborted);assert.equal(f.requests.length,2);old.resolve(0);await tick();assert.equal(f.cells[0].dataset.stone,'0');assert.equal(f.root.dataset.phase,'thinking');f.requests[1].resolve(112);await tick();assert.equal(f.cells[112].dataset.stone,'2');assert.equal(f.root.dataset.phase,'human');
 f.click(0);assert.equal(f.requests.length,3);const prior=f.requests[2];window.dispatchEvent(new Event('blur'));assert.ok(prior.signal.aborted);assert.equal(f.root.dataset.phase,'paused');f.click(1);assert.equal(f.cells[1].dataset.stone,'0');prior.resolve(1);await tick();assert.equal(f.cells[1].dataset.stone,'0');window.dispatchEvent(new Event('focus'));assert.equal(f.requests.length,4);f.requests[3].resolve(113);await tick();assert.equal(f.cells[113].dataset.stone,'2');
 f.click(1);assert.equal(f.requests.length,5);const final=f.requests[4],before=f.states.length;f.game.destroy();assert.ok(final.signal.aborted);final.resolve(114);await tick();assert.equal(f.cells[114].dataset.stone,'0');assert.equal(f.states.length,before);window.dispatchEvent(new Event('focus'));assert.equal(f.requests.length,5);assert.equal(f.counts().destroyed,1);
}
{
 const f=setup();f.game.reset();f.requests[0].resolve(-1);await tick();assert.equal(f.root.dataset.phase,'error');assert.equal(f.game.getState().stopped,false);assert.equal(f.rematch.textContent,'Retry');f.click(0);assert.equal(f.cells[0].dataset.stone,'0');f.rematch.dispatchEvent(new Event('click'));assert.equal(f.requests.length,2);f.requests[1].resolve(112);await tick();assert.equal(f.root.dataset.phase,'human');f.game.destroy();
}
{
 const f=setup(true);document.hidden=true;f.game.reset();assert.equal(f.requests.length,0);assert.equal(f.root.dataset.phase,'paused');f.click(0);assert.equal(f.cells[0].dataset.stone,'0');document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.root.dataset.phase,'human');
 for (const [human,panda] of [[0,30],[1,32],[2,34],[3,36]]){f.click(human);f.requests.at(-1).resolve(panda);await tick();}
 f.click(4);assert.deepEqual(f.game.getState(),{outcome:'human',stopped:true});assert.equal(f.rematch.hidden,false);window.dispatchEvent(new Event('blur'));assert.deepEqual(f.game.getState(),{outcome:'human',stopped:false});window.dispatchEvent(new Event('focus'));assert.deepEqual(f.game.getState(),{outcome:'human',stopped:true});f.rematch.dispatchEvent(new Event('click'));assert.equal(f.game.getState().outcome,null);assert.ok(f.cells.every(c=>c.dataset.stone==='0'));f.game.destroy();
}
});


test('Panda opening uses seeded 500–1000 ms inclusive pacing without visible status', async () => {
 const seeded = seededRandom(20261009);
 for (const sample of [0, 0.5, 1-Number.EPSILON, ...Array.from({length:32},()=>seeded())]) {
   let draws=0;
   const delay=500+Math.floor(sample*501), f=setup(false,()=>{draws++;return sample;});
   f.game.reset();
   assert.match(f.root.innerHTML, /id="gomoku-status" class="sr-only"/);
   assert.equal(f.requests.length,1);assert.equal(f.requests[0].player,2);assert.equal(draws,1);
   f.requests[0].resolve(112);
   await tick(delay-1);
   assert.equal(f.cells[112].dataset.stone,'0');assert.equal(f.root.dataset.phase,'thinking');
   assert.equal(f.board.attrs['aria-busy'],'true');assert.equal(f.game.getState().stopped,false);
   assert.equal(canEnter(undefined,f.game.getState(),{humanVictory:true,requireStopped:true}),false);
   f.click(0);f.click(1);assert.equal(f.cells[0].dataset.stone,'0');assert.equal(f.requests.length,1);
   await tick(1);
   assert.equal(f.cells[112].dataset.stone,'2');assert.equal(f.root.dataset.phase,'human');
   assert.equal(f.board.attrs['aria-busy'],'false');assert.equal(clock.pendingCount,0);
   f.game.destroy();
 }
});

test('thinking time includes computation and never discards a slower valid response', async () => {
 const f=setup(false,()=>0.5);f.game.reset();
 await tick(600);f.requests[0].resolve(112);await tick(149);
 assert.equal(f.root.dataset.phase,'thinking');await tick(1);assert.equal(f.root.dataset.phase,'human');
 f.click(0);f.click(1);f.click(0);assert.equal(f.requests.length,2);
 assert.equal(f.cells[0].dataset.stone,'1');assert.equal(f.cells[1].dataset.stone,'0');
 await tick(1500);assert.equal(f.root.dataset.phase,'thinking');assert.equal(clock.pendingCount,0);
 f.requests[1].resolve(113);await tick(0);
 assert.equal(f.root.dataset.phase,'human');assert.equal(f.cells[113].dataset.stone,'2');f.game.destroy();
});

test('reset cancels an already computed move waiting for its timer', async () => {
 const samples=[0,1-Number.EPSILON],f=setup(false,()=>samples.shift());f.game.reset();
 f.requests[0].resolve(112);await tick(100);assert.equal(clock.pendingCount,1);
 f.game.reset();assert.ok(f.requests[0].signal.aborted);assert.equal(clock.pendingCount,1);
 f.requests[1].resolve(111);await tick(400);
 assert.equal(f.cells[112].dataset.stone,'0');assert.equal(f.cells[111].dataset.stone,'0');
 await tick(599);assert.equal(f.root.dataset.phase,'thinking');await tick(1);
 assert.equal(f.cells[112].dataset.stone,'0');assert.equal(f.cells[111].dataset.stone,'2');f.game.destroy();
});

test('blur, page navigation and hidden-page stop remove pending timers and discard stale work', async () => {
 for (const interruption of ['blur','pagehide','visibilitychange','stop','destroy']) {
   const f=setup();f.game.reset();f.requests[0].resolve(112);await tick(100);
   assert.equal(clock.pendingCount,1);
   if(interruption==='destroy')f.game.destroy();
   else if(interruption==='stop'){document.hidden=true;f.game.stop();}
   else if(interruption==='visibilitychange'){document.hidden=true;document.dispatchEvent(new Event(interruption));}
   else window.dispatchEvent(new Event(interruption));
   assert.ok(f.requests[0].signal.aborted);assert.equal(clock.pendingCount,0);
   await tick(1000);assert.equal(f.cells[112].dataset.stone,'0');
   if(interruption!=='destroy'){
     document.hidden=false;window.dispatchEvent(new Event(interruption==='pagehide'?'pageshow':'focus'));
     assert.equal(f.requests.length,2);f.requests[1].resolve(111);await tick(749);
     assert.equal(f.root.dataset.phase,'thinking');await tick(1);assert.equal(f.cells[111].dataset.stone,'2');f.game.destroy();
   }
 }
});

test('worker failure removes the timer; duplicate Retry and Rematch clicks do not restart a turn', async () => {
 const f=setup();f.game.reset();f.requests[0].reject(new Error('worker failed'));await tick(0);
 assert.equal(clock.pendingCount,0);assert.equal(f.rematch.textContent,'Retry');assert.equal(f.game.getState().stopped,false);
 f.rematch.dispatchEvent(new Event('click'));f.rematch.dispatchEvent(new Event('click'));
 assert.equal(f.requests.length,2);assert.equal(clock.pendingCount,1);
 f.requests[1].resolve(30);await tick();
 for (const [human,panda] of [[0,32],[1,34],[2,36],[3,38]]){f.click(human);f.requests.at(-1).resolve(panda);await tick();}
 f.click(4);assert.equal(f.game.getState().outcome,'human');assert.equal(clock.pendingCount,0);
 f.rematch.dispatchEvent(new Event('click'));f.rematch.dispatchEvent(new Event('click'));
 assert.equal(f.requests.length,7);assert.equal(clock.pendingCount,1);
 assert.ok(f.cells.every(cell=>cell.dataset.stone==='0'));assert.equal(f.game.getState().outcome,null);
 f.requests.at(-1).resolve(112);await tick(749);assert.equal(f.root.dataset.phase,'thinking');
 await tick(1);assert.equal(f.cells[112].dataset.stone,'2');assert.equal(f.game.getState().stopped,true);f.game.destroy();
});
