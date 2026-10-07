import test from 'node:test';
import assert from 'node:assert/strict';
import {pickSurface,project,chooseDrag,dragCandidates} from '../gate/cube-gestures.js';
import {solvedCube,rotate,turnLayer,isSolved} from '../gate/cube-engine.js';
const views=[[-.58,.42],[.7,.55],[2.4,.4],[-2.2,-.6],[.4,-1.2],[-.9,1.2]];
test('ray picking resolves every visible sticker center and seams at six varied front/back/bottom views',()=>{
  for(const [yaw,pitch] of views)for(const sticker of solvedCube()){
    const point=sticker.p.map((v,i)=>v+sticker.n[i]*.505),screen=project(point,yaw,pitch),normal=project(sticker.n,yaw,pitch);
    if(normal[2]<.08)continue;
    const hit=pickSurface(screen[0],screen[1],yaw,pitch);assert.ok(hit);
    assert.deepEqual(hit.normal,sticker.n);assert.deepEqual(hit.cubie,sticker.p);
    assert.ok(hit.point.every((v,i)=>Math.abs(v-point[i])<1e-8));
  }
  const seam=project([.5,0,1.505],-.58,.42);assert.equal(pickSurface(seam[0],seam[1],-.58,.42).cubie[0],1);
  for(const offset of [-.02,0,.02]){const p=project([.5+offset,0,1.505],-.58,.42);assert.equal(pickSurface(p[0],p[1],-.58,.42).cubie[0],1);}
  assert.equal(pickSurface(5,5,-.58,.42),null);
});
test('projected face-grid pushing selects axis, picked layer and sign across visible faces and reverse swipes',()=>{
  let cases=0;
  for(const [yaw,pitch] of views)for(const sticker of solvedCube()){
    const point=sticker.p.map((v,i)=>v+sticker.n[i]*.505),start=project(point,yaw,pitch);
    if(project(sticker.n,yaw,pitch)[2]<.08)continue;
    const hit=pickSurface(start[0],start[1],yaw,pitch);
    for(const axis of [0,1,2].filter(a=>a!==hit.axis))for(const sign of [-1,1]){
      // Independent finite face-center rotation projects the visible grid's push direction.
      const faceCenter=sticker.n.map(v=>v*1.505),turned=rotate(faceCenter,axis,sign*.0001);
      const end=project(point.map((v,i)=>v+turned[i]-faceCenter[i]),yaw,pitch),dx=end[0]-start[0],dy=end[1]-start[1];
      const move=chooseDrag(hit,dx,dy,yaw,pitch);assert.equal(move.axis,axis);assert.equal(move.layer,sticker.p[axis]);assert.equal(Math.sign(move.angle),sign);cases++;
    }
  }
  assert.ok(cases>=600);
});
test('diagonal ties are deterministic, reverse direction reverses the same layer',()=>{
  for(const [yaw,pitch] of views){const p=project([0,0,1.505],yaw,pitch),hit=pickSurface(p[0],p[1],yaw,pitch);if(!hit)continue;
    for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){const a=chooseDrag(hit,dx,dy,yaw,pitch),b=chooseDrag(hit,-dx,-dy,yaw,pitch);assert.equal(a.axis,b.axis);assert.equal(a.layer,b.layer);assert.equal(a.angle,-b.angle);}
  }
});
test('all three inner slices are legal, conserve cubies, reverse exactly, and have order four',()=>{
  for(let axis=0;axis<3;axis++){
    const initial=solvedCube(),spec={axis,layer:0,angle:Math.PI/2};let cube=turnLayer(initial,spec);assert.ok(!isSolved(cube));assert.equal(new Set(cube.map(s=>`${s.p}:${s.n}`)).size,54);
    const reverse=turnLayer(cube,{...spec,angle:-spec.angle});assert.equal(JSON.stringify(reverse),JSON.stringify(initial));
    for(let i=0;i<3;i++)cube=turnLayer(cube,spec);assert.equal(JSON.stringify(cube),JSON.stringify(initial));
  }
});
