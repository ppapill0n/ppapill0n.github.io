import { FACES, rotate, moveSpec, turn, isSolved } from './cube-engine.js';
const DURATION=180;
const clampPitch=value=>Math.max(-1.45,Math.min(1.45,value));
export function createCubeGame(root,changed) {
  root.innerHTML=`<div class="cube-view"><canvas id="cube" width="840" height="680" tabindex="0" aria-label="Rubik-style cube. Drag to rotate the view. U R F D L B turn the named face; Shift reverses. Arrow keys rotate the view; Home restores it." aria-describedby="cube-accessible"></canvas><button id="cube-home" type="button" aria-label="Restore front, right and up view" title="Restore view"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10 9-5M12 13 3 8m9 5v9"/></svg></button></div><div class="cube-controls">${Object.entries(FACES).map(([face,f])=>`<div class="cube-face-controls" style="--face-color:${f.color}">${[false,true].map(inverse=>`<button type="button" data-face="${face}" data-inverse="${inverse}" aria-label="${f.name} (${face}), ${inverse?'counterclockwise':'clockwise'} looking at that face" title="${face}${inverse?'′':''}"><i aria-hidden="true"></i>${face} <span aria-hidden="true">${inverse?'↺':'↻'}</span></button>`).join('')}</div>`).join('')}</div><p id="cube-accessible" class="sr-only"></p>`;
  const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d'),events=new AbortController();
  let stickers=[],queue=[],current=null,yaw=-.58,pitch=.42,pointer=null,lastPoint=null,last=null,frame=null,destroyed=false,paused=false;
  const listen=(el,type,fn)=>el.addEventListener(type,fn,{signal:events.signal});
  function getState(){return {value:isSolved(stickers)?1:0,stopped:!paused&&!document.hidden&&!current&&!queue.length};}
  function notify(){root.dataset.phase=current||queue.length?'turning':'idle';changed(getState());}
  function describe(){root.querySelector('#cube-accessible').textContent=Object.entries(FACES).map(([face,{axis,sign,name}])=>`${name}: ${stickers.filter(s=>s.n[axis]===sign).sort((a,b)=>b.p[(axis+2)%3]-a.p[(axis+2)%3]||a.p[(axis+1)%3]-b.p[(axis+1)%3]).map(s=>({U:'white',R:'red',F:'green',D:'yellow',L:'orange',B:'blue'})[s.color]).join(', ')}`).join('. ');}
  function release(){const id=pointer;pointer=null;lastPoint=null;if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);canvas.style.cursor='grab';}
  function home(){yaw=-.58;pitch=.42;draw();}
  function enqueue(face,inverse){if(paused||document.hidden)return;queue.push({face,inverse});notify();}
  for(const button of root.querySelectorAll('[data-face]'))listen(button,'click',()=>enqueue(button.dataset.face,button.dataset.inverse==='true'));
  listen(root.querySelector('#cube-home'),'click',home);
  listen(canvas,'pointerdown',e=>{if(e.button!==0||pointer!==null)return;e.preventDefault();canvas.focus({preventScroll:true});pointer=e.pointerId;lastPoint=[e.clientX,e.clientY];canvas.setPointerCapture(pointer);canvas.style.cursor='grabbing';});
  listen(canvas,'pointermove',e=>{if(e.pointerId!==pointer)return;const scale=3.8/canvas.getBoundingClientRect().width;yaw+=(e.clientX-lastPoint[0])*scale;pitch=clampPitch(pitch+(e.clientY-lastPoint[1])*scale);lastPoint=[e.clientX,e.clientY];draw();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(canvas,type,e=>{if(e.pointerId===pointer)release();});
  listen(canvas,'contextmenu',e=>e.preventDefault());listen(canvas,'blur',release);
  listen(root,'keydown',e=>{
    if(e.altKey||e.ctrlKey||e.metaKey)return;const face=e.key.toUpperCase();
    if(FACES[face]){e.preventDefault();if(!e.repeat)enqueue(face,e.shiftKey);}
    if(e.target===canvas){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key))e.preventDefault();
      if(e.key==='ArrowLeft')yaw-=.15;if(e.key==='ArrowRight')yaw+=.15;if(e.key==='ArrowUp')pitch=clampPitch(pitch-.15);if(e.key==='ArrowDown')pitch=clampPitch(pitch+.15);if(e.key==='Home')home();draw();}
  });
  function suspend(){paused=true;release();last=null;notify();}
  function resume(){if(!document.hidden){paused=false;last=null;notify();}}
  listen(window,'blur',suspend);listen(window,'focus',resume);listen(window,'pagehide',suspend);listen(window,'pageshow',resume);
  listen(document,'visibilitychange',()=>document.hidden?suspend():resume());listen(window,'resize',()=>{release();last=null;draw();});
  function view(v){return rotate(rotate(v,1,yaw),0,pitch);}
  function project(v){const p=view(v);return [210+p[0]*60,170-p[1]*60,p[2]];}
  function draw(){
    ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,420,340);
    const spec=current?moveSpec(current.face,current.inverse):null;
    const progress=current?Math.min(1,current.elapsed/DURATION):0, eased=progress*progress*(3-2*progress);
    const polygons=[];
    for(const sticker of stickers){
      const axis=sticker.n.findIndex(v=>v!==0),a=(axis+1)%3,b=(axis+2)%3;
      const moving=spec&&sticker.p[spec.axis]===spec.sign;
      const transform=v=>moving?rotate(v,spec.axis,spec.angle*eased):v;
      const normal=transform(sticker.n);if(view(normal)[2]<=.001)continue;
      const center=sticker.p.map((v,i)=>v+sticker.n[i]*.505);
      const points=[[-.47,-.47],[.47,-.47],[.47,.47],[-.47,.47]].map(([x,y])=>{const p=[...center];p[a]+=x;p[b]+=y;return project(transform(p));});
      const label=sticker.p.every((v,i)=>i===axis||v===0)?Object.keys(FACES).find(f=>FACES[f].axis===axis&&FACES[f].sign===sticker.n[axis]):null;
      polygons.push({points,color:FACES[sticker.color].color,label,center:project(transform(center)),depth:points.reduce((n,p)=>n+p[2],0)/4});
    }
    polygons.sort((a,b)=>a.depth-b.depth);
    for(const p of polygons){ctx.beginPath();p.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=p.color;ctx.fill();ctx.lineWidth=3;ctx.lineJoin='round';ctx.strokeStyle='#17251e';ctx.stroke();if(p.label){ctx.font='600 16px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=['#f5f5f0','#ffd434','#f28a25'].includes(p.color)?'#17251e':'white';ctx.fillText(p.label,p.center[0],p.center[1]);}}
  }
  function render(now){
    if(destroyed)return;
    if(!paused&&!document.hidden){
      let dt=last===null?0:Math.min(64,Math.max(0,now-last));
      if(!current&&queue.length)current={...queue.shift(),elapsed:0};
      while(current){const used=Math.min(dt,DURATION-current.elapsed);current.elapsed+=used;dt-=used;
        if(current.elapsed<DURATION)break;
        stickers=turn(stickers,current.face,current.inverse);current=queue.length?{...queue.shift(),elapsed:0}:null;describe();
        if(dt<=0)break;
      }
    }
    last=now;draw();notify();frame=requestAnimationFrame(render);
  }
  frame=requestAnimationFrame(render);
  return {getState,stop:release,reset(challenge){release();stickers=challenge.stickers.map(s=>({...s,p:[...s.p],n:[...s.n]}));queue=[];current=null;last=null;home();describe();notify();},destroy(){destroyed=true;cancelAnimationFrame(frame);release();queue=[];current=null;events.abort();}};
}
