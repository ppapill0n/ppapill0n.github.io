import { SodaPhysics, bottleGeometry, CUP } from './soda-physics.js';
export function createSodaGame(root, changed) {
  root.innerHTML=`<div class="soda-field"><canvas id="soda" width="840" height="880" tabindex="0" aria-label="Green soda bottle. Drag the bottle toward the cup to tilt and pour; drag left or release to right it. Arrow keys move the bottle while Space is held."></canvas></div><div class="soda-readout"><output id="volume" aria-label="Soda in cup">0.0<span>mL</span></output><button id="empty-cup" type="button" aria-label="Empty cup and refill bottle; keep target"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 7h11l-1 13H7L5 7ZM9 3h8l3 3m0-4v4h-4M9 11v5m3-5v5"/></svg></button></div>`;
  const canvas=root.querySelector('canvas'), ctx=canvas.getContext('2d'), output=root.querySelector('output');
  const model=new SodaPhysics(), events=new AbortController();
  let pointer=null, offset=null, frame=null, last=null, destroyed=false, paused=false, keyboard=false, displayed=null;
  const listen=(el,type,fn)=>el.addEventListener(type,fn,{signal:events.signal});
  function getState() { return {value:model.value,stopped:!paused && !document.hidden && model.stopped}; }
  function notify() { changed(getState()); }
  function release() {
    const id=pointer; pointer=null; keyboard=false; model.release();
    if(id!==null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    notify();
  }
  function reset() { release(); model.reset(); last=null; draw(); notify(); }
  function point(e) { const r=canvas.getBoundingClientRect(); return {x:(e.clientX-r.left)*420/r.width,y:(e.clientY-r.top)*440/r.height}; }
  listen(canvas,'pointerdown',e=>{
    if(e.button!==0 || pointer!==null || keyboard) return;
    const p=point(e), dx=p.x-model.x,dy=p.y-model.y,c=Math.cos(model.angle),s=Math.sin(model.angle);
    if(Math.abs(c*dx+s*dy)>42 || -s*dx+c*dy < -95 || -s*dx+c*dy >75) return;
    e.preventDefault(); canvas.focus({preventScroll:true}); paused=false;
    pointer=e.pointerId; offset={x:p.x-model.x,y:p.y-model.y}; canvas.setPointerCapture(pointer); model.grab(); notify();
  });
  listen(canvas,'pointermove',e=>{ if(e.pointerId!==pointer) return; const p=point(e); model.move(p.x-offset.x,p.y-offset.y); });
  for(const type of ['pointerup','pointercancel','lostpointercapture']) listen(canvas,type,e=>{if(e.pointerId===pointer) release();});
  listen(canvas,'contextmenu',e=>e.preventDefault());
  listen(canvas,'keydown',e=>{
    if(e.key===' ' && pointer===null) { e.preventDefault(); if(!e.repeat) {keyboard=true; model.grab(); notify();} }
    if(keyboard && e.key.startsWith('Arrow')) { e.preventDefault(); model.move(model.aimX+(e.key==='ArrowRight'?2:e.key==='ArrowLeft'?-2:0),model.aimY+(e.key==='ArrowDown'?2:e.key==='ArrowUp'?-2:0)); }
  });
  listen(window,'keyup',e=>{if(e.key===' ' && keyboard) release();});
  listen(canvas,'blur',release);
  function suspend() { paused=true; release(); last=null; }
  function resume() { if(!document.hidden) {paused=false; last=null; notify();} }
  listen(window,'blur',suspend); listen(window,'focus',resume); listen(window,'pagehide',suspend); listen(window,'pageshow',resume);
  listen(document,'visibilitychange',()=>document.hidden?suspend():resume());
  listen(window,'resize',()=>{ release(); last=null; });
  listen(root.querySelector('#empty-cup'),'click',reset);
  function polygon(points,x=0,y=0) { ctx.beginPath(); points.forEach(([px,py],i)=>i?ctx.lineTo(px+x,py+y):ctx.moveTo(px+x,py+y)); ctx.closePath(); }
  function draw() {
    ctx.setTransform(2,0,0,2,0,0); ctx.clearRect(0,0,420,440);
    ctx.lineWidth=1.5; ctx.strokeStyle='#bfd0c4'; ctx.beginPath(); ctx.moveTo(35,413);ctx.lineTo(390,413);ctx.stroke();
    const fillHeight=(CUP.bottom-CUP.top-8)*model.cup/CUP.capacity;
    if(fillHeight>0) {
      const y=CUP.bottom-fillHeight, wave=Math.min(fillHeight/2,Math.abs(model.cupWave))*Math.sign(model.cupWave);
      ctx.fillStyle='#83c94d';ctx.beginPath();ctx.moveTo(274,412);ctx.lineTo(274,y);ctx.bezierCurveTo(296,y-wave,340,y+wave,362,y);ctx.lineTo(362,412);ctx.fill();
    }
    ctx.strokeStyle='#517861';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(270,290);ctx.lineTo(270,412);ctx.lineTo(366,412);ctx.lineTo(366,290);ctx.stroke();
    ctx.strokeStyle='#bfd0c4';ctx.lineWidth=1; for(let i=1;i<=3;i++){const y=412-114*i*100/420;ctx.beginPath();ctx.moveTo(353,y);ctx.lineTo(362,y);ctx.stroke();}
    ctx.fillStyle='#579c34';
    for(const p of model.particles) { ctx.beginPath();ctx.ellipse(p.x,p.y,Math.max(.6,Math.min(2.8,Math.sqrt(p.volume)*5)),Math.max(1,Math.min(4,Math.sqrt(p.volume)*8)),0,0,Math.PI*2);ctx.fill(); }
    const shape=bottleGeometry(model.angle,model.bottle,model.slosh);
    polygon(shape.points,model.x,model.y);ctx.fillStyle='#e8f0e966';ctx.fill();ctx.save();ctx.clip();
    polygon(shape.liquid,model.x,model.y);ctx.fillStyle='#83c94d';ctx.fill();
    ctx.restore();polygon(shape.points,model.x,model.y);ctx.strokeStyle='#1d5c43';ctx.lineWidth=2;ctx.stroke();
    ctx.save();ctx.translate(model.x,model.y);ctx.rotate(model.angle);
    ctx.strokeStyle='#ffffffb0';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-20,-26);ctx.lineTo(-20,45);ctx.stroke();
    // Grip and tipping cue stay on the object, with no control panel.
    ctx.strokeStyle='#1d5c43';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(9,0);ctx.moveTo(-9,6);ctx.lineTo(9,6);ctx.moveTo(-9,12);ctx.lineTo(9,12);ctx.stroke();ctx.restore();
    if(!model.held && model.bottle===450) {ctx.strokeStyle='#9db6a5';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(160,150);ctx.quadraticCurveTo(190,143,209,162);ctx.lineTo(209,152);ctx.moveTo(209,162);ctx.lineTo(199,160);ctx.stroke();}
    if(displayed!==model.value) { displayed=model.value; output.innerHTML=`${(displayed/10).toFixed(1)}<span>mL</span>`; }
    root.dataset.phase=model.stopped?'idle':model.held?'pouring':'settling';
    canvas.style.cursor=model.held?'grabbing':'grab';
  }
  function render(now) {
    if(destroyed) return;
    if(!paused && !document.hidden && last!==null) {
      const elapsed=(now-last)/1000;
      // A stalled/background frame is an interruption, never a fast-forward or an instant win.
      if(elapsed>.25) release(); else model.advance(Math.max(0,elapsed));
    }
    last=now; draw(); notify(); frame=requestAnimationFrame(render);
  }
  frame=requestAnimationFrame(render);
  return {getState,reset,stop:release,destroy(){destroyed=true;cancelAnimationFrame(frame);release();events.abort();}};
}
