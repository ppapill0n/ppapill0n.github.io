const {chromium}=require('playwright');const assert=require('node:assert/strict');
const base=process.env.SITE_URL||'http://127.0.0.1:8765';const KEY='personal-gate-pass',TTL=3600000;
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const errors=[];
  async function open(context){const p=await (context||await browser.newContext()).newPage();p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{let n=0;Math.random=()=>n++===0?3.5/7:0;});return p;}
  const raw=p=>p.evaluate(key=>sessionStorage.getItem(key),KEY);
  async function win(p){await p.goto(base+'/gate/');await p.waitForFunction(()=>!document.querySelector('#enter').disabled);assert.equal(await raw(p),null);await p.locator('#enter').click();await p.waitForURL('**/personal/');await p.waitForFunction(()=>!document.documentElement.hasAttribute('data-private-pending'));}
  const p=await open();
  // Delay the guard module: protected markup exists but is invisible before validation.
  let pending,ready;const held=new Promise(r=>ready=r);await p.route('**/personal/access.js',route=>{pending=route;ready();});
  await p.goto(base+'/personal/',{waitUntil:'commit'});await held;await p.locator('main').waitFor({state:'attached'});assert.ok(await p.locator('main').isHidden());await p.screenshot({path:'/tmp/personal-no-flash.png'});await pending.continue();await p.waitForURL('**/gate/');await p.unroute('**/personal/access.js');
  await win(p);const original=await raw(p),pass=JSON.parse(original);assert.equal(pass.expiresAt-pass.issuedAt,TTL);assert.ok(pass.issuedAt<=Date.now());
  await p.reload();await p.waitForFunction(()=>!document.documentElement.hasAttribute('data-private-pending'));assert.equal(await raw(p),original);
  await p.screenshot({path:'/tmp/personal-authorized.png'});
  // Independent tabs start empty; tabs opened with an opener may copy sessionStorage.
  const independent=await open(p.context());await independent.goto(base+'/personal/');await independent.waitForURL('**/gate/');assert.equal(await raw(independent),null);
  const popupPromise=p.waitForEvent('popup');await p.evaluate(()=>window.open('/personal/','session-copy'));const popup=await popupPromise;await popup.waitForLoadState();await popup.waitForFunction(()=>!document.documentElement.hasAttribute('data-private-pending'));assert.equal(await raw(popup),original);await popup.close();
  // A direct gate visit still shows a game and clears the old pass; global reset also clears.
  await p.goto(base+'/gate/');assert.ok(await p.locator('#game').isVisible());assert.equal(await raw(p),null);
  await p.evaluate(({key,pass})=>sessionStorage.setItem(key,pass),{key:KEY,pass:original});await p.locator('#new-target').click();assert.equal(await raw(p),null);
  // Invalid timestamps and malformed records redirect once, with no protected-content flash.
  for(const record of ['{broken','null',JSON.stringify({...pass,issuedAt:Date.now()+100000,expiresAt:Date.now()+100000+TTL}),JSON.stringify({...pass,expiresAt:pass.expiresAt+1}),JSON.stringify({version:1,issuedAt:Date.now()-TTL-1,expiresAt:Date.now()-1})]){
    await p.evaluate(({key,record})=>sessionStorage.setItem(key,record),{key:KEY,record});await p.goto(base+'/personal/');await p.waitForURL('**/gate/');assert.equal(await raw(p),null);
  }
  // Actual one-hour timer, background return, and pageshow/bfcache revalidation.
  const clock=await open();await clock.clock.install({time:new Date('2026-10-07T12:00:00Z')});await win(clock);const clockRaw=await raw(clock);await clock.clock.fastForward(TTL-1000);assert.equal(await raw(clock),clockRaw);assert.ok(clock.url().endsWith('/personal/'));await clock.clock.fastForward(1100);await clock.waitForURL('**/gate/');
  await win(clock);let issued=JSON.parse(await raw(clock)).issuedAt;await clock.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.ok(await clock.locator('main').isHidden());await clock.clock.setSystemTime(issued+TTL+1);await clock.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await clock.waitForURL('**/gate/');
  await win(clock);issued=JSON.parse(await raw(clock)).issuedAt;await clock.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));assert.ok(await clock.locator('main').isHidden());await clock.clock.setSystemTime(issued+TTL+1);await clock.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await clock.waitForURL('**/gate/');
  // A real back/forward navigation also rechecks; no restoration of expired content.
  await win(clock);issued=JSON.parse(await raw(clock)).issuedAt;await clock.goto(base+'/');await clock.clock.setSystemTime(issued+TTL+1);await clock.goBack();await clock.waitForURL('**/gate/');
  // Denied storage: a single redirect from personal, then a visible error on gate.
  const blocked=await open();await blocked.addInitScript(()=>{for(const name of ['sessionStorage','localStorage'])Object.defineProperty(window,name,{get(){throw new DOMException('Disabled','SecurityError');},configurable:true});});
  await blocked.goto(base+'/personal/');await blocked.waitForURL('**/gate/');await blocked.waitForFunction(()=>!document.querySelector('#enter').disabled);assert.ok(await blocked.locator('#entry-error').isVisible());await blocked.locator('#enter').click();await blocked.waitForTimeout(200);assert.ok(blocked.url().endsWith('/gate/'));assert.ok(await blocked.locator('[role="alert"]').isVisible());
  // Six existing REAL adapter instances feed their actual getState into the shared entry action.
  // Clock injection supplies deterministic cannon and slot completion, not fake state.
  const adapters=await open();await adapters.goto(base+'/gate/');const results=await adapters.evaluate(async()=>{
    const {createRegistry}=await import('/gate/registry.js'),{enterPersonal}=await import('/gate/common/entry.js'),{clearPass,readPass,PASS_KEY}=await import('/gate/common/session-pass.js'),{solvedCube}=await import('/gate/common/cube-engine.js'),{trajectory,landingCode}=await import('/gate/games/cannon/physics.js');
    const results=[];
    for(const definition of createRegistry(()=>0).filter(game=>game.id!=='gomoku')){
      clearPass();let time=0,navigations=0,result=null;const host=document.createElement('main');document.body.append(host);
      const challenge=definition.id==='dial'?{target:42,start:42}:definition.cube?{target:1,stickers:solvedCube(definition.id==='cube2'?2:3)}:definition.id==='cannon'?{target:landingCode(trajectory(45,.5).distance)}:definition.id==='slots'?{target:777}:{target:0};
      const game=definition.create(host,()=>{},()=>{},()=>time,()=>0);game.reset(challenge);
      const action=document.createElement('button');action.textContent='Test explicit entry';host.append(action);action.onclick=()=>{result=enterPersonal(challenge.target,game.getState(),definition.rules,()=>navigations++);};
      if(definition.id==='slots'){host.querySelector('#lever').click();action.click();if(result!=='locked')throw Error('Spinning slot granted');time=3000;}
      if(definition.id==='cannon'){time=250;host.querySelector('#fire').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space'}));time=500;window.dispatchEvent(new KeyboardEvent('keyup',{key:' ',code:'Space'}));action.click();if(result!=='locked')throw Error('Flying cannon granted');time=5000;}
      await new Promise(requestAnimationFrame);
      if(sessionStorage.getItem(PASS_KEY)!==null)throw Error('Pass issued without explicit successful action');
      action.click();results.push({id:definition.id,result,navigations,status:readPass().status});game.destroy();host.remove();
    }
    return results;
  });
  assert.deepEqual(results.map(r=>r.id),['dial','cannon','slots','soda','cube','cube2']);for(const result of results){assert.equal(result.result,'entered');assert.equal(result.navigations,1);assert.equal(result.status,'valid');}
  await p.context().close();const fresh=await open();await fresh.goto(base+'/personal/');await fresh.waitForURL('**/gate/');assert.equal(await raw(fresh),null);
  assert.deepEqual(errors,[]);console.log('PASS direct URL/no-flash, actual entry and refresh, fixed one-hour expiry/timer/background/pageshow/back, malformed/future records, new and opener-copied tabs, session end, reset, unavailable storage, all six existing adapter entry integrations');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
