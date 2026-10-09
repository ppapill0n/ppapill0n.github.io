import assert from 'node:assert/strict';
import { createGomokuGame } from '../gate/games/gomoku/game.js';
import test from 'node:test';
class Element extends EventTarget {
 constructor(index){super();this.dataset=index===undefined?{}:{index:String(index)};this.attrs={};this.classList={toggle(){}};this.hidden=false;this.innerHTML='';this.textContent='';}
 setAttribute(key,value){this.attrs[key]=value;}
 closest(){return this;}
 focus(){document.activeElement=this;}
}
function setup(humanFirst=false) {
 globalThis.document=new EventTarget();document.hidden=false;globalThis.window=new EventTarget();
 const root=new Element(),cells=Array.from({length:225},(_,i)=>new Element(i)),board=new Element(),message=new Element(),rematch=new Element();
 root.querySelectorAll=()=>cells;root.querySelector=key=>({'.gomoku-board':board,'#gomoku-status':message,'#rematch':rematch}[key]);board.contains=cell=>cells.includes(cell);
 const requests=[],states=[];let cancelled=0,destroyed=0;
 const engine={findMove(board,player,{signal}){return new Promise((resolve,reject)=>requests.push({resolve,reject,signal,board:Array.from(board),player}));},cancel(){cancelled++;},destroy(){destroyed++;}};
 const game=createGomokuGame(root,x=>states.push(x),null,{engine,humanFirst});
 const click=index=>{const event=new Event('click');Object.defineProperty(event,'target',{value:cells[index]});board.dispatchEvent(event);};
 return {game,root,cells,board,message,rematch,requests,states,click,counts:()=>({cancelled,destroyed})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
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
