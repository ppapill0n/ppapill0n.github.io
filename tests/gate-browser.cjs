// Run with a static server at GATE_URL (default http://127.0.0.1:8765/gate/).
// Requires Playwright and a Chromium executable; never changes production state.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const url=process.env.GATE_URL || 'http://127.0.0.1:8765/gate/';
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const errors=[];
  async function open(mobile=false,code=2400) {
    const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3}:{viewport:{width:1200,height:900}});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(code=>{let n=0;Math.random=()=>n++%2===0?.9:(code+.5)/3001;},code);
    await page.goto(url);await page.waitForSelector('canvas');return page;
  }
  const volume=async p=>parseFloat(await p.locator('#volume').innerText());
  const waitIdle=async p=>p.waitForFunction(()=>document.querySelector('#game').dataset.phase==='idle');
  async function grab(page,x=245,y=150) {
    const r=await page.locator('canvas').boundingBox();
    await page.mouse.move(r.x+105*r.width/420,r.y+165*r.height/440);await page.mouse.down();
    await page.mouse.move(r.x+x*r.width/420,r.y+y*r.height/440,{steps:30});
  }
  const page=await open();await page.screenshot({path:'/tmp/soda-desktop.png'});
  await grab(page);await page.waitForTimeout(2200);const before=await volume(page);
  assert.ok(before>30);assert.ok(await page.locator('#enter').isDisabled());
  await page.screenshot({path:'/tmp/soda-pouring.png'});await page.mouse.up();
  await page.waitForTimeout(350);assert.ok(await volume(page)>before);await waitIdle(page);
  await page.screenshot({path:'/tmp/soda-settled.png'});
  const target=await page.locator('#target').innerText();await page.locator('#empty-cup').click();
  assert.equal(await volume(page),0);assert.equal(await page.locator('#target').innerText(),target);
  // Overshoot exceeds 300 rather than clamping to a winning maximum.
  await grab(page);await page.waitForTimeout(9300);await page.mouse.up();await waitIdle(page);
  assert.ok(await volume(page)>300);await page.locator('#empty-cup').click();
  // Cancel, lost capture, blur and resize all release, preserving outstanding parcels.
  for(const type of ['pointercancel','lostpointercapture','blur','resize']) {
    await grab(page);await page.waitForTimeout(900);
    await page.evaluate(type=>{
      if(type==='blur'||type==='resize')window.dispatchEvent(new Event(type));
      else document.querySelector('canvas').dispatchEvent(new PointerEvent(type,{pointerId:1}));
    },type);
    await page.mouse.up();
    if(type==='blur'){assert.ok(await page.locator('#enter').isDisabled());await page.evaluate(()=>window.dispatchEvent(new Event('focus')));}
    await waitIdle(page);await page.locator('#empty-cup').click();
  }
  // Global reset destroys the old RAF and capture even in mid-pour; same soda is allowed.
  await grab(page);await page.waitForTimeout(600);
  await page.evaluate(()=>document.querySelector('#new-target').click());await page.mouse.up();
  assert.equal(await volume(page),0);await page.waitForTimeout(800);assert.equal(await volume(page),0);
  await grab(page);await page.waitForTimeout(600);
  await page.evaluate(()=>{Math.random=()=>0;document.querySelector('#new-target').click();});await page.mouse.up();
  await page.waitForTimeout(800);assert.equal(await page.locator('#game').getAttribute('data-game'),'dial');assert.equal(await page.locator('canvas').count(),0);
  // Real CDP touch events, including touchCancel; scale and portrait/landscape resize.
  const mobile=await open(true);const cdp=await mobile.context().newCDPSession(mobile);
  await mobile.screenshot({path:'/tmp/soda-mobile.png'});
  let r=await mobile.locator('canvas').boundingBox();
  const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:x===undefined?[]:[{x:r.x+x*r.width/420,y:r.y+y*r.height/440,id:1}]});
  await touch('touchStart',105,165);
  for(let i=1;i<=30;i++){await touch('touchMove',105+140*i/30,165-15*i/30);await mobile.waitForTimeout(15);}
  await mobile.waitForTimeout(1800);assert.ok(await volume(mobile)>20);await mobile.screenshot({path:'/tmp/soda-mobile-pouring.png'});
  await touch('touchCancel');await waitIdle(mobile);assert.ok(await volume(mobile)>20);
  await mobile.locator('#empty-cup').tap();assert.equal(await volume(mobile),0);
  await mobile.setViewportSize({width:844,height:390});await mobile.screenshot({path:'/tmp/soda-landscape.png'});
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // Zero target can win without pouring but requires explicit Enter; blur cannot unlock it.
  const zero=await open(false,0);await zero.waitForTimeout(600);assert.equal(await zero.locator('#target').innerText(),'0000');
  assert.ok(await zero.locator('#enter').isEnabled());assert.ok(zero.url().endsWith('/gate/'));
  await zero.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.ok(await zero.locator('#enter').isDisabled());
  await zero.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await zero.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.ok(await zero.locator('#enter').isDisabled());
  await zero.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await zero.locator('#enter').click();await zero.waitForURL('**/personal/');
  const max=await open(false,3000);assert.equal(await max.locator('#target').innerText(),'3000');assert.ok(await max.locator('#enter').isDisabled());
  // Smoke-test unchanged mouse controls and explicit submission rules in all three older games.
  for(const [random,id] of [[0,'dial'],[.3,'cannon'],[.6,'slots']]) {
    await max.evaluate(r=>{Math.random=()=>r;document.querySelector('#new-target').click();},random);
    assert.equal(await max.locator('#game').getAttribute('data-game'),id);
    if(id==='dial'){await max.locator('.direction').last().click();await max.waitForTimeout(1200);assert.ok(await max.locator('#enter').isDisabled());}
    if(id==='cannon'){await max.locator('#fire').click();await max.waitForTimeout(2000);assert.notEqual(await max.locator('#distance').innerText(),'—');}
    if(id==='slots'){await max.locator('#lever').click();await max.waitForTimeout(2500);assert.equal(await max.locator('#target').innerText(),'777');assert.ok(await max.locator('#enter').isEnabled());}
  }
  assert.deepEqual(errors,[]);console.log('PASS desktop mouse, actual mobile touch, delayed arrival, overpour/retry, interruptions, global reset, 0000/3000, explicit Enter, all prior games; no browser errors');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
