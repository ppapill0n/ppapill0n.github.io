// Foreground stalls, render-cost tick crossings, long catch-up and queued orders.
// SITE_URL=http://127.0.0.1:8767 node tests/crypto-foreground-browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = (process.env.SITE_URL || 'http://127.0.0.1:8767').replace(/\/?$/, '/');
const output = process.env.ARTIFACT_DIR || '/tmp/crypto-foreground-review';
const number = text => Number(text.replace(/[^\d.-]/g, ''));

(async () => {
  await fs.mkdir(output, { recursive: true });
  const { createSession } = await import('../gate/games/crypto/session.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const contexts = [], errors = [];
  async function open(width = 390, { seed = 4, controlled = true } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 550, hasTouch: width < 550 });
    contexts.push(context);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    if (controlled) {
      await page.clock.install({ time: new Date('2026-10-22T12:00:00Z') });
      await page.clock.pauseAt(new Date('2026-10-22T12:00:01Z'));
    }
    await page.addInitScript(() => {
      window.probe = { shows: 0, writes: 0, renderCost: 0, offset: 0 };
      const now = Date.now;
      Date.now = () => now() + probe.offset;
      // Record transient overlay writes too, even if a later frame hides them.
      const hidden = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidden');
      Object.defineProperty(HTMLElement.prototype, 'hidden', { ...hidden, set(value) {
        if (this.id === 'catchup-layer' && !value && document.querySelector('#game')?.dataset.phase === 'catching-up') probe.shows++;
        hidden.set.call(this, value);
      } });
      const html = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      Object.defineProperty(Element.prototype, 'innerHTML', { ...html, set(value) {
        html.set.call(this, value);
        if (this.id === 'chart') {
          probe.writes++;
          // Advance wall time during one actual SVG update, crossing a tick
          // after reconciliation, without modifying market/account code.
          probe.offset += probe.renderCost; probe.renderCost = 0;
        }
      } });
    });
    await page.goto(`${base}gate/games/crypto/?seed=${seed}`);
    await page.locator('#long').waitFor();
    return page;
  }
  const click = (page, selector) => page.viewportSize().width < 550 ? page.locator(selector).tap({ force: true }) : page.locator(selector).click({ force: true });
  const cash = async page => number(await page.locator('#cash').textContent());
  const phase = page => page.locator('#game').getAttribute('data-phase');
  const resetProbe = page => page.evaluate(() => { probe.shows = 0; probe.writes = 0; });
  async function select(page, name, value) {
    if (page.viewportSize().width < 550) await page.locator(`#mobile-${name}`).selectOption(String(value), { force: true });
    else await click(page, `[data-${name}="${value}"]`);
  }
  async function visible(page, value) {
    await page.evaluate(value => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: !value });
      document.dispatchEvent(new Event('visibilitychange'));
    }, value);
  }
  try {
    for (const width of [390, 1280]) {
      const page = await open(width);
      await resetProbe(page);
      await page.evaluate(() => { window.firstCandle = document.querySelector('#chart .candle'); });
      await page.clock.runFor(50);
      assert.equal(await page.evaluate(() => probe.writes), 0, 'A poll without a tick must keep the existing SVG');
      await select(page, 'allocation', .5);
      assert.equal(await page.evaluate(() => firstCandle === document.querySelector('#chart .candle')), true);
      for (const delay of [100, 250, 900, 1100, 5000]) {
        await resetProbe(page);
        await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now()) + delay));
        await page.clock.runFor(50);
        assert.equal(await page.evaluate(() => probe.shows), 0, `${width}px foreground delay ${delay}ms must not flash`);
        assert.equal(await phase(page), 'trading');
        assert.equal(await page.locator('#catchup-layer').isVisible(), false);
        assert.ok(await page.locator('#chart .candle').count() >= 40);
      }
      await resetProbe(page);
      await page.evaluate(() => { probe.renderCost = 120; });
      await page.clock.runFor(200);
      assert.equal(await page.evaluate(() => probe.renderCost), 0, 'The slow redraw was exercised');
      assert.equal(await page.evaluate(() => probe.shows), 0, 'A tick becoming due during render must not flash');
      assert.equal(await phase(page), 'trading');
      const box = await page.locator('#chart').getAttribute('viewBox');
      await page.setViewportSize({ width: width === 390 ? 320 : 700, height: 1000 });
      await page.clock.runFor(64);
      assert.notEqual(await page.locator('#chart').getAttribute('viewBox'), box);
      await page.screenshot({ path: `${output}/foreground-${width}.png`, fullPage: true });
      await page.context().close();
    }
    console.log('PASS 390/1280px: 100–5000ms foreground delays and 120ms slow redraw show no overlay; unchanged SVG is retained; resize redraws');

    const delayed = await open(), model = createSession(4), start = await delayed.evaluate(() => Date.now());
    await select(delayed, 'allocation', .5); await resetProbe(delayed);
    await delayed.clock.setSystemTime(new Date(start + 1275)); await click(delayed, '#short');
    model.advance(1200); model.enter(-1, .5, 1);
    assert.equal(await cash(delayed), 5000);
    assert.ok(Math.abs(number(await delayed.locator('#position-size').textContent()) - model.snapshot().account.position.quantity) < .001);
    assert.equal(await delayed.locator('#chart .entry-marker').count(), 1);
    await select(delayed, 'allocation', .25);
    await delayed.clock.setSystemTime(new Date(start + 2775)); await click(delayed, '#close');
    model.advance(1500); model.close(.25);
    assert.ok(Math.abs(await cash(delayed) - model.snapshot().account.cash) < .01);
    assert.equal(await delayed.evaluate(() => probe.shows), 0);
    await select(delayed, 'allocation', 1); await click(delayed, '#close');
    assert.equal(await delayed.locator('#chart .entry-marker').count(), 0);
    await delayed.context().close();
    console.log('PASS delayed Short and partial Close fill exactly once at the latest elapsed tick; position lines update without an extra market tick');

    const queued = await open(), queuedModel = createSession(4), origin = await queued.evaluate(() => Date.now());
    await select(queued, 'allocation', .25); await resetProbe(queued);
    await queued.clock.setSystemTime(new Date(origin + 3600000));
    await queued.evaluate(() => { for (let i = 0; i < 3; i++) document.querySelector('#long').click(); });
    assert.equal(await phase(queued), 'catching-up');
    assert.equal(await queued.locator('#catchup-layer').isVisible(), true);
    assert.equal(await cash(queued), 10000);
    await queued.screenshot({ path: `${output}/long-catchup.png`, fullPage: true });
    await queued.clock.runFor(500);
    queuedModel.advance(3600000); for (let i = 0; i < 3; i++) queuedModel.enter(1, .25, 1);
    assert.equal(await phase(queued), 'trading');
    assert.equal(await queued.locator('#catchup-layer').isVisible(), false);
    assert.equal(await cash(queued), 4218.75);
    assert.ok(Math.abs(number(await queued.locator('#position-size').textContent()) - queuedModel.snapshot().account.position.quantity) < .001);
    await resetProbe(queued);
    await queued.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    assert.equal(await queued.evaluate(() => probe.shows), 0);
    assert.equal(await cash(queued), 4218.75);
    await queued.context().close();
    console.log('PASS genuine multi-chunk backlog shows overlay then clears immediately; three FIFO orders fill once; duplicate wakeups do not flash/replay');

    const away = await open(390, { seed: 11 }), awayModel = createSession(11), awayStart = await away.evaluate(() => Date.now());
    await select(away, 'leverage', 20); await select(away, 'allocation', .5); await click(away, '#long');
    awayModel.enter(1, .5, 20); const entry = awayModel.snapshot().market.price;
    await visible(away, false); await away.clock.setSystemTime(new Date(awayStart + 30000)); await visible(away, true);
    awayModel.advance(30000);
    assert.equal(awayModel.snapshot().liquidations, 1); assert.ok(awayModel.snapshot().market.price > entry);
    assert.equal(await away.locator('#position-name').textContent(), 'Flat'); assert.equal(await cash(away), 5000);
    assert.equal(number(await away.locator('#quote').textContent()), +awayModel.snapshot().market.price.toFixed(2));
    assert.equal(await away.locator('#catchup-layer').isVisible(), false);
    await away.context().close();
    console.log('PASS hidden-tab tick progression still liquidates at an intermediate crossing before price recovery');

    const real = await open(390, { controlled: false }), cdp = await real.context().newCDPSession(real);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 }); await resetProbe(real);
    await real.evaluate(async () => {
      window.frameProbe = { frames: 0, empty: 0, covered: 0, done: false };
      function frame() {
        frameProbe.frames++;
        if (!document.querySelector('#chart .candle')) frameProbe.empty++;
        if (!document.querySelector('#catchup-layer').hidden) frameProbe.covered++;
        if (!frameProbe.done) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      for (let i = 0; i < 8; i++) {
        const until = performance.now() + 120; while (performance.now() < until) {}
        await new Promise(resolve => setTimeout(resolve, 80));
      }
      frameProbe.done = true;
    });
    const measured = await real.evaluate(() => ({ ...frameProbe, writes: probe.writes, shows: probe.shows }));
    assert.ok(measured.frames > 0 && measured.writes > 0); assert.equal(measured.empty, 0); assert.equal(measured.covered, 0); assert.equal(measured.shows, 0);
    await fs.writeFile(`${output}/real-foreground.json`, JSON.stringify(measured, null, 2));
    await real.screenshot({ path: `${output}/real-foreground.png`, fullPage: true });
    await real.context().close();
    console.log('PASS real timers, 6× CPU throttling and eight 120ms foreground stalls: no blank or covered chart frames', measured);
    assert.deepEqual(errors, []);
  } finally { await Promise.all(contexts.map(context => context.close().catch(() => {}))); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
