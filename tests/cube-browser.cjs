const {chromium}=require('playwright');const assert=require('node:assert/strict');
const {resetToGame}=require('./browser-selection.cjs');
const size=Number(process.env.CUBE_SIZE||3),rng=(size===2?5.5:4.5)/7;
const url=process.env.GATE_URL||'http://127.0.0.1:8765/gate/';
(async()=>{
  const {FACES,solvedCube,scramble,rotate,turnLayer,moveSpec,stickerCenter}=await import('../gate/common/cube-engine.js');
  const {project}=await import('../gate/common/cube-gestures.js');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const errors=[];
  async function open(mobile=false){const p=await (await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3}:{viewport:{width:1200,height:900}})).newPage();p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(r=>{Math.random=()=>window.__gateTestDraws?.length?window.__gateTestDraws.shift():r;window.drawnLetters=[];const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,...args){window.drawnLetters.push(t);return fill.call(this,t,...args);};},rng);await p.goto(url);await p.waitForSelector('#cube');return p;}
  const state=p=>p.locator('#cube-accessible').innerText();const idle=p=>p.waitForFunction(()=>document.querySelector('#game').dataset.phase==='idle');
  const describe=stickers=>Object.values(FACES).map(({axis,sign,name})=>`${name}: ${stickers.filter(s=>s.n[axis]===sign).sort((a,b)=>b.p[(axis+2)%3]-a.p[(axis+2)%3]||a.p[(axis+1)%3]-b.p[(axis+1)%3]).map(s=>({U:'white',R:'red',F:'green',D:'yellow',L:'orange',B:'blue'})[s.color]).join(', ')}`).join('. ');
  async function drag(p,start,delta,finish=true){const r=await p.locator('#cube').boundingBox();await p.mouse.move(r.x+start[0]*r.width/420,r.y+start[1]*r.height/340);await p.mouse.down();await p.mouse.move(r.x+(start[0]+delta[0])*r.width/420,r.y+(start[1]+delta[1])*r.height/340,{steps:5});if(finish){await p.mouse.up();await idle(p);}}
  function push(point,axis,sign,yaw,pitch,length=38){const faceCenter=point.map(v=>Math.abs(v)===1.505?v:0),rotated=rotate(faceCenter,axis,sign*.0001);const a=project(point,yaw,pitch),b=project(point.map((v,i)=>v+rotated[i]-faceCenter[i]),yaw,pitch),dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy);return {start:a,delta:[dx/n*length,dy/n*length]};}
  const p=await open();let expected=scramble(()=>rng,size===2?15:25,size).stickers;const initial=describe(expected);assert.equal(await state(p),initial);assert.equal(await p.locator('#game button').count(),0);assert.equal(await p.locator('button:visible').count(),2);assert.ok(await p.locator('#target').isHidden());assert.deepEqual(await p.evaluate(()=>window.drawnLetters),[]);await p.screenshot({path:`/tmp/cube-${size}-drag-desktop.png`});
  // All visible faces, corners, edges and center slices, two directions and their reverses,
  // at front/right/left/back and bottom/up views. Each move is a real mouse drag.
  let cases=0;
  for(const [horizontal,vertical] of (process.env.CUBE_FOCUSED?[]:[[0,0],[8,2],[20,0],[-10,-6],[6,-10],[-3,6]])){
    await p.locator('#cube').focus();await p.keyboard.press('Home');for(let i=0;i<Math.abs(horizontal);i++)await p.keyboard.press(horizontal>0?'ArrowRight':'ArrowLeft');for(let i=0;i<Math.abs(vertical);i++)await p.keyboard.press(vertical>0?'ArrowDown':'ArrowUp');
    const yaw=-.58+horizontal*.15,pitch=Math.max(-1.45,Math.min(1.45,.42+vertical*.15));
    for(const {axis:normalAxis,sign} of Object.values(FACES)){
      const normal=[0,0,0];normal[normalAxis]=sign;if(project(normal,yaw,pitch)[2]<.08)continue;
      for(const [a,b] of (size===2?[[.75,.75],[-.75,.75],[-.75,-.75]]:[[0,0],[1,0],[-1,1]])){
        const point=[0,0,0];point[normalAxis]=sign*1.505;point[(normalAxis+1)%3]=a;point[(normalAxis+2)%3]=b;
        for(const axis of [0,1,2].filter(n=>n!==normalAxis))for(const direction of [1,-1]){
          const plan=push(point,axis,direction,yaw,pitch);await drag(p,plan.start,plan.delta);expected=turnLayer(expected,{axis,layer:size===2?Math.sign(point[axis]):Math.round(point[axis]),angle:direction*Math.PI/2});assert.equal(await state(p),describe(expected),JSON.stringify({horizontal,vertical,normalAxis,sign,a,b,axis,direction}));cases++;
        }
      }
    }
  }
  assert.equal(await state(p),initial);console.log('PASS',cases,'actual face/slice drags across six viewpoints');
  // Explicit horizontal, vertical and diagonal screen swipes, also at seams/near corners.
  for(const h of [0,18,-12]){
    await p.keyboard.press('Home');for(let i=0;i<Math.abs(h);i++)await p.keyboard.press(h>0?'ArrowRight':'ArrowLeft');
    const y=-.58+h*.15,t=.42,face=Object.values(FACES).sort((a,b)=>{const na=[0,0,0],nb=[0,0,0];na[a.axis]=a.sign;nb[b.axis]=b.sign;return project(nb,y,t)[2]-project(na,y,t)[2];})[0];
    for(const pair of (size===2?[[.75,.75],[0,.75],[1.45,-1.45]]:[[0,0],[.5,0],[1.45,-1.45]]))for(const delta of [[38,0],[0,38],[30,30],[30,-30]]){
      const point=[0,0,0];point[face.axis]=face.sign*1.505;point[(face.axis+1)%3]=pair[0];point[(face.axis+2)%3]=pair[1];const start=project(point,y,t);
      // Derive expected move independently from finite 3D rotations.
      const options=[0,1,2].filter(a=>a!==face.axis).map(axis=>{const center=point.map((v,i)=>i===face.axis?v:0),rotated=rotate(center,axis,.000001);const end=project(point.map((v,i)=>v+rotated[i]-center[i]),y,t),v=[end[0]-start[0],end[1]-start[1]],dot=v[0]*delta[0]+v[1]*delta[1];return {axis,layer:size===2?(point[axis]>=0?1:-1):Math.max(-1,Math.min(1,Math.floor(point[axis]+.5))),angle:Math.sign(dot)*Math.PI/2,score:Math.abs(dot)/Math.hypot(...v)};}).sort((a,b)=>b.score-a.score||a.axis-b.axis);
      await drag(p,start,delta);expected=turnLayer(expected,options[0]);assert.equal(await state(p),describe(expected),JSON.stringify({h,pair,delta,move:options[0]}));await drag(p,start,delta.map(v=>-v));expected=turnLayer(expected,{...options[0],angle:-options[0].angle});assert.equal(await state(p),describe(expected));
    }
  }
  assert.equal(await state(p),initial);console.log('PASS 72 horizontal/vertical/diagonal and seam/corner swipes');
  await p.keyboard.press('Home');const yaw=-.58,pitch=.42;
  // Outside orbit changes the image but not stickers; a click or tiny drag does nothing.
  const beforeImage=await p.locator('#cube').screenshot();await drag(p,[12,12],[70,30]);assert.equal(await state(p),initial);assert.notDeepEqual(await p.locator('#cube').screenshot(),beforeImage);await p.keyboard.press('Home');
  const center=project([size===2?.75:0,size===2?.75:0,1.505],yaw,pitch);await drag(p,center,[0,0]);await drag(p,center,[3,2]);assert.equal(await state(p),initial);
  // Reverse drag to origin cancels. Every interruption rolls back the uncommitted preview.
  const plan=push([size===2?.75:1,size===2?.75:0,1.505],0,1,yaw,pitch);
  for(const type of ['pointercancel','lostpointercapture','blur','resize']){
    await drag(p,plan.start,plan.delta,false);assert.ok(await p.locator('#enter').isDisabled());await p.screenshot({path:`/tmp/cube-${size}-drag-preview.png`});
    await p.evaluate(type=>{if(type==='blur'||type==='resize')window.dispatchEvent(new Event(type));else document.querySelector('#cube').dispatchEvent(new PointerEvent(type,{pointerId:1}));},type);await p.mouse.up();if(type==='blur')await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await idle(p);assert.equal(await state(p),initial);
  }
  await drag(p,plan.start,plan.delta,false);const r=await p.locator('#cube').boundingBox();await p.mouse.move(r.x+plan.start[0]*r.width/420,r.y+plan.start[1]*r.height/340);await p.mouse.up();await idle(p);assert.equal(await state(p),initial);
  // A second swipe begun during the short commit animation is ignored, not mis-picked.
  await drag(p,plan.start,plan.delta.map(v=>v*.45),false);await p.mouse.up();
  await p.mouse.move(r.x+plan.start[0]*r.width/420,r.y+plan.start[1]*r.height/340);await p.mouse.down();await p.mouse.move(r.x+(plan.start[0]+plan.delta[0])*r.width/420,r.y+(plan.start[1]+plan.delta[1])*r.height/340);await p.mouse.up();await idle(p);
  assert.equal(await state(p),describe(turnLayer(scramble(()=>rng,size===2?15:25,size).stickers,{axis:0,layer:1,angle:Math.PI/2})));
  await drag(p,plan.start,plan.delta.map(v=>-v));assert.equal(await state(p),initial);
  // Four repetitions return to exactly the same puzzle. Large drags still make just one turn.
  for(let i=0;i<4;i++)await drag(p,plan.start,plan.delta.map(v=>v*2));assert.equal(await state(p),initial);
  // Complete solve entirely with pointer gestures: choose a visible adjacent surface for
  // each inverse scramble move. No keyboard turn, model mutation or hidden solver hook.
  for(const m of scramble(()=>rng,size===2?15:25,size).moves.reverse()){
    const spec=moveSpec(m.face,!m.inverse);let selected;
    for(const sticker of solvedCube(size)){
      const normalAxis=sticker.n.findIndex(v=>v!==0);if(normalAxis===spec.axis||sticker.p[spec.axis]!==spec.sign||project(sticker.n,yaw,pitch)[2]<.08)continue;
      const point=stickerCenter(sticker,size);selected=push(point,spec.axis,Math.sign(spec.angle),yaw,pitch);break;
    }
    assert.ok(selected);await drag(p,selected.start,selected.delta);
  }
  assert.ok(await p.locator('#enter').isEnabled());assert.ok(p.url().endsWith('/gate/'));await p.screenshot({path:`/tmp/cube-${size}-drag-solved.png`});
  await drag(p,plan.start,plan.delta,false);assert.ok(await p.locator('#enter').isDisabled());await p.evaluate(()=>window.dispatchEvent(new Event('resize')));await p.mouse.up();assert.ok(await p.locator('#enter').isEnabled());
  // Keyboard access and queued turns remain; Enter never unlocks between queued moves.
  await p.locator('#cube').focus();for(let i=0;i<4;i++)await p.keyboard.press('r');assert.ok(await p.locator('#enter').isDisabled());await idle(p);assert.ok(await p.locator('#enter').isEnabled());await p.keyboard.press('f');await p.keyboard.press('Shift+F');await idle(p);assert.ok(await p.locator('#enter').isEnabled());assert.deepEqual(await p.evaluate(()=>window.drawnLetters),[]);await p.locator('#enter').click();await p.waitForURL('**/personal/');await p.waitForFunction(()=>!document.documentElement.hasAttribute('data-private-pending'));assert.ok(await p.locator('main').isVisible());
  const passBefore=await p.evaluate(async()=>{const {PASS_KEY}=await import('/gate/common/session-pass.js');return sessionStorage.getItem(PASS_KEY);});assert.ok(passBefore);assert.equal(JSON.parse(passBefore).expiresAt-JSON.parse(passBefore).issuedAt,3600000);
  await p.reload();await p.waitForFunction(()=>!document.documentElement.hasAttribute('data-private-pending'));assert.equal(await p.evaluate(async()=>{const {PASS_KEY}=await import('/gate/common/session-pass.js');return sessionStorage.getItem(PASS_KEY);}),passBefore);
  await p.evaluate(async()=>{const {PASS_KEY,PASS_TTL}=await import('/gate/common/session-pass.js');sessionStorage.setItem(PASS_KEY,JSON.stringify({version:1,issuedAt:Date.now()-PASS_TTL-1000,expiresAt:Date.now()-1000}));});await p.reload();await p.waitForURL('**/gate/');
  const mobile=await open(true),cdp=await mobile.context().newCDPSession(mobile);const mr=await mobile.locator('#cube').boundingBox();
  const touch=async(type,xy)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:xy?[{x:mr.x+xy[0]*mr.width/420,y:mr.y+xy[1]*mr.height/340,id:1}]:[]});
  for(const direction of [1,-1]){const t=push([size===2?.75:0,size===2?.75:0,1.505],1,direction,yaw,pitch);await touch('touchStart',t.start);await touch('touchMove',[t.start[0]+t.delta[0],t.start[1]+t.delta[1]]);await touch('touchEnd');await idle(mobile);}
  for(const [h,v] of [[0,0],[8,2],[20,0],[-10,-6],[6,-10],[-3,6]]){
    await mobile.locator('#cube').focus();await mobile.keyboard.press('Home');for(let i=0;i<Math.abs(h);i++)await mobile.keyboard.press(h>0?'ArrowRight':'ArrowLeft');for(let i=0;i<Math.abs(v);i++)await mobile.keyboard.press(v>0?'ArrowDown':'ArrowUp');
    const y=-.58+h*.15,t=Math.max(-1.45,Math.min(1.45,.42+v*.15));const sticker=solvedCube(size).find(s=>project(s.n,y,t)[2]>.2),normalAxis=sticker.n.findIndex(n=>n!==0),axis=(normalAxis+1)%3;
    for(const sign of [1,-1]){const gesture=push(stickerCenter(sticker,size),axis,sign,y,t);await touch('touchStart',gesture.start);await touch('touchMove',[gesture.start[0]+gesture.delta[0],gesture.start[1]+gesture.delta[1]]);await touch('touchEnd');await idle(mobile);}assert.equal(await state(mobile),initial);
  }
  await mobile.keyboard.press('Home');
  assert.equal(await state(mobile),initial);await touch('touchStart',plan.start);await touch('touchMove',[plan.start[0]+plan.delta[0],plan.start[1]+plan.delta[1]]);await touch('touchCancel');assert.equal(await state(mobile),initial);
  await touch('touchStart',[10,10]);await touch('touchMove',[65,45]);await touch('touchEnd');assert.equal(await state(mobile),initial);await mobile.screenshot({path:`/tmp/cube-${size}-drag-mobile.png`});
  await mobile.locator('#cube').focus();await mobile.keyboard.press('Home');
  for(let i=0;i<4;i++){await touch('touchStart',plan.start);await touch('touchMove',[plan.start[0]+plan.delta[0],plan.start[1]+plan.delta[1]]);await touch('touchEnd');await idle(mobile);}assert.equal(await state(mobile),initial);
  for(const m of scramble(()=>rng,size===2?15:25,size).moves.reverse()){
    const spec=moveSpec(m.face,!m.inverse);let selected;
    for(const sticker of solvedCube(size)){
      const normalAxis=sticker.n.findIndex(v=>v!==0);if(normalAxis===spec.axis||sticker.p[spec.axis]!==spec.sign||project(sticker.n,yaw,pitch)[2]<.08)continue;
      selected=push(stickerCenter(sticker,size),spec.axis,Math.sign(spec.angle),yaw,pitch);break;
    }
    await touch('touchStart',selected.start);await touch('touchMove',[selected.start[0]+selected.delta[0],selected.start[1]+selected.delta[1]]);await touch('touchEnd');await idle(mobile);
  }
  assert.ok(await mobile.locator('#enter').isEnabled());assert.ok(mobile.url().endsWith('/gate/'));await mobile.screenshot({path:`/tmp/cube-${size}-touch-solved.png`});
  await resetToGame(mobile,size===2?'cube2':'cube',rng);await idle(mobile);
  // Global reset mid-preview and mid-keyboard queue switches away and back to a fresh scramble, with no old work.
  await mobile.locator('#cube').focus();await mobile.keyboard.press('Home');await drag(mobile,plan.start,plan.delta,false);await resetToGame(mobile,size===2?'cube2':'cube',rng);await mobile.mouse.up();await idle(mobile);assert.equal(await state(mobile),initial);
  await mobile.locator('#cube').focus();for(let i=0;i<8;i++)await mobile.keyboard.press('r');await resetToGame(mobile,size===2?'cube2':'cube',rng);await mobile.waitForTimeout(700);assert.equal(await state(mobile),initial);
  for(const [random,id] of [[.5/7,'dial'],[1.5/7,'cannon'],[2.5/7,'slots'],[3.5/7,'soda']]){await resetToGame(mobile,id,random);assert.equal(await mobile.locator('#game').getAttribute('data-game'),id);assert.ok(await mobile.locator('#target').isVisible());}
  assert.deepEqual(errors,[]);console.log('PASS gesture-only full solve, inverse/four turns, threshold/preview/cancel, outside orbit, touch, keyboard queue, global reset and target restoration; zero browser errors');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
