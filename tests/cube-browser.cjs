const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const url=process.env.GATE_URL||'http://127.0.0.1:8765/gate/';
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const errors=[];
  async function open(mobile=false){const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3}:{viewport:{width:1200,height:900}});const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>Math.random=()=>.9);await p.goto(url);await p.waitForSelector('#cube');return p;}
  const idle=p=>p.waitForFunction(()=>document.querySelector('#game').dataset.phase==='idle');
  const state=p=>p.locator('#cube-accessible').innerText();
  const button=(p,face,inverse=false)=>p.locator(`[data-face="${face}"][data-inverse="${inverse}"]`);
  const p=await open();assert.ok(await p.locator('#target').isHidden());assert.ok(await p.locator('.label').isHidden());assert.ok(await p.locator('#enter').isDisabled());
  const initial=await state(p);await p.screenshot({path:'/tmp/cube-desktop.png'});
  await button(p,'R').click();assert.ok(await p.locator('#enter').isDisabled());await p.waitForTimeout(50);await p.screenshot({path:'/tmp/cube-turn.png'});
  await button(p,'R',true).click();await idle(p);assert.equal(await state(p),initial);
  await p.evaluate(()=>{for(let i=0;i<4;i++)document.querySelector('[data-face="F"][data-inverse="false"]').click();});
  assert.ok(await p.locator('#enter').isDisabled());await idle(p);assert.equal(await state(p),initial);
  // Camera drag and keyboard orientation never mutate the logical puzzle.
  const r=await p.locator('#cube').boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width*.8,r.y+r.height*.7,{steps:20});await p.mouse.up();assert.equal(await state(p),initial);await p.screenshot({path:'/tmp/cube-orbit.png'});
  await p.locator('#cube').focus();await p.keyboard.press('ArrowLeft');await p.keyboard.press('ArrowUp');assert.equal(await state(p),initial);await p.keyboard.press('Home');
  await p.keyboard.press('r');await p.keyboard.press('Shift+R');await idle(p);assert.equal(await state(p),initial);
  await button(p,'U').focus();await p.keyboard.press('Enter');await button(p,'U',true).focus();await p.keyboard.press('Enter');await idle(p);assert.equal(await state(p),initial);
  // Every inverse scramble move goes through the real control queue; no game-state test hook.
  await p.evaluate(async()=>{const {scramble}=await import('./cube-engine.js');for(const m of scramble(()=>.9).moves.reverse())document.querySelector(`[data-face="${m.face}"][data-inverse="${!m.inverse}"]`).click();});
  await p.waitForTimeout(80);assert.ok(await p.locator('#enter').isDisabled());
  await p.evaluate(()=>window.dispatchEvent(new Event('blur')));const paused=await state(p);await p.waitForTimeout(400);assert.equal(await state(p),paused);assert.ok(await p.locator('#enter').isDisabled());
  await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await p.waitForTimeout(350);assert.equal(await state(p),paused);
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await p.setViewportSize({width:1100,height:820});await idle(p);assert.ok(await p.locator('#enter').isEnabled());assert.ok(p.url().endsWith('/gate/'));await p.screenshot({path:'/tmp/cube-solved.png'});
  // A solved state stays locked during a four-turn queue, including intermediate solved boundaries.
  await p.evaluate(()=>{for(let i=0;i<4;i++)document.querySelector('[data-face="B"][data-inverse="true"]').click();});assert.ok(await p.locator('#enter').isDisabled());await idle(p);assert.ok(await p.locator('#enter').isEnabled());
  await p.locator('#enter').click();await p.waitForURL('**/personal/');
  const mobile=await open(true),cdp=await mobile.context().newCDPSession(mobile);await mobile.screenshot({path:'/tmp/cube-mobile.png'});const mr=await mobile.locator('#cube').boundingBox(),before=await state(mobile);
  const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:x===undefined?[]:[{x:mr.x+x,y:mr.y+y,id:1}]});
  await touch('touchStart',150,130);await touch('touchMove',240,195);await touch('touchCancel');assert.equal(await state(mobile),before);
  await button(mobile,'L').tap();await button(mobile,'L',true).tap();await idle(mobile);assert.equal(await state(mobile),before);
  await mobile.screenshot({path:'/tmp/cube-mobile-orbit.png'});
  await mobile.setViewportSize({width:320,height:568});assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mobile.screenshot({path:'/tmp/cube-small.png'});
  // Reset during a turn destroys all queued work. The target label comes back for other games.
  await button(mobile,'D').tap();await mobile.evaluate(()=>{for(let i=0;i<10;i++)document.querySelector('[data-face="R"][data-inverse="false"]').click();document.querySelector('#new-target').click();});
  await idle(mobile);assert.equal(await state(mobile),before);await mobile.waitForTimeout(700);assert.equal(await state(mobile),before);assert.ok(await mobile.locator('#enter').isDisabled());
  for(const [random,id] of [[0,'dial'],[.3,'cannon'],[.5,'slots'],[.7,'soda']]){await mobile.evaluate(r=>{Math.random=()=>r;document.querySelector('#new-target').click();},random);assert.equal(await mobile.locator('#game').getAttribute('data-game'),id);assert.ok(await mobile.locator('#target').isVisible());assert.ok(await mobile.locator('.label').isVisible());assert.equal(await mobile.locator('#cube').count(),0);}
  assert.deepEqual(errors,[]);console.log('PASS cube legal solve via controls, inverse/four/rapid queued turns, mouse/touch orbit, keyboard controls, interruption/visibility/resize/reset, explicit Enter, target restoration, mobile layout; zero browser errors');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
