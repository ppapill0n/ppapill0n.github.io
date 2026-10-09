import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, HUMAN, PANDA, emptyBoard, legalMove, winningLine, createMatch } from '../gate/games/gomoku/rules.js';
import { chooseMove, SEARCH_LIMITS, seededRandom } from '../gate/games/gomoku/ai.js';
import { createEvaluator } from '../gate/games/gomoku/vendor/evaluator.js';
import { canEnter } from '../gate/common/engine.js';
import { createRegistry } from '../gate/registry.js';

const rules = createRegistry().find(game => game.id === 'gomoku').rules;
test('freestyle accepts at least five in every direction, including overlines and edges', () => {
  for (const [start, step] of [[0,1],[0,15],[0,16],[14,14],[224,-1],[224,-15]]) for (const count of [4,5,6]) {
    const board=emptyBoard(); for(let n=0;n<count;n++)board[start+n*step]=HUMAN;
    assert.equal(winningLine(board,start).length>=5,count>=5);
  }
  const board=emptyBoard(); [13,14,15,16,17].forEach(i=>board[i]=1); assert.equal(winningLine(board,14).length,0,'rows do not wrap');
});
test('turn, duplicate, invalid and terminal placement guards; only human victory enables entry', () => {
  const match=createMatch();
  for(const index of [-1,225,1.5,NaN,'1']) assert.equal(match.play(index),false);
  assert.equal(match.play(0,PANDA),false);assert.equal(match.play(0,HUMAN),true);assert.equal(match.play(0),false);
  for(const [p,h] of [[30,1],[32,2],[34,3],[36,4]]) { assert.ok(match.play(p,PANDA)); assert.ok(match.play(h,HUMAN)); }
  assert.equal(match.outcome,'human'); assert.equal(match.play(10,PANDA),false);
  for(const outcome of [null,'panda','draw','human']) for(const stopped of [false,true]) {
    assert.equal(canEnter(undefined,{outcome,stopped},rules),outcome==='human'&&stopped);
  }
  assert.equal(canEnter(1,{value:1,stopped:true},rules),false,'numeric matches cannot unlock Gomoku');
});
test('a complete legal draw is detected, without granting entry', () => {
  const groups=[[],[],[]];for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)groups[(r+2*c)%4<2?HUMAN:PANDA].push(r*SIZE+c);
  const match=createMatch(groups[HUMAN].length>groups[PANDA].length);
  while(!match.outcome){const next=groups[match.turn].shift();assert.notEqual(next,undefined);assert.ok(match.play(next));}
  assert.equal(match.moves.length,225);assert.equal(match.outcome,'draw');assert.equal(canEnter(null,{outcome:'draw',stopped:true},rules),false);
});
test('AI takes an immediate win before blocking, blocks open threats, and never mutates input', () => {
  for(const [start,step] of [[0,1],[0,15],[0,16],[14,14]]) {
    const board=emptyBoard();for(let i=0;i<4;i++)board[start+i*step]=PANDA;
    const before=[...board], result=chooseMove(board,PANDA,7);assert.equal(result.index,start+4*step);assert.deepEqual([...board],before);
    for(let i=0;i<4;i++)board[start+i*step]=HUMAN;
    assert.equal(chooseMove(board,PANDA,7).index,start+4*step);
  }
  const board=emptyBoard();for(let i=0;i<4;i++){board[i]=HUMAN;board[30+i]=PANDA;}
  assert.equal(chooseMove(board,PANDA,1).index,34);
});
test('AI bounded searches return only legal cells and deterministic seeded choices', () => {
  const random=seededRandom(42),board=emptyBoard();assert.equal(chooseMove(board).index,112);
  for(let n=0;n<90;n++){
    let index;do{index=Math.floor(random()*225);}while(!legalMove(board,index));board[index]=n%2+1;
    const seed=Math.floor(random()*1e9), result=chooseMove(board,PANDA,seed);
    assert.ok(legalMove(board,result.index));assert.ok(result.evaluated<=SEARCH_LIMITS.candidates*(1+SEARCH_LIMITS.replies));
    assert.deepEqual(result,chooseMove(board,PANDA,seed));
  }
  assert.throws(()=>chooseMove([0]));assert.throws(()=>chooseMove(emptyBoard(),3));
});
function brute(board) {
  let sum=0;const scores=Array(225).fill(0),weights=[0,1,10,2000,4000,100000000000];
  for(let r=0;r<15;r++)for(let c=0;c<15;c++)for(const [dr,dc] of [[1,0],[0,1],[1,1],[1,-1]]) {
    const er=r+dr*4,ec=c+dc*4;if(er>=15||ec<0||ec>=15)continue;
    const cells=Array.from({length:5},(_,i)=>(r+dr*i)*15+c+dc*i),own=cells.filter(i=>board[i]===2).length,other=cells.filter(i=>board[i]===1).length;
    const value=own&&other?0:weights[own||other];sum+=value*(own?1:-2);cells.forEach(i=>scores[i]+=value);
  }return {sum,scores};
}
test('adapted MIT evaluator agrees with independent five-cell scan after add and undo', () => {
  const random=seededRandom(998),board=emptyBoard(),engine=createEvaluator(),moves=[];
  for(let n=0;n<180;n++){
    let index,color,remove=n%4===3;
    if(remove){[index,color]=moves.pop();board[index]=0;}else{do{index=Math.floor(random()*225);}while(board[index]);color=n%2+1;board[index]=color;moves.push([index,color]);}
    engine._updateMap(Math.floor(index/15),index%15,color===2?1:0,remove);
    const expected=brute(board);assert.equal(engine.sum,expected.sum);assert.deepEqual(engine.map.flat().map(p=>p.score),expected.scores);
  }
});
