import test from 'node:test';
import assert from 'node:assert/strict';
import { sweepAngle, chargePower, trajectory, flightPoint, landingCode } from '../gate/cannon-physics.js';
import { createRegistry, chooseGame } from '../gate/registry.js';
import { canEnter } from '../gate/engine.js';
test('one-second sweep and half-second capped charge are independent of frame rate',()=>{
  for(const fps of [30,60,120]){
    for(let f=0;f<=fps*3;f++){
      const t=f*1000/fps;
      assert.ok(Math.abs(sweepAngle(t)-sweepAngle(t+1000))<1e-10);
      assert.ok(sweepAngle(t)>=0&&sweepAngle(t)<=90);
      assert.equal(chargePower(t),Math.min(1,t/500));
    }
  }
  assert.deepEqual([0,250,500,750,1000].map(sweepAngle),[0,45,90,45,0]);
  assert.equal(chargePower(499),.998);assert.equal(chargePower(500),1);assert.equal(chargePower(5000),1);
});
test('all 0001–1000 targets are physically reachable at 45 degrees',()=>{
  for(let code=1;code<=1000;code++){
    let lo=0,hi=1;
    for(let n=0;n<45;n++){const mid=(lo+hi)/2;if(trajectory(45,mid).distance<code/10)lo=mid;else hi=mid;}
    const shot=trajectory(45,(lo+hi)/2);
    assert.equal(landingCode(shot.distance),code);
    assert.ok(shot.duration>0&&shot.duration<3);
    assert.equal(flightPoint(shot,shot.duration).y,0);
  }
});
test('rounding, boundary angles and out-of-view flight completion',()=>{
  for(const [metres,code] of [[0,0],[.049999,0],[.05,1],[.149999,1],[.15,2],[99.949999,999],[99.95,1000],[100.049999,1000],[100.05,1001]])assert.equal(landingCode(metres),code);
  for(const angle of [0,45,90])for(const power of [0,.1,.5,1]){
    const shot=trajectory(angle,power);assert.ok(shot.duration>0&&shot.duration<3);
    const end=flightPoint(shot,shot.duration+1);assert.ok(end.y<1e-10);assert.equal(end.x,shot.distance);
  }
  assert.ok(trajectory(45,1).distance>100);
  assert.equal(trajectory(90,1).distance,0);
  assert.ok(!canEnter(1000,{value:1000,stopped:false}));assert.ok(canEnter(1000,{value:1000,stopped:true}));
});
test('registry uniformly partitions cannon codes and allows repeated game selection',()=>{
  for(let code=1;code<=1000;code++){
    const registry=createRegistry(()=>(code-.5)/1000);
    assert.equal(registry.find(g=>g.id==='cannon').next().target,code);
  }
  const registry=createRegistry(()=>0);
  assert.equal(chooseGame(registry,()=>0).id,'dial');assert.equal(chooseGame(registry,()=>.5).id,'cannon');
  assert.equal(chooseGame(registry,()=>.9).id,chooseGame(registry,()=>.9).id);
});
test('flight sampling at 30/60/120fps produces the same landing code without clamping',()=>{
  const shot=trajectory(45,1);
  const codes=[];
  for(const fps of [30,60,120]){
    let elapsed=0,point;
    do{elapsed+=1/fps;point=flightPoint(shot,elapsed);}while(elapsed<shot.duration);
    assert.equal(point.y,0);assert.ok(point.x>100);
    codes.push(landingCode(point.x));
  }
  assert.equal(new Set(codes).size,1);
});
test('cannon tolerance is inclusive ±5 displayed code units, landing only; dial stays exact',()=>{
  const registry=createRegistry(()=>.5);
  const cannon=registry.find(g=>g.id==='cannon').rules;
  const dial=registry.find(g=>g.id==='dial').rules;
  for(const [target,landed,expected] of [[500,495,true],[500,505,true],[500,494,false],[500,506,false],[1,0,true],[1,6,true],[1,7,false],[1000,995,true],[1000,1005,true],[1000,994,false],[1000,1006,false]]){
    assert.equal(canEnter(target,{value:landed,stopped:true},cannon),expected);
    assert.equal(canEnter(target,{value:landed,stopped:false},cannon),false);
  }
  assert.equal(canEnter(1,{value:null,stopped:true},cannon),false);
  assert.equal(canEnter(1,{value:undefined,stopped:true},cannon),false);
  assert.equal(canEnter(500,{value:landingCode(50.549),stopped:true},cannon),true);
  assert.equal(canEnter(500,{value:landingCode(50.55),stopped:true},cannon),false);
  for(const delta of [-5,-1,0,1,5])assert.equal(canEnter(500,{value:500+delta,stopped:true},dial),delta===0);
});
