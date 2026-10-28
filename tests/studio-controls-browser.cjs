// Input groundwork only: this is not a visual/3D acceptance test.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const site = process.env.SITE_URL || 'http://127.0.0.1:8765';

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(site);
    await page.setContent('<main><div id="surface" tabindex="0" aria-label="Look controls test" style="width:300px;height:300px;background:#ddd"></div><button id="other">Outside controls</button></main>');
    await page.evaluate(async url => {
      const { attachViewControls } = await import(`${url}/personal/studio-preview/view-controls.js`);
      window.picks = [];
      window.control = attachViewControls(document.querySelector('#surface'), {
        onView: (view, direction) => { window.view = view; window.direction = direction; },
        onPick: point => window.picks.push(point),
      });
    }, site);
    const view = () => page.evaluate(() => ({ ...window.view }));
    const picks = () => page.evaluate(() => window.picks.length);
    await page.mouse.click(100, 100);
    assert.equal(await picks(), 1);
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(103, 102);
    assert.deepEqual(await view(), { yaw: 0, pitch: 0 });
    await page.mouse.up();
    assert.equal(await picks(), 2);
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(220, 140, { steps: 8 });
    assert.ok((await view()).yaw < -0.4);
    assert.ok((await view()).pitch > 0.1);
    await page.mouse.move(100, 100, { steps: 8 });
    await page.mouse.up();
    assert.equal(await picks(), 2, 'returning to drag origin must not navigate');
    await page.keyboard.press('ArrowRight');
    assert.ok((await view()).yaw > 0);
    await page.keyboard.press('Home');
    assert.deepEqual(await view(), { yaw: 0, pitch: 0 });
    await page.locator('#other').focus();
    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await view(), { yaw: 0, pitch: 0 }, 'keys outside the view must not be captured');

    const cdp = await page.context().newCDPSession(page);
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    await touch('touchStart', [{ x: 100, y: 100, id: 1 }]);
    await touch('touchMove', [{ x: 190, y: 160, id: 1 }]);
    await touch('touchEnd', []);
    assert.ok((await view()).yaw < -0.3);
    assert.equal(await picks(), 2);
    await touch('touchStart', [{ x: 100, y: 100, id: 1 }]);
    await touch('touchEnd', []);
    assert.equal(await picks(), 3, 'touch tap picks');
    await touch('touchStart', [{ x: 100, y: 100, id: 1 }]);
    await touch('touchStart', [{ x: 100, y: 100, id: 1 }, { x: 150, y: 150, id: 2 }]);
    await touch('touchEnd', []);
    assert.equal(await picks(), 3, 'multi-touch cannot pick');
    await touch('touchStart', [{ x: 100, y: 100, id: 1 }]);
    await touch('touchCancel', []);
    assert.equal(await picks(), 3, 'canceled touch cannot pick');
    await page.evaluate(() => window.control.destroy());
    const stoppedView = await view();
    await page.mouse.move(100, 100);
    await page.mouse.down();
    await page.mouse.move(250, 200);
    await page.mouse.up();
    assert.deepEqual(await view(), stoppedView);
    assert.equal(await picks(), 3);
    assert.equal(await page.locator('#surface').evaluate(element => element.style.touchAction), '');
    assert.deepEqual(errors, []);
    console.log('PASS mouse/touch direction controls, jitter, drag-return click suppression, multi-touch/cancel, scoped keyboard, cleanup');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
