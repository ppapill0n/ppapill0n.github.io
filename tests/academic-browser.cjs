const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const p=await browser.newPage();
 for(const width of [360,390,650,651,1200]){
  await p.setViewportSize({width,height:900});await p.goto('http://127.0.0.1:8765/');
  for(const lang of ['en','ko']){
   await p.locator(`[data-lang=${lang}]`).click();assert.deepEqual(await p.locator('.topics span').allTextContents(),['Program verification','Separation logic','CRIS','Rocq','Lean']);
   const layout=await p.evaluate(()=>{const grid=document.querySelector('.details-grid'),education=grid.firstElementChild.getBoundingClientRect(),contact=document.querySelector('#contact').getBoundingClientRect();return {gap:getComputedStyle(grid).gap,distance:contact.top-education.bottom,sameTop:contact.top===education.top,overflow:document.documentElement.scrollWidth>innerWidth};});
   assert.equal(layout.gap,width<=650?'24px':'72px');assert.ok(!layout.overflow);if(width<=650)assert.equal(layout.distance,24);else assert.ok(layout.sameTop);
   await p.locator('.details-grid').screenshot({path:`/tmp/academic-${width}-${lang}.png`});console.log('PASS',width,lang,JSON.stringify(layout));
  }
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
