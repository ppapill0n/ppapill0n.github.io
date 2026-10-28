// Actual Chromium WebGL rendering and input; touch is browser emulation, not Android hardware.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const base = process.env.SITE_URL || 'http://127.0.0.1:8765';
const output = process.env.STUDIO_SCREENSHOTS || '/workspace/scratch/studio-review';
const route = `${base}/personal/studio-preview/?inspect`;
const key = 'personal-studio-preview:v1';

(async () => {
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const errors = [], contexts = [];
  async function open(options = {}, init) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options }); contexts.push(context);
    if (init) await context.addInitScript(init);
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(route); await page.waitForFunction(() => document.body.dataset.ready);
    return page;
  }
  const inspect = page => page.evaluate(() => window.studioInspect());
  const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const add = async (page, type = 'plant', destination = 'profile') => {
    await page.locator('#object-type').selectOption(type); await page.locator('#destination').selectOption(destination);
    await page.locator('#add-object').click(); await settle(page);
  };
  try {
    const page = await open();
    assert.equal(await page.getAttribute('body', 'data-ready'), 'room');
    await settle(page);
    const initial = await inspect(page); assert.deepEqual(initial.camera, [0, 1.6, 2.7]); assert.equal(initial.objects, 0); assert.ok(initial.drawCalls > 50);
    await page.screenshot({ path: `${output}/desktop-empty.png` });
    await page.mouse.move(650, 400); await page.mouse.down(); await page.mouse.move(1100, 600, { steps: 16 }); await page.mouse.up();
    let moved = await inspect(page); assert.deepEqual(moved.camera, initial.camera); assert.notDeepEqual(moved.direction, initial.direction);
    assert.equal(page.url(), route);
    await page.locator('#home-view').click(); assert.deepEqual((await inspect(page)).view, initial.view);
    await page.locator('#scene').focus(); await page.keyboard.press('ArrowLeft'); assert.ok((await inspect(page)).view.yaw < initial.view.yaw);
    for (let i = 0; i < 36; i++) await page.keyboard.press('ArrowLeft');
    await settle(page); await page.screenshot({ path: `${output}/desktop-behind.png` });
    assert.deepEqual((await inspect(page)).camera, initial.camera);
    await page.keyboard.press('Home');
    await page.locator('#edit').click();
    for (const type of ['plant', 'books', 'game']) await add(page, type);
    assert.equal((await inspect(page)).objects, 3);
    await page.locator('#close-editor').click(); await settle(page);
    await page.screenshot({ path: `${output}/desktop-objects.png` });
    const target = (await inspect(page)).projections[0];
    const hit = await page.evaluate(point => {
      const offset = document.querySelector('#scene').getBoundingClientRect();
      for (let dy = 12; dy < 130; dy += 4) for (let dx = -35; dx <= 35; dx += 4) {
        const x = point.x + dx + offset.left, y = point.y + dy + offset.top;
        if (window.studioPick(x, y) === point.id) return { x, y };
      }
    }, target);
    assert.ok(hit, 'actual visible plant geometry can be ray picked');
    await page.mouse.move(hit.x, hit.y); await page.mouse.down(); await page.mouse.move(hit.x + 40, hit.y, { steps: 5 }); await page.mouse.move(hit.x, hit.y); await page.mouse.up();
    assert.equal(page.url(), route, 'drag from an object and back must not navigate');
    await page.locator('#home-view').click(); await settle(page);
    await page.mouse.click(hit.x, hit.y); await page.waitForURL(`${base}/`);
    await page.goBack(); await page.waitForFunction(() => document.body.dataset.ready === 'room');
    assert.equal((await inspect(page)).objects, 3, 'browser Back restores persistent layout');
    await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === 'room'); assert.equal((await inspect(page)).objects, 3);
    await page.locator('#edit').click();
    await page.locator('#empty-room').click(); await page.locator('#cancel-reset').click(); assert.equal((await inspect(page)).objects, 3);
    await page.locator('#empty-room').click(); await page.locator('#confirm-reset').click(); await settle(page);
    const emptyMemory = (await inspect(page)).geometries;
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 6; i++) await add(page, ['plant', 'books', 'game'][i % 3]);
      assert.equal(await page.locator('#add-object').isDisabled(), true);
      await page.locator('#object-list button').nth(2).click(); assert.equal((await inspect(page)).objects, 5);
      await add(page, 'books'); assert.equal((await inspect(page)).objects, 6);
      await page.locator('#empty-room').click(); await page.locator('#confirm-reset').click(); await settle(page);
      assert.equal((await inspect(page)).objects, 0);
      assert.equal((await inspect(page)).geometries, emptyMemory, 'deleted object geometry is released');
    }
    await page.locator('#object-name').fill('<img src=x onerror=alert(1)>'); await page.locator('#add-object').click();
    assert.equal(await page.locator('#object-list img').count(), 0); assert.match(await page.locator('#object-list').textContent(), /<img/);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#editor').isVisible(), false); assert.equal(await page.locator('#edit').evaluate(e => e === document.activeElement), true);
    console.log('PASS WebGL render, fixed camera/full turn, keyboard, ray pick, drag suppression, navigation/back, persistence, repeated edits/reset and geometry disposal');

    const mobile = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await settle(mobile); await mobile.screenshot({ path: `${output}/mobile-empty.png` });
    const beforeTouch = await inspect(mobile), cdp = await mobile.context().newCDPSession(mobile);
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    await touch('touchStart', [{ x: 130, y: 400, id: 1 }]); await touch('touchMove', [{ x: 300, y: 430, id: 1 }]); await touch('touchEnd', []);
    assert.notDeepEqual((await inspect(mobile)).view, beforeTouch.view); assert.deepEqual((await inspect(mobile)).camera, beforeTouch.camera);
    await settle(mobile); await mobile.screenshot({ path: `${output}/mobile-garden.png` });
    await mobile.locator('#edit').click(); await add(mobile); await mobile.screenshot({ path: `${output}/mobile-editor.png` });
    assert.ok(await mobile.locator('#editor').evaluate(e => e.scrollWidth <= e.clientWidth));
    await mobile.locator('#close-editor').click();
    for (const [width, height] of [[320, 568], [360, 740], [650, 900], [844, 390]]) {
      await mobile.setViewportSize({ width, height }); await settle(mobile);
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow ${width}`);
      assert.ok(await mobile.locator('#scene').evaluate(e => e.clientHeight >= 150));
      await mobile.locator('#edit').click(); await mobile.locator('#object-list button').first().scrollIntoViewIfNeeded();
      assert.equal(await mobile.locator('#object-list button').first().isVisible(), true); await mobile.locator('#close-editor').click();
    }
    console.log('PASS mobile touch, portrait/landscape/narrow layouts and editor access');

    for (const failure of ['read', 'write']) {
      const context = await browser.newContext(); contexts.push(context);
      await context.addInitScript(mode => {
        if (mode === 'read') Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
        else Storage.prototype.setItem = function() { throw new DOMException('full', 'QuotaExceededError'); };
      }, failure);
      const p = await context.newPage(); await p.goto(route); await p.waitForFunction(() => document.body.dataset.ready === 'room');
      await p.locator('#edit').click(); await add(p); assert.equal((await inspect(p)).objects, 1);
      assert.match(await p.locator('#storage-status').textContent(), /저장소를 사용할 수 없어/);
      await p.locator('#object-list button').click(); assert.equal((await inspect(p)).objects, 0);
    }
    const corrupt = await open({}, () => localStorage.setItem('personal-studio-preview:v1', '{"version":99,"objects":[]}'));
    await corrupt.locator('#edit').click(); assert.match(await corrupt.locator('#storage-status').textContent(), /이전 배치를 읽을 수 없어/);
    await add(corrupt); assert.equal((await inspect(corrupt)).objects, 1);
    const unsupported = await open({}, () => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/.test(type) ? null : get.call(this, type, ...args); }; });
    assert.equal(await unsupported.getAttribute('body', 'data-ready'), 'fallback');
    await unsupported.locator('#quick-links summary').click(); await unsupported.locator('#quick-links a[href="/"]').click(); await unsupported.waitForURL(`${base}/`);
    // No-JS has no readiness signal; test its native fallback links directly.
    const noJsContext = await browser.newContext({ javaScriptEnabled: false }); contexts.push(noJsContext);
    const noJsPage = await noJsContext.newPage(); await noJsPage.goto(route);
    assert.equal(await noJsPage.locator('noscript p').isVisible(), true);
    await noJsPage.locator('#quick-links summary').click(); assert.equal(await noJsPage.locator('#quick-links a[href="/"]').isVisible(), true);
    const loss = await open(); await loss.evaluate(() => document.querySelector('#scene').dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    assert.equal(await loss.getAttribute('body', 'data-ready'), 'fallback');
    console.log('PASS unavailable/full/corrupt storage, no-WebGL, no-JS, context-loss fallback links');
    assert.deepEqual(errors, []);
    console.log(`PASS screenshots: ${output}`);
  } finally { for (const context of contexts) await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
