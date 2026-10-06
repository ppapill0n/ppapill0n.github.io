// Run with a local server and PLAYWRIGHT_MODULE pointing to an installed playwright module.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox'] });
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
try {
  for (const mobile of [false,true]) {
    const context = await browser.newContext({ viewport:mobile ? {width:390,height:844} : {width:1280,height:900}, hasTouch:mobile, isMobile:mobile });
    const page = await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{window.draws=[];Math.random=()=>window.draws.length ? window.draws.shift() : .8;});
    await page.clock.install();
    await page.goto(`${base}/gate/`);
    await page.clock.pauseAt(new Date(Date.now()+1000));
    const isLocked=()=>page.locator('#enter').isDisabled();
    const phase=()=>page.locator('#game').getAttribute('data-phase');
    const draw=async symbols=>page.evaluate(values=>{window.draws=values.map(n=>(n+.5)/7);},symbols);
    const spin=async()=>mobile ? page.locator('#lever').tap() : page.locator('#lever').click();
    const finish=async()=>page.clock.fastForward(2260);
    assert.equal(await page.locator('#target').textContent(),'777');
    assert.equal(await isLocked(),true);
    // Every actual UI result, including all six animated non-seven wins.
    let wins=0;
    for(let a=0;a<7;a++)for(let b=0;b<7;b++)for(let c=0;c<7;c++){
      await draw([a,b,c]);await spin();assert.equal(await isLocked(),true);
      await finish();const win=a===b&&b===c;
      assert.equal(await isLocked(),!win);wins+=Number(win);
      assert.equal(await page.locator('#game').evaluate(el=>el.classList.contains('slots-bonus')),win&&a!==6);
    }
    assert.equal(wins,7);
    // Panda visual and natural near-black SVG fills; wait out bonus bounce.
    await draw([5,5,5]);await spin();await finish();await page.clock.runFor(850);
    assert.deepEqual(await page.locator('#slot-panda path').evaluateAll(els=>els.map(el=>el.getAttribute('fill'))),['#080808','#ffffff','#080808','#ffffff']);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`/tmp/slot-qa/panda-${mobile?'mobile':'desktop'}.png`});
    // Keyboard starts a new spin, clearing prior success; repeat cannot restart.
    await draw([0,0,0]);await page.locator('#lever').focus();await page.keyboard.press('Enter');
    assert.equal(await isLocked(),true);
    await page.locator('#enter').evaluate(el=>{el.disabled=false;el.click();});
    assert.equal(new URL(page.url()).pathname,'/gate/'); // Actual tryEnter guard rejects in-flight state.
    await page.clock.runFor(1270);
    assert.deepEqual(await page.locator('.slot-reel').evaluateAll(els=>els.map(el=>el.dataset.settled)),['false','false','false']);
    await page.clock.runFor(30);
    assert.deepEqual(await page.locator('.slot-reel').evaluateAll(els=>els.map(el=>el.dataset.settled)),['true','false','false']);
    await page.clock.runFor(480);
    assert.deepEqual(await page.locator('.slot-reel').evaluateAll(els=>els.map(el=>el.dataset.settled)),['true','true','false']);
    await page.clock.runFor(480);assert.equal(await phase(),'idle');assert.equal(await isLocked(),false);
    assert.equal(await page.locator('.is-result').count(),3);
    assert.equal(await page.locator('.is-result svg').first().evaluate(el=>getComputedStyle(el).animationName),'slot-bounce');
    assert.equal(await page.locator('.slot-sparkles i').first().evaluate(el=>getComputedStyle(el).animationName),'slot-sparkle');
    await draw([6,6,6]);await page.locator('#lever').press('Space');
    assert.equal(await isLocked(),true);assert.equal(await page.locator('.is-result').count(),0);
    await page.locator('#lever').dispatchEvent('keydown',{key:'Enter',repeat:true});
    await page.locator('#new-target').click();await page.clock.runFor(3000);
    assert.equal(await isLocked(),true);assert.equal(await phase(),'idle');
    // Reset during celebration cancels its timer and removes effects.
    await draw([1,1,1]);await spin();await finish();await page.locator('#new-target').click();
    assert.equal(await page.locator('.is-result').count(),0);assert.equal(await isLocked(),true);
    // Background interruption cannot settle into a win later.
    await draw([6,6,6]);await spin();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await finish();assert.equal(await isLocked(),true);
    // Global random selection still reaches the two other games.
    for(const [random,id] of [[0,'dial'],[.5,'cannon'],[.9,'slots']]){
      await page.evaluate(value=>{window.draws=[value];},random);await page.locator('#new-target').click();
      assert.equal(await page.locator('#game').getAttribute('data-game'),id);
    }
    assert.deepEqual(errors,[]);
    console.log(`${mobile?'mobile touch':'desktop'}: 343 outcomes / 7 wins, visuals, effects, timing, keyboard, interruption and entry guard passed`);
    await context.close();
  }
} finally { await browser.close(); }
