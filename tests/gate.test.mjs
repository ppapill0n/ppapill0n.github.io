import test from 'node:test';
import assert from 'node:assert/strict';
import { createGate, formatValue } from '../gate/engine.js';
import { InertiaDial, wrap } from '../gate/dial.js';

function fixture() {
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  let callback = null;
  globalThis.requestAnimationFrame = fn => { callback = fn; return 1; };
  globalThis.cancelAnimationFrame = () => { callback = null; };
  const el = new EventTarget();
  let captured = null;
  el.focus = () => {};
  el.getBoundingClientRect = () => ({ left:0, top:0, width:200, height:200 });
  el.setPointerCapture = id => { captured = id; };
  el.hasPointerCapture = id => captured === id;
  el.releasePointerCapture = () => { captured = null; };
  const dial = new InertiaDial(el, () => {});
  const down = (key, extra = {}) => dial.key({ key, preventDefault() {}, ...extra });
  const up = key => { const e = new Event('keyup'); e.key = key; window.dispatchEvent(e); };
  const run = (seconds, fps = 60) => {
    for (let i=0; i<Math.round(seconds*fps) && callback; i++) {
      const fn=callback; callback=null; fn(dial.lastFrame+1000/fps);
    }
  };
  return { dial, el, down, up, run, pending:()=>callback !== null };
}

test('all targets: no immediate win or repeated target; strict configurable judgment', () => {
  for (let value=0; value<10000; value++) {
    const gate=createGate(undefined,()=>(value+.1)/10000);
    const c=gate.next();
    assert.equal(c.target,value); assert.notEqual(c.start,value);
    assert.equal(formatValue(value).length,4);
    assert.equal(gate.canEnter({value,stopped:true}),true);
    assert.equal(gate.canEnter({value,stopped:false}),false);
    assert.equal(gate.canEnter({value:wrap(value+1),stopped:true}),false);
    assert.notEqual(gate.next().target,value);
  }
  const relaxed=createGate({requireStopped:false},()=>0);
  relaxed.next();assert.equal(relaxed.canEnter({value:0,stopped:false}),true);
});

test('keyboard impulse, frame-driven acceleration, reverse braking, coast and repeat immunity', () => {
  const {dial,down,up,run}=fixture();dial.reset(0);
  down('ArrowRight');assert.equal(dial.velocity,80);assert.equal(dial.position,0);
  assert.equal(dial.getState().stopped,false);
  for(let n=0;n<50;n++) down('ArrowRight',{repeat:true});
  assert.equal(dial.velocity,80);
  run(.5);const speed=dial.velocity;assert.ok(speed>600);
  up('ArrowRight');down('ArrowLeft');run(.1);
  assert.ok(dial.velocity>0 && dial.velocity<speed);
  run(.5);assert.ok(dial.velocity<0);
  up('ArrowLeft');const before=dial.position;run(.1);
  assert.notEqual(dial.position,before);assert.equal(dial.getState().stopped,false);
  run(2);assert.equal(dial.velocity,0);assert.equal(dial.getState().stopped,true);
  assert.equal(dial.position,Math.round(dial.position));
});

test('physics is consistent at 30/60/120fps and Shift adds no alternate mode', () => {
  const outcomes=[];
  for(const fps of [30,60,120]) {
    const {dial,down,run}=fixture();dial.reset(0);down('ArrowRight',{shiftKey:fps===60});run(1,fps);
    outcomes.push([dial.position,dial.velocity]);
  }
  for(const [position,velocity] of outcomes) {
    assert.ok(Math.abs(position-outcomes[0][0])<1e-7);
    assert.ok(Math.abs(velocity-outcomes[0][1])<1e-7);
  }
});

test('opposite keys stay active even at zero speed; reset/blur/visibility clear inputs', () => {
  const {dial,down,up,run,pending}=fixture();dial.reset(0);
  down('ArrowRight');down('ArrowLeft');run(2);
  assert.equal(dial.velocity,0);assert.equal(dial.getState().stopped,false);
  up('ArrowRight');run(.2);assert.ok(dial.velocity<0);
  dial.reset(42);assert.deepEqual(dial.getState(),{value:42,stopped:true});assert.equal(pending(),false);
  down('ArrowLeft',{repeat:true});assert.equal(dial.velocity,0);
  up('ArrowLeft');assert.equal(pending(),false);
  down('ArrowRight');window.dispatchEvent(new Event('blur'));
  assert.equal(dial.getState().stopped,true);assert.equal(dial.keys.size,0);
  down('ArrowRight');document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(dial.getState().stopped,true);assert.equal(pending(),false);
});

test('every integer is reachable by ordinary drag with no fine mode; resets release capture', () => {
  const {dial}=fixture();
  const pointer=(angle,time)=>({pointerId:7,button:0,clientX:100+80*Math.cos(angle),clientY:100+80*Math.sin(angle),timeStamp:time,preventDefault(){}});
  for(let value=0;value<10000;value++) {
    dial.reset(0);dial.grab(pointer(0,0));
    let t=0;
    const end=value/1200;
    for(let angle=1;angle<end;angle++) dial.move(pointer(angle,++t*16));
    dial.move(pointer(end,++t*16));
    assert.equal(dial.getState().stopped,false);
    dial.release(pointer(end,t*16+200));
    assert.deepEqual(dial.getState(),{value,stopped:true});
  }
  dial.grab(pointer(0,0));dial.move(pointer(.2,16));dial.reset(99);
  assert.deepEqual(dial.getState(),{value:99,stopped:true});assert.equal(dial.pointer,null);
  dial.position=9999.8;dial.snap();assert.equal(dial.getState().value,0);
});
