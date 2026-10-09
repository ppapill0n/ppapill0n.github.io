// Optional actual-adapter / renderer integration. Synthetic events and canvas
// recording are not physical-device or browser layout verification.
// HAPPY_DOM_MODULE=/tmp/cube-dom/node_modules/happy-dom/lib/index.js node tests/cube-dom.mjs
import assert from 'node:assert/strict';
import {createCubeGame} from '../gate/common/cube-game.js';
import {FACES,solvedCube,scramble,stickerCenter,rotate,turnLayer} from '../gate/common/cube-engine.js';
const {Window}=await import(process.env.HAPPY_DOM_MODULE||'happy-dom');
const window=new Window({url:'https://example.test/gate/'}),document=window.document;
const frames=new Map();let frameId=0,now=0,polygons=[],path=[];
const ctx={setTransform(){},clearRect(){polygons=[];},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},fill(){polygons.push({points:path,color:this.fillStyle});},stroke(){}};
Object.assign(globalThis,{window,document,AbortController:window.AbortController,requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id)});
window.HTMLCanvasElement.prototype.getContext=()=>ctx;
window.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,width:420,height:340,right:420,bottom:340});
window.HTMLElement.prototype.setPointerCapture=function(id){this.captured=id;};
window.HTMLElement.prototype.hasPointerCapture=function(id){return this.captured===id;};
window.HTMLElement.prototype.releasePointerCapture=function(id){if(this.captured===id)this.captured=null;};
function tick(){now+=64;const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(now));}
function settle(){for(let i=0;i<6;i++)tick();}
// Independent matrix columns and Rodrigues rotation; no quaternion helpers.
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function screenTurn(v,dx,dy){const angle=Math.hypot(dx,dy);if(!angle)return v;const axis=[dy/angle,dx/angle,0],c=Math.cos(angle),s=Math.sin(angle),dot=axis.reduce((n,a,i)=>n+a*v[i],0),perp=cross(axis,v);return v.map((n,i)=>n*c+perp[i]*s+axis[i]*dot*(1-c));}
const defaultBasis=()=>[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotate(rotate(v,1,-.58),0,.42));
let basis=defaultBasis();
const camera=v=>[0,1,2].map(row=>v.reduce((n,component,col)=>n+component*basis[col][row],0));
const project=v=>{const p=camera(v);return [210+p[0]*60,170-p[1]*60,p[2]];};
function checkImage(stickers,size,label){
  const expected=[];
  for(const sticker of stickers){if(camera(sticker.n)[2]<=.001)continue;const axis=sticker.n.findIndex(n=>n!==0),a=(axis+1)%3,b=(axis+2)%3,center=stickerCenter(sticker,size),half=size===2?.72:.47;
    const points=[[-half,-half],[half,-half],[half,half],[-half,half]].map(([x,y])=>{const p=[...center];p[a]+=x;p[b]+=y;return project(p);});expected.push({points,color:FACES[sticker.color].color,depth:points.reduce((n,p)=>n+p[2],0)/4});}
  // Match polygons by all vertices, avoiding unstable ordering of symmetric
  // same-depth / same-X polygons at perfectly aligned screen orientations.
  const actual=[...polygons];assert.equal(actual.length,expected.length,label);
  for(const p of expected){const match=actual.findIndex(candidate=>candidate.color===p.color&&p.points.every((v,j)=>v.slice(0,2).every((x,k)=>Math.abs(candidate.points[j][k]-x)<1e-7)));assert.ok(match>=0,`${label}: expected rendered polygon`);actual.splice(match,1);}
}
const describe=stickers=>Object.values(FACES).map(({axis,sign,name})=>`${name}: ${stickers.filter(s=>s.n[axis]===sign).sort((a,b)=>b.p[(axis+2)%3]-a.p[(axis+2)%3]||a.p[(axis+1)%3]-b.p[(axis+1)%3]).map(s=>({U:'white',R:'red',F:'green',D:'yellow',L:'orange',B:'blue'})[s.color]).join(', ')}`).join('. ');
let checks=0,turns=0;
for(const size of [2,3]){
  const root=document.createElement('div');document.body.append(root);const game=createCubeGame(root,()=>{},size),canvas=root.querySelector('canvas');
  const challenge=scramble(()=>.371,size===2?15:25,size);let expected=challenge.stickers;game.reset(challenge);basis=defaultBasis();
  const state=()=>root.querySelector('#cube-accessible').textContent;
  const event=(type,x,y,pointerType='mouse')=>canvas.dispatchEvent(new window.PointerEvent(type,{pointerId:7,button:0,clientX:x,clientY:y,pointerType,bubbles:true,cancelable:true}));
  function orbit(start,delta,pointerType='mouse'){
    event('pointerdown',...start,pointerType);
    for(let step=1;step<=5;step++){event('pointermove',start[0]+delta[0]*step/5,start[1]+delta[1]*step/5,pointerType);basis=basis.map(v=>screenTurn(v,delta[0]/5*3.8/420,delta[1]/5*3.8/420));checkImage(expected,size,`${size}: orbit ${checks++}`);}
    event('pointerup',start[0]+delta[0],start[1]+delta[1],pointerType);assert.equal(state(),describe(expected));assert.ok(game.getState().stopped);
  }
  function key(key){canvas.dispatchEvent(new window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));}
  function home(){key('Home');basis=defaultBasis();checkImage(expected,size,'Home');}
  function faceTurn(){
    const sticker=solvedCube(size).find(s=>camera(s.n)[2]>.3),normalAxis=sticker.n.findIndex(n=>n!==0),axis=(normalAxis+1)%3,point=stickerCenter(sticker,size),center=sticker.n.map(n=>n*1.505),turned=rotate(center,axis,.00001),start=project(point),end=project(point.map((n,i)=>n+turned[i]-center[i])),length=Math.hypot(end[0]-start[0],end[1]-start[1]),delta=[(end[0]-start[0])/length*40,(end[1]-start[1])/length*40];
    for(const sign of [1,-1]){event('pointerdown',...start);event('pointermove',start[0]+delta[0]*sign,start[1]+delta[1]*sign);event('pointerup',start[0]+delta[0]*sign,start[1]+delta[1]*sign);settle();expected=turnLayer(expected,{axis,layer:sticker.p[axis],angle:sign*Math.PI/2});assert.equal(state(),describe(expected));checkImage(expected,size,'slice after orbit');turns++;}
  }
  checkImage(expected,size,'default');
  // Repeated straight strokes span over five full turns per direction. Check every
  // intermediate render, so a clamp or perpendicular-axis switch cannot hide.
  for(const [start,delta] of [[[10,10],[390,0]],[[10,10],[0,300]],[[10,10],[390,300]],[[410,330],[-390,-300]]]){
    home();for(let i=0;i<12;i++){orbit(start,delta,i%2?'touch':'mouse');faceTurn();}
  }
  home();for(let i=0;i<70;i++){key('ArrowDown');basis=basis.map(v=>screenTurn(v,0,.15));checkImage(expected,size,'keyboard vertical');}
  for(let i=0;i<70;i++){key('ArrowRight');basis=basis.map(v=>screenTurn(v,.15,0));checkImage(expected,size,'keyboard horizontal');}
  faceTurn();home();
  // An on-cube cancellation discards its preview without changing view or puzzle.
  const front=solvedCube(size).find(s=>camera(s.n)[2]>.5),start=project(stickerCenter(front,size));event('pointerdown',...start);event('pointermove',start[0]+40,start[1]+15);event('pointercancel',start[0]+40,start[1]+15);assert.equal(state(),describe(expected));checkImage(expected,size,'cancel');
  // Reset cancels orbit/queued moves, restores default camera and original puzzle.
  orbit([10,10],[300,100]);key('r');key('r');game.reset(challenge);expected=challenge.stickers;basis=defaultBasis();settle();assert.equal(state(),describe(expected));checkImage(expected,size,'reset');
  game.destroy();root.remove();assert.equal(frames.size,0);
}
console.log(`PASS 2×2 + 3×3 actual-adapter renderer, ${checks} orbit frames, ${turns} face/inverse turns after rotations, keyboard beyond poles, synthetic mouse/touch paths, cancel/reset and cleanup`);
