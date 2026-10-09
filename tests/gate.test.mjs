import test from 'node:test';
import assert from 'node:assert/strict';
import { createGate, formatValue } from '../gate/common/engine.js';
import { advance, physics, wrap } from '../gate/common/motion.js';
import { InertiaDial } from '../gate/games/dial/dial.js';
function fixture() {
  globalThis.window=new EventTarget();globalThis.document=new EventTarget();
  let callback=null;
  globalThis.requestAnimationFrame=fn=>{callback=fn;return 1;};
  globalThis.cancelAnimationFrame=()=>{callback=null;};
  const scope=new EventTarget();scope.contains=()=>true;
  const el=new EventTarget();el.closest=()=>scope;
  const buttons=[-1,1].map(direction=>{
    const b=new EventTarget();b.dataset={direction:String(direction)};b.focus=()=>{};
    b.captured=new Set();b.setPointerCapture=id=>b.captured.add(id);b.hasPointerCapture=id=>b.captured.has(id);b.releasePointerCapture=id=>b.captured.delete(id);return b;
  });
  const dial=new InertiaDial(el,()=>{},buttons);
  const run=(seconds,fps=120)=>{for(let i=0;i<Math.round(seconds*fps)&&callback;i++){const fn=callback;callback=null;fn(dial.lastFrame+1000/fps);}};
  return {dial,run,el,buttons,scope,pending:()=>!!callback};
}
test('every target, reroll invariants, stopped rule and boundary formatting',()=>{
  for(let value=0;value<10000;value++){
    const g=createGate(undefined,()=>(value+.1)/10000),c=g.next();
    assert.equal(c.target,value);assert.notEqual(c.start,value);assert.equal(formatValue(value).length,4);
    assert.ok(g.canEnter({value,stopped:true}));assert.ok(!g.canEnter({value,stopped:false}));assert.ok(!g.canEnter({value:wrap(value+1),stopped:true}));assert.notEqual(g.next().target,value);
  }
  const g=createGate({requireStopped:false},()=>0);g.next();assert.ok(g.canEnter({value:0,stopped:false}));
});
test('progressive speed, exact frame-rate agreement, bounded long holds',()=>{
  for(const duration of [.1,1,3,5]){
    const speeds=[];
    for(const fps of [30,60,120]){
      const {dial,run}=fixture();dial.press('key:ArrowRight',1);run(duration,fps);speeds.push(dial.velocity);
    }
    const expected=360+40*duration+60*duration**2;
    speeds.forEach(v=>assert.ok(Math.abs(v-expected)<1e-7));
    console.log(`${duration}s hold: ${speeds[0].toFixed(2)} units/s`);
  }
  const {dial,run}=fixture();dial.press('key:ArrowRight',1);run(20);assert.equal(dial.velocity,physics.maxSpeed);
});
test('opposition brakes before reversing, then release coasts to exact rest',()=>{
  const {dial,run}=fixture();dial.press('key:ArrowRight',1);run(3);
  dial.release('key:ArrowRight');dial.press('pointer:1',-1);run(.1);
  assert.ok(dial.velocity>0&&dial.velocity<1020);run(.6);assert.ok(dial.velocity<0);
  dial.release('pointer:1');const position=dial.position;run(.1);assert.notEqual(dial.position,position);
  run(2);assert.equal(dial.velocity,0);assert.ok(dial.getState().stopped);assert.equal(dial.position,Math.round(dial.position));
});
test('continuous 100ms pulses reach all integers without fixed stepping',()=>{
  const {dial,run}=fixture();dial.reset(0);
  for(let n=1;n<=10000;n++){
    dial.press('pulse',1);assert.equal(dial.getState().value,((n-1)*97)%10000);run(.1);dial.release('pulse');run(2);
    assert.deepEqual(dial.getState(),{value:(n*97)%10000,stopped:true});
  }
  dial.press('pulse',-1);run(.1);dial.release('pulse');run(2);assert.equal(dial.getState().value,9903);
});
test('keyboard/button input equivalence, opposite sources lock entry, reset blocks repeats and clears capture',()=>{
  const key=(target,key,extra={})=>({target,key,code:key,preventDefault(){},...extra});
  const a=fixture();a.dial.key(key(a.el,'ArrowRight'));a.run(1);const expected=a.dial.position;
  const b=fixture();const down=new Event('pointerdown');Object.assign(down,{pointerId:7,button:0});b.buttons[1].dispatchEvent(down);b.run(1);
  assert.ok(Math.abs(b.dial.position-expected)<1e-7);
  b.dial.press('key:ArrowLeft',-1);b.run(2);assert.equal(b.dial.velocity,0);assert.ok(!b.dial.getState().stopped);
  b.dial.reset(42);assert.deepEqual(b.dial.getState(),{value:42,stopped:true});assert.equal(b.buttons[1].captured.size,0);assert.equal(b.pending(),false);
  b.dial.key(key(b.el,'ArrowLeft',{repeat:true}));assert.equal(b.dial.velocity,0);
  b.dial.press('held',1);window.dispatchEvent(new Event('blur'));assert.ok(b.dial.getState().stopped);
  b.dial.press('held',1);document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert.ok(b.dial.getState().stopped);
});
test('pointer cancel/lost capture release only their own input; same-direction sources do not double acceleration',()=>{
  const {dial,buttons,run}=fixture();
  const event=(type,id)=>{const e=new Event(type);Object.assign(e,{pointerId:id,button:0});return e;};
  buttons[1].dispatchEvent(event('pointerdown',5));dial.press('key:ArrowRight',1);run(1);assert.ok(Math.abs(dial.velocity-460)<1e-7);
  buttons[1].dispatchEvent(event('pointercancel',5));assert.equal(dial.inputs.size,1);assert.equal(dial.pointers.size,0);
  buttons[0].dispatchEvent(event('pointerdown',6));buttons[0].dispatchEvent(event('lostpointercapture',6));assert.equal(dial.inputs.size,1);
  dial.release('key:ArrowRight');run(2);assert.ok(dial.getState().stopped);
});

test('same-frame and 20/50/100/200ms taps retain a substantial impulse',()=>{
  for(const duration of [0,.02,.05,.1,.2]){
    const {dial,run}=fixture();dial.press('pointer:1',1);
    assert.equal(dial.velocity,360);run(duration,1000);dial.release('pointer:1');run(3);
    console.log(`${duration*1000}ms tap: initial 360 units/s, final ${dial.getState().value} digits`);
    assert.ok(dial.getState().value>=60);assert.ok(dial.getState().stopped);
  }
});
