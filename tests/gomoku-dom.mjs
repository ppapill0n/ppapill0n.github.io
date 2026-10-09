// Optional DOM lifecycle suite: install happy-dom, or set HAPPY_DOM_MODULE to its
// entry point. This does not substitute for layout, real browser or phone QA.
import assert from 'node:assert/strict';
import { installFakeClock } from './fake-clock.mjs';
const { Window } = await import(process.env.HAPPY_DOM_MODULE || 'happy-dom');
import { createGomokuGame } from '../gate/games/gomoku/game.js';
import { canEnter } from '../gate/common/engine.js';
import { enterPersonal } from '../gate/common/entry.js';
import { chooseMove } from '../gate/games/gomoku/ai.js';
const window=new Window({url:'http://localhost/gate/'});
Object.assign(globalThis,{window,document:window.document,sessionStorage:window.sessionStorage,AbortController:window.AbortController});
const clock=installFakeClock();
const tick=()=>{clock.advance(1000);return new Promise(resolve=>setImmediate(resolve));};
const rules={humanVictory:true,requireStopped:true};
function fixture({humanFirst=false,moves=[],pending=false}={}) {
 const root=document.createElement('div');document.body.append(root);let state,requests=[],destroyed=0;
 const engine={findMove(board,player,{signal}){const snapshot=[...board];if(pending)return new Promise((resolve,reject)=>requests.push({resolve,reject,signal,board:snapshot,player}));return Promise.resolve(moves.length?moves.shift():chooseMove(snapshot,player,1).index);},cancel(){},destroy(){destroyed++;}};
 const game=createGomokuGame(root,value=>state=value,null,{engine,humanFirst});game.reset();
 return {root,game,requests,get state(){return state;},get destroyed(){return destroyed;},click(index){root.querySelector(`[data-index="${index}"]`).click();},close(){game.destroy();root.remove();}};
}
// Human second: opening locks input, settles into one Panda stone.
const second=fixture({pending:true});assert.ok(second.root.querySelector('#gomoku-status').classList.contains('sr-only'));assert.equal(second.root.querySelector('#gomoku-help').className,'sr-only');assert.equal(second.requests.length,1);assert.equal(second.requests[0].player,2);assert.equal(second.root.dataset.phase,'thinking');second.click(113);assert.equal(second.root.querySelectorAll('[data-stone="1"]').length,0);second.requests[0].resolve(112);await tick();assert.equal(second.root.dataset.phase,'human');assert.equal(second.root.querySelectorAll('[data-stone="2"]').length,1);assert.ok(!canEnter(undefined,second.state,rules));
second.click(113);second.click(114);second.click(113);assert.equal(second.root.querySelectorAll('[data-stone="1"]').length,1);const old=second.requests.at(-1);second.game.reset();assert.ok(old.signal.aborted);old.resolve(20);await tick();assert.equal(second.root.querySelectorAll('[data-stone="1"]').length,0);assert.equal(second.root.querySelectorAll('[data-stone="2"]').length,0);second.requests.at(-1).resolve(112);await tick();assert.equal(second.root.querySelectorAll('[data-stone="2"]').length,1);
// Blur/hidden interruption cancels the old request and resumes a fresh one.
second.click(114);const interrupted=second.requests.at(-1);window.dispatchEvent(new window.Event('blur'));assert.ok(interrupted.signal.aborted);assert.equal(second.root.dataset.phase,'paused');interrupted.resolve(40);await tick();assert.equal(second.root.querySelectorAll('[data-stone="2"]').length,1);window.dispatchEvent(new window.Event('focus'));assert.equal(second.root.dataset.phase,'thinking');second.requests.at(-1).resolve(97);await tick();assert.equal(second.root.dataset.phase,'human');
// Roving keyboard keeps one tab stop and does not place an extra repeated key.
second.root.querySelector('[data-index="114"]').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(document.activeElement.dataset.index,'115');assert.equal(second.root.querySelectorAll('[tabindex="0"]').length,1);second.close();assert.equal(second.destroyed,1);
// Human win / explicit entry (no automatic pass), then rematch stays locked.
const won=fixture({humanFirst:true,moves:[30,32,34,36]});for(const i of [0,1,2,3,4]){won.click(i);await tick();}assert.equal(won.state.outcome,'human');assert.ok(canEnter(undefined,won.state,rules));assert.equal(sessionStorage.getItem('personal-gate-pass'),null);let navigation=0;assert.equal(enterPersonal(undefined,won.state,rules,()=>navigation++),'entered');assert.equal(navigation,1);const pass=JSON.parse(sessionStorage.getItem('personal-gate-pass'));assert.equal(pass.expiresAt-pass.issuedAt,3600000);won.root.querySelector('#rematch').click();assert.equal(won.state.outcome,null);assert.ok(!canEnter(undefined,won.state,rules));won.close();
const lost=fixture({humanFirst:true,moves:[30,31,32,33,34]});for(const i of [0,2,4,6,8]){lost.click(i);await tick();}assert.equal(lost.state.outcome,'panda');assert.ok(!canEnter(undefined,lost.state,rules));assert.equal(lost.root.querySelector('#rematch').hidden,false);lost.root.querySelector('#rematch').click();assert.equal(lost.state.outcome,null);assert.equal(lost.root.querySelectorAll('.gomoku-cell:not([data-stone="0"])').length,0);lost.close();
// Complete draw from alternating legal moves, plus rematch.
const groups=[[],[],[]];for(let r=0;r<15;r++)for(let c=0;c<15;c++)groups[(r+2*c)%4<2?1:2].push(r*15+c);const draw=fixture({humanFirst:groups[1].length>groups[2].length,moves:groups[2]});await tick();for(const i of groups[1]){draw.click(i);await tick();}assert.equal(draw.state.outcome,'draw');assert.ok(!canEnter(undefined,draw.state,rules));draw.root.querySelector('#rematch').click();assert.equal(draw.state.outcome,null);draw.close();
// Bad engine output is locked, retry can recover, destroy rejects stale output.
const invalid=fixture({pending:true});invalid.requests[0].resolve(-1);await tick();assert.equal(invalid.root.dataset.phase,'error');assert.ok(!canEnter(undefined,invalid.state,rules));assert.equal(invalid.root.querySelector('#rematch').textContent,'Retry');invalid.root.querySelector('#rematch').click();invalid.requests.at(-1).resolve(112);await tick();assert.equal(invalid.root.dataset.phase,'human');invalid.click(113);const late=invalid.requests.at(-1);invalid.close();assert.ok(late.signal.aborted);late.resolve(114);await tick();assert.equal(invalid.root.querySelectorAll('[data-stone="2"]').length,1);
console.log('PASS independent DOM: second-player opening, duplicate/occupied clicks, reset cancellation, obsolete responses, pause/resume, keyboard focus, human win, explicit one-hour entry, loss/draw/rematch, engine failure/retry, destroy. No layout/browser/physical-device claim.');
clock.restore();
await window.happyDOM.close();
