import test from 'node:test';
import assert from 'node:assert/strict';
import { slotSymbols, drawReels, slotsWin, slotsBonus, reelDurations, reelPosition } from '../gate/games/slots/engine.js';
import { createRegistry, chooseGame } from '../gate/registry.js';
import { canEnter } from '../gate/common/engine.js';
test('exactly seven symbols, three separate uniform draws, every combination possible',()=>{
  assert.deepEqual(slotSymbols,['cherry','lemon','grapes','gem','nokyong','panda','seven']);
  const counts=Array.from({length:3},()=>Array(7).fill(0));let wins=0,bonuses=0;
  for(let a=0;a<7;a++)for(let b=0;b<7;b++)for(let c=0;c<7;c++){
    const expected=[a,b,c];let calls=0;
    const result=drawReels(()=> (expected[calls++]+.5)/7);
    assert.equal(calls,3);assert.deepEqual(result,expected);
    result.forEach((value,index)=>counts[index][value]++);
    wins+=Number(slotsWin(result,true));bonuses+=Number(slotsBonus(result,true));
    assert.equal(slotsWin(result,false),false);assert.equal(slotsBonus(result,false),false);
    assert.equal(slotsWin(result,true),a===b&&b===c);
    assert.equal(slotsBonus(result,true),a===b&&b===c&&a!==6);
  }
  counts.flat().forEach(n=>assert.equal(n,49));assert.equal(wins,7);assert.equal(bonuses,6);
});
test('all seven settled triples unlock entry; six non-seven triples also celebrate',()=>{
  const rules=createRegistry().find(game=>game.id==='slots').rules;
  for(let symbol=0;symbol<7;symbol++){
    const result=[symbol,symbol,symbol];
    assert.equal(slotsBonus(result,true),symbol<6);
    assert.equal(canEnter(777,{value:slotsWin(result,true)?777:0,stopped:true},rules),true);
  }
  assert.equal(canEnter(777,{value:777,stopped:false},rules),false);
  assert.equal(slotsBonus([0,0,1],true),false);assert.equal(slotsWin([6,6,5],true),false);
});
test('fixed 777 formatting and equal registry partitions; repeated slots selection allowed',()=>{
  const registry=createRegistry(()=>{throw Error('Fixed target must not draw randomness');});
  const slots=registry.find(game=>game.id==='slots');assert.equal(slots.next().target,777);assert.equal(slots.formatTarget(777),'777');
  assert.deepEqual([.5,1.5,2.5,3.5,4.5,5.5,6.5].map(n=>n/7).map(r=>chooseGame(registry,()=>r).id),['dial','cannon','slots','soda','cube','cube2','gomoku']);
  assert.equal(slots.next().target,777);
});
test('each reel finishes independently, all outcomes fit the strip, timing is frame-rate independent',()=>{
  assert.deepEqual(reelDurations,[1280,1760,2240]);
  for(let start=0;start<7;start++)for(let end=0;end<7;end++)for(let index=0;index<3;index++){
    assert.equal(reelPosition(start,end,index,0),start);
    const position=reelPosition(start,end,index,reelDurations[index]);
    assert.equal(position%7,end);assert.ok(position<56);
    for(const fps of [30,60,120]){
      const time=Math.ceil(reelDurations[index]/(1000/fps))*1000/fps;
      assert.equal(reelPosition(start,end,index,time),position);
    }
  }
});
