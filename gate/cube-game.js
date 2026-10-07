import { FACES, rotate, moveSpec, turnLayer, isSolved } from './cube-engine.js';
import { project, view, pickSurface, chooseDrag } from './cube-gestures.js';
const DURATION=160, THRESHOLD=9;
const clampPitch=value=>Math.max(-1.45,Math.min(1.45,value));
export function createCubeGame(root,changed) {
  root.innerHTML=`<div class="cube-view"><canvas id="cube" width="840" height="680" tabindex="0" aria-label="Drag a cube row or column to turn its layer, including middle slices. Drag the empty space around the cube to rotate the view. U R F D L B turn faces; Shift reverses. Arrow keys rotate the view; Home restores it." aria-describedby="cube-accessible"></canvas></div><p id="cube-accessible" class="sr-only"></p>`;
  const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d'),events=new AbortController();
  let stickers=[],queue=[],current=null,yaw=-.58,pitch=.42,gesture=null,last=null,frame=null,destroyed=false,paused=false;
  const listen=(el,type,fn)=>el.addEventListener(type,fn,{signal:events.signal});
  function getState(){return {value:isSolved(stickers)?1:0,stopped:!paused&&!document.hidden&&!current&&!queue.length&&!gesture};}
  function notify(){root.dataset.phase=current||queue.length||gesture?.move?'turning':gesture?'dragging':'idle';changed(getState());}
  function describe(){root.querySelector('#cube-accessible').textContent=Object.entries(FACES).map(([face,{axis,sign,name}])=>`${name}: ${stickers.filter(s=>s.n[axis]===sign).sort((a,b)=>b.p[(axis+2)%3]-a.p[(axis+2)%3]||a.p[(axis+1)%3]-b.p[(axis+1)%3]).map(s=>({U:'white',R:'red',F:'green',D:'yellow',L:'orange',B:'blue'})[s.color]).join(', ')}`).join('. ');}
  function release(){const id=gesture?.id;gesture=null;if(id!==undefined&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);canvas.style.cursor='grab';draw();notify();}
  function home(){yaw=-.58;pitch=.42;draw();}
  function enqueue(face,inverse){if(paused||document.hidden||gesture)return;const spec=moveSpec(face,inverse);queue.push({...spec,layer:spec.sign});notify();}
  function point(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*420/r.width,y:(e.clientY-r.top)*340/r.height,scale:r.width/420};}
  listen(canvas,'pointerdown',e=>{
    if(e.button!==0||gesture||paused||current||queue.length)return;
    const p=point(e),hit=pickSurface(p.x,p.y,yaw,pitch);
    e.preventDefault();canvas.dataset.pointerFocus='true';canvas.focus({preventScroll:true});
    gesture={id:e.pointerId,start:p,previous:p,hit,move:null,preview:0,travel:0};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';notify();
  });
  function movePointer(e){
    if(e.pointerId!==gesture?.id)return;
    const p=point(e),g=gesture,dx=p.x-g.start.x,dy=p.y-g.start.y;
    if(!g.hit){yaw+=(p.x-g.previous.x)*3.8/420;pitch=clampPitch(pitch+(p.y-g.previous.y)*3.8/420);}
    else {
      if(!g.move&&Math.hypot(dx,dy)*p.scale>=THRESHOLD)g.move=chooseDrag(g.hit,dx,dy,yaw,pitch);
      if(g.move){g.travel=(dx*g.move.direction[0]+dy*g.move.direction[1]);g.preview=Math.max(0,Math.min(Math.PI/2,g.travel/g.move.speed))*Math.sign(g.move.angle);}
    }
    g.previous=p;draw();notify();
  }
  listen(canvas,'pointermove',movePointer);
  listen(canvas,'pointerup',e=>{
    if(e.pointerId!==gesture?.id)return;
    movePointer(e);
    const g=gesture;
    if(g.move&&g.travel*g.start.scale>=THRESHOLD){current={...g.move,from:g.preview,elapsed:0,duration:Math.max(65,DURATION*(1-Math.abs(g.preview)/(Math.PI/2)))};}
    release();
  });
  for(const type of ['pointercancel','lostpointercapture'])listen(canvas,type,e=>{if(e.pointerId===gesture?.id)release();});
  listen(canvas,'contextmenu',e=>e.preventDefault());listen(canvas,'blur',()=>{delete canvas.dataset.pointerFocus;release();});
  listen(root,'keydown',e=>{
    delete canvas.dataset.pointerFocus;
    if(e.altKey||e.ctrlKey||e.metaKey||gesture)return;const face=e.key.toUpperCase();
    if(FACES[face]){e.preventDefault();if(!e.repeat)enqueue(face,e.shiftKey);}
    if(e.target===canvas){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))e.preventDefault();
      if(e.key==='ArrowLeft')yaw-=.15;if(e.key==='ArrowRight')yaw+=.15;if(e.key==='ArrowUp')pitch=clampPitch(pitch-.15);if(e.key==='ArrowDown')pitch=clampPitch(pitch+.15);if(e.key==='Home')home();draw();}
  });
  function suspend(){paused=true;release();last=null;notify();}
  function resume(){if(!document.hidden){paused=false;last=null;notify();}}
  listen(window,'blur',suspend);listen(window,'focus',resume);listen(window,'pagehide',suspend);listen(window,'pageshow',resume);
  listen(document,'visibilitychange',()=>document.hidden?suspend():resume());listen(window,'resize',()=>{release();last=null;draw();});
  function draw(){
    ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,420,340);
    const spec=current??gesture?.move;
    const progress=current?Math.min(1,current.elapsed/current.duration):0,eased=progress*progress*(3-2*progress);
    const angle=current?current.from+(current.angle-current.from)*eased:gesture?.preview??0;
    const polygons=[];
    for(const sticker of stickers){
      const axis=sticker.n.findIndex(v=>v!==0),a=(axis+1)%3,b=(axis+2)%3;
      const moving=spec&&sticker.p[spec.axis]===spec.layer;
      const transform=v=>moving?rotate(v,spec.axis,angle):v;
      const normal=transform(sticker.n);if(view(normal,yaw,pitch)[2]<=.001)continue;
      const center=sticker.p.map((v,i)=>v+sticker.n[i]*.505);
      const points=[[-.47,-.47],[.47,-.47],[.47,.47],[-.47,.47]].map(([x,y])=>{const p=[...center];p[a]+=x;p[b]+=y;return project(transform(p),yaw,pitch);});
      const label=sticker.p.every((v,i)=>i===axis||v===0)?Object.keys(FACES).find(f=>FACES[f].axis===axis&&FACES[f].sign===sticker.n[axis]):null;
      polygons.push({points,color:FACES[sticker.color].color,label,center:project(transform(center),yaw,pitch),depth:points.reduce((n,p)=>n+p[2],0)/4});
    }
    polygons.sort((a,b)=>a.depth-b.depth);
    for(const p of polygons){ctx.beginPath();p.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=p.color;ctx.fill();ctx.lineWidth=3;ctx.lineJoin='round';ctx.strokeStyle='#17251e';ctx.stroke();if(p.label){ctx.font='600 16px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=['#f5f5f0','#ffd434','#f28a25'].includes(p.color)?'#17251e':'white';ctx.fillText(p.label,p.center[0],p.center[1]);}}
  }
  function startNext(){return queue.length?{...queue.shift(),from:0,elapsed:0,duration:DURATION}:null;}
  function render(now){
    if(destroyed)return;
    if(!paused&&!document.hidden){
      let dt=last===null?0:Math.min(64,Math.max(0,now-last));
      if(!current&&!gesture)current=startNext();
      while(current){const used=Math.min(dt,current.duration-current.elapsed);current.elapsed+=used;dt-=used;
        if(current.elapsed<current.duration)break;
        stickers=turnLayer(stickers,current);current=startNext();describe();if(dt<=0)break;
      }
    }
    last=now;draw();notify();frame=requestAnimationFrame(render);
  }
  frame=requestAnimationFrame(render);
  return {getState,stop:release,reset(challenge){release();stickers=challenge.stickers.map(s=>({...s,p:[...s.p],n:[...s.n]}));queue=[];current=null;last=null;home();describe();notify();},destroy(){destroyed=true;cancelAnimationFrame(frame);release();queue=[];current=null;events.abort();}};
}
