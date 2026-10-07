import test from 'node:test';
import assert from 'node:assert/strict';
import { FACES, solvedCube, turn, isSolved, scramble, rotate } from '../gate/cube-engine.js';
import { createRegistry, chooseGame } from '../gate/registry.js';
const key=cube=>JSON.stringify(cube);
test('six conventional centers, opposite colors, 54 unique stickers',()=>{
  const cube=solvedCube();assert.ok(isSolved(cube));assert.equal(cube.length,54);
  assert.equal(new Set(cube.map(s=>`${s.p}:${s.n}`)).size,54);
  for(const face of Object.keys(FACES))assert.equal(cube.filter(s=>s.color===face).length,9);
  assert.equal(FACES.U.sign,-FACES.D.sign);assert.equal(FACES.R.axis,FACES.L.axis);assert.equal(FACES.F.axis,FACES.B.axis);
});
test('all legal turns have exact inverse and order four, maintain cubies and centers',()=>{
  const start=scramble(()=>.31).stickers;
  for(const face of Object.keys(FACES)) {
    assert.equal(key(turn(turn(start,face),face,true)),key(start));
    let state=start;for(let i=0;i<4;i++)state=turn(state,face);assert.equal(key(state),key(start));
    const moved=turn(solvedCube(),face);assert.ok(!isSolved(moved));
    assert.equal(moved.filter((s,i)=>key(s)!==key(solvedCube()[i])).length,20);
    assert.equal(new Set(moved.map(s=>`${s.p}:${s.n}`)).size,54);
    for(const s of moved){assert.ok(s.p.every(Number.isInteger));assert.equal(s.n.reduce((v,n)=>v+Math.abs(n),0),1);}
  }
});
test('right face clockwise maps its upper-front corner to upper-back; opposite turns commute',()=>{
  const cube=solvedCube(),i=cube.findIndex(s=>key(s.p)==='[1,1,1]'&&s.color==='R');
  assert.deepEqual(turn(cube,'R')[i].p,[1,1,-1]);
  // Clockwise viewed from +X: upper/front moves to upper/back (screen right).
  for(const [a,b] of [['R','L'],['U','D'],['F','B']])assert.equal(key(turn(turn(cube,a),b)),key(turn(turn(cube,b),a)));
});
test('legal scrambles never start solved, even constant RNG; reversing them restores all stickers',()=>{
  for(let seed=0;seed<80;seed++) {
    let n=seed+1;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/2**32;};
    const {stickers,moves}=scramble(random);assert.ok(!isSolved(stickers));let cube=stickers;
    for(const m of [...moves].reverse())cube=turn(cube,m.face,!m.inverse);
    assert.equal(key(cube),key(solvedCube()));
  }
  for(const r of [0,.5,.999999])assert.ok(!isSolved(scramble(()=>r).stickers));
});
test('solved predicate accepts all 24 whole-cube orientations and rejects a turned face in each',()=>{
  const pending=[solvedCube()],seen=new Set();
  while(pending.length){const cube=pending.pop(),id=key(cube);if(seen.has(id))continue;seen.add(id);assert.ok(isSolved(cube));assert.ok(!isSolved(turn(cube,'F')));
    for(let axis=0;axis<3;axis++)pending.push(cube.map(s=>({...s,p:rotate(s.p,axis,Math.PI/2).map(Math.round),n:rotate(s.n,axis,Math.PI/2).map(Math.round)})));
  }
  assert.equal(seen.size,24);
});
test('five uniform game slots; cube hides target and supplies a fresh legal scramble',()=>{
  const registry=createRegistry();assert.equal(registry.length,5);
  assert.deepEqual([.1,.3,.5,.7,.9].map(n=>chooseGame(registry,()=>n).id),['dial','cannon','slots','soda','cube']);
  const cube=registry.find(g=>g.id==='cube');assert.ok(cube.hideTarget);assert.ok(!isSolved(cube.next().stickers));assert.notEqual(key(cube.next().stickers),key(cube.next().stickers));
});
