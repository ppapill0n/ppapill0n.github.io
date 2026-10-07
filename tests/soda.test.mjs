import test from 'node:test';
import assert from 'node:assert/strict';
import { SodaPhysics, STEP } from '../gate/soda-physics.js';
import { createRegistry, chooseGame } from '../gate/registry.js';
import { canEnter } from '../gate/engine.js';
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
function pour(x,seconds=5,fps=60,y=155) {
  const m=new SodaPhysics(); m.grab();m.move(x,y);
  for(let n=0;n<Math.round(seconds*fps);n++) m.advance(1/fps);
  m.release();for(let n=0;n<8*fps;n++) m.advance(1/fps);
  return m;
}
test('uniform inclusive 0000–3000; four equal game partitions; same game can recur',()=>{
  for(let n=0;n<=3000;n++) assert.equal(createRegistry(()=>(n+.5)/3001).find(g=>g.id==='soda').next().target,n);
  const registry=createRegistry();
  assert.deepEqual([0,.25,.5,.75,.999999].map(r=>chooseGame(registry,()=>r).id),['dial','cannon','slots','soda','soda']);
});
test('zero is stable indefinitely; matching is exact rounded tenths, only after settling',()=>{
  const m=new SodaPhysics();m.advance(20);assert.equal(m.bottle,450);assert.ok(m.stopped);assert.equal(m.value,0);
  assert.ok(canEnter(0,{value:m.value,stopped:m.stopped}));m.grab();assert.ok(!m.stopped);
  for(const [ml,code] of [[.049,0],[.051,1],[299.949,2999],[300.049,3000],[300.051,3001]]) {
    m.cup=ml;assert.equal(m.value,code);assert.equal(canEnter(3000,{value:m.value,stopped:true}),code===3000);
  }
});
test('fixed-step 30/60/120 Hz agree for bottle, slosh, catches, spills and delayed neck drainage',()=>{
  const runs=[30,60,120].map(fps=>pour(245,9,fps));
  for(const m of runs) {near(m.total,450);near(m.cup,runs[0].cup);near(m.spilled,runs[0].spilled);near(m.bottle,runs[0].bottle);assert.ok(m.stopped);assert.ok(m.cup>300);}
});
test('conservation every tick through free flight, catches, misses and overflowing capacity',()=>{
  for(const x of [195,210,245]) {
    const m=new SodaPhysics();m.grab();m.move(x,150);
    for(let i=0;i<20/STEP;i++){m.step();near(m.total,450);assert.ok(m.bottle>=0&&m.lip>=0&&m.cup<=420);}
    m.release();m.advance(8);near(m.total,450);
    if(x===210)assert.ok(m.spilled>m.cup);
    if(x===245){assert.equal(m.cup,420);assert.ok(m.spilled>0);assert.equal(m.value,4200);}
  }
});
test('release leaves sloshing and airborne mass; later arrivals count and Enter waits',()=>{
  const m=new SodaPhysics();m.grab();m.move(245,150);m.advance(3);
  const before=m.cup,slosh=m.slosh;m.release();assert.ok(!m.stopped);assert.ok(m.particles.length>0&&m.lip>0);
  m.advance(.1);assert.notEqual(m.slosh,slosh);assert.ok(m.cup>before);assert.ok(!m.stopped);
  m.advance(8);assert.ok(m.stopped);assert.ok(m.cup>before+1);near(m.total,450);
});
test('fine drags physically reach each 0.1 mL bin from 0.0 to 3.0; no target supplied to simulation',()=>{
  for(let code=1;code<=30;code++) {
    let low=188,high=191, result;
    for(let i=0;i<15;i++) {const x=(low+high)/2;result=pour(x,2);if(result.value===code)break;if(result.value<code)low=x;else high=x;}
    assert.equal(result.value,code);assert.ok(result.stopped);near(result.total,450);
  }
});
test('300.0 is reachable without a cap; overshoot and retry are conserved independent attempts',()=>{
  // Fine spatial adjustment covers the sub-frame gap at the upper endpoint.
  let low=242,high=243,result;
  for(let i=0;i<22;i++) {const x=(low+high)/2;result=pour(x,8.3,120,150);if(result.value===3000)break;if(result.value<3000)low=x;else high=x;}
  assert.equal(result.value,3000);assert.ok(result.stopped);
  const over=pour(245,10);assert.ok(over.value>3000);over.reset();assert.equal(over.value,0);assert.equal(over.total,450);assert.equal(over.particles.length,0);assert.equal(over.lip,0);
});
