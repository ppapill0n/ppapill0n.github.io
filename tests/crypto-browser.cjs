// Chromium checks with controlled time and real mouse/touch browser events.
// SITE_URL=http://127.0.0.1:8765 ARTIFACT_DIR=/tmp/crypto-review node tests/crypto-browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = (process.env.SITE_URL || 'http://127.0.0.1:8765').replace(/\/?$/, '/');
const output = process.env.ARTIFACT_DIR || '/tmp/crypto-review';
const KEY = 'personal-gate-pass';
const WIN_SEED = 4; // Functional payment fixture; seed 3 is now censored at 600s.
const numeric = text => Number(text.replace(/[^\d.-]/g, ''));

(async () => {
  await fs.mkdir(output, { recursive: true });
  const { createSession } = await import('../gate/games/crypto/session.js');
  const { createPolicy } = await import('./crypto-simulation.mjs');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const errors = [], contexts = [];
  async function open(width = 1280, { seed = 42, storageBlocked = false, controlled = true } = {}) {
    const touch = width < 600;
    const context = await browser.newContext({ viewport: { width, height: touch ? (width === 320 ? 740 : 844) : 1000 }, isMobile: touch, hasTouch: touch });
    contexts.push(context);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    if (storageBlocked) await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('Test storage blocked', 'SecurityError'); } }));
    if (controlled) {
      await page.clock.install({ time: new Date('2026-10-19T12:00:00Z') });
      await page.clock.pauseAt(new Date('2026-10-19T12:00:01Z'));
    }
    await page.goto(`${base}gate/games/crypto/?seed=${seed}`);
    await page.locator('#long').waitFor();
    return page;
  }
  const click = (page, selector) => page.viewportSize().width < 600 ? page.locator(selector).tap({ force: true }) : page.locator(selector).click({ force: true });
  const phase = page => page.locator('#game').getAttribute('data-phase');
  const cash = async page => numeric(await page.locator('#cash').textContent());
  const chartBars = page => page.locator('#chart .candle').evaluateAll(nodes => nodes.map(n => n.outerHTML));
  async function select(page, name, value) {
    if (page.viewportSize().width < 600) await page.locator(`#mobile-${name}`).selectOption(String(value), { force: true });
    else await click(page, `[data-${name}="${value}"]`);
  }
  async function noOverflow(page) {
    const data = await page.evaluate(() => ({ width: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert.ok(data.html <= data.width && data.body <= data.width, JSON.stringify(data));
  }
  async function hidden(page, value) {
    await page.evaluate(value => {
      Object.defineProperty(document, 'hidden', { configurable: true, value });
      document.dispatchEvent(new Event('visibilitychange'));
    }, value);
  }
  try {
    for (const width of [320, 390, 768, 1280]) {
      const page = await open(width);
      assert.equal(await cash(page), 10000);
      assert.equal(await page.locator('#pay').isDisabled(), true);
      assert.equal(await page.locator('#mobile-leverage').inputValue(), '1');
      assert.equal(await page.locator('[data-leverage="1"]').getAttribute('aria-pressed'), 'true');
      assert.deepEqual(await page.locator('#mobile-leverage option').evaluateAll(options => options.map(option => option.value)), ['1', '2', '5', '10', '20']);
      assert.equal(await page.locator('#chart .candle').count(), width < 550 ? 40 : 50);
      assert.equal(await page.evaluate(key => sessionStorage.getItem(key), KEY), null);
      assert.equal(await page.getByRole('button', { name: 'Restart game' }).count(), 1);
      assert.equal(await page.locator('.intro, .eyebrow, .rules, footer, .goal').count(), 0);
      assert.match(await page.locator('#status').getAttribute('class'), /sr-only/);
      await noOverflow(page);
      await select(page, 'leverage', 5); // Exercise existing 5x accounting explicitly.
      await select(page, 'allocation', .5);
      const before = await chartBars(page), quote = await page.locator('#quote').textContent();
      await click(page, '#long');
      assert.equal(await cash(page), 5000);
      assert.equal(await page.locator('#position-name').textContent(), 'Long · 5×');
      assert.match(await page.locator('#status').getAttribute('class'), /sr-only/, 'Routine trade announcements remain nonvisual');
      assert.equal(await page.locator('#short').isDisabled(), true);
      assert.equal(await page.locator(width < 600 ? '#mobile-leverage' : '[data-leverage="10"]').isDisabled(), true);
      assert.deepEqual(await chartBars(page), before, 'Order must not advance market');
      assert.equal(await page.locator('#quote').textContent(), quote);
      const firstQty = numeric(await page.locator('#position-size').textContent());
      await click(page, '#long');
      assert.equal(await cash(page), 2500);
      assert.ok(Math.abs(numeric(await page.locator('#position-size').textContent()) - firstQty * 1.5) < .002);
      await select(page, 'allocation', .25);
      const fullQty = numeric(await page.locator('#position-size').textContent());
      await click(page, '#close');
      assert.ok(Math.abs(numeric(await page.locator('#position-size').textContent()) - fullQty * .75) < .002);
      await page.clock.runFor(2000);
      assert.equal(await page.locator('#elapsed').textContent(), '0:02');
      assert.notDeepEqual(await chartBars(page), before);
      assert.equal(await page.locator('#chart .entry-marker').count(), 1);
      assert.equal(await page.locator('#chart .liquidation-marker').count(), 1);
      await noOverflow(page);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, `crypto-${width}.png`), fullPage: true });
      // Buttons remain reachable with standard keyboard activation, too.
      await select(page, 'allocation', 1);
      await page.locator('#close').focus(); await page.keyboard.press('Enter');
      assert.equal(await page.locator('#position-name').textContent(), 'Flat');
      await select(page, 'leverage', 10);
      await click(page, '#short');
      assert.equal(await page.locator('#position-name').textContent(), 'Short · 10×');
      await click(page, '#restart');
      assert.equal(await cash(page), 10000);
      assert.equal(await page.locator('#elapsed').textContent(), '0:00');
      assert.equal(await page.locator('#mobile-leverage').inputValue(), '1');
      assert.equal(await page.locator('#mobile-allocation').inputValue(), '1');
      assert.equal(await page.locator('#position-name').textContent(), 'Flat');
      assert.equal(await page.evaluate(key => sessionStorage.getItem(key), KEY), null);
      const existingPass = '{"unrelated":"existing session must survive prototype restart"}';
      await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), { key: KEY, value: existingPass });
      await click(page, '#restart');
      assert.equal(await page.evaluate(key => sessionStorage.getItem(key), KEY), existingPass);
      await page.context().close();
    }
    console.log('PASS 320/390/768/1280px, mouse/touch, keyboard, no overflow, adds/partial closes/leverage lock, restart; screenshots saved');

    // A click after a timer stall preserves the intent and fills the latest
    // current tick, with no second tap and no extra future simulation.
    const stale = await open();
    const origin = await stale.evaluate(() => Date.now());
    const oldPrice = await stale.locator('#quote').textContent();
    await stale.clock.setSystemTime(new Date(origin + 5000));
    await click(stale, '#long');
    assert.equal(await stale.locator('#position-name').textContent(), 'Long · 1×');
    assert.equal(await cash(stale), 0);
    assert.equal(await phase(stale), 'trading', 'A delay reconciled in one callback needs no catch-up overlay');
    assert.notEqual(await stale.locator('#quote').textContent(), oldPrice);
    assert.match(await stale.locator('#status').textContent(), /Opened long/);
    assert.match(await stale.locator('#status').getAttribute('class'), /sr-only/, 'Successful orders add no explanatory UI');
    await stale.clock.runFor(64);
    assert.equal(await phase(stale), 'trading');
    const shown = await stale.locator('#quote').textContent();
    assert.match(await stale.locator('#levels').textContent(), new RegExp(shown.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(await cash(stale), 0);
    await stale.context().close();
    console.log('PASS stale Long intent fills exactly once at the current price without a second tap');

    const absent = await open(390);
    await select(absent, 'leverage', 20);
    await select(absent, 'allocation', .5);
    await click(absent, '#long');
    const model = createSession(42); model.enter(1, .5, 20);
    const start = await absent.evaluate(() => Date.now());
    await hidden(absent, true);
    await absent.clock.setSystemTime(new Date(start + 3600000));
    await hidden(absent, false);
    assert.equal(await phase(absent), 'catching-up');
    assert.equal(await absent.locator('#long').isDisabled(), false, 'Catch-up still accepts valid trading intents');
    assert.equal(await absent.locator('#close').isDisabled(), true, 'The position already liquidated in the first catch-up chunk');
    // Chunking yields to the event loop before all 36,000 missing ticks finish.
    assert.notEqual(await absent.locator('#elapsed').textContent(), '60:00');
    await absent.screenshot({ path: path.join(output, 'crypto-catching-up.png'), fullPage: true });
    await absent.clock.runFor(500);
    model.advance(3600500);
    assert.equal(await phase(absent), 'trading');
    assert.equal(await absent.locator('#elapsed').textContent(), '60:00');
    assert.equal(await absent.locator('#position-name').textContent(), 'Flat');
    assert.equal(await cash(absent), 5000);
    assert.match(await absent.locator('#status').textContent(), /Liquidated/);
    // The render timer can trail the wall clock by <100ms. A wake-up reconciles
    // precisely now, and duplicate events at that instant must not advance twice.
    await hidden(absent, false);
    assert.equal(numeric(await absent.locator('#quote').textContent()), +model.snapshot().market.price.toFixed(2));
    await absent.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    await absent.clock.runFor(64); model.advance(64);
    assert.equal(numeric(await absent.locator('#quote').textContent()), +model.snapshot().market.price.toFixed(2));
    assert.equal(await cash(absent), 5000);
    // A restart during a new catch-up invalidates all old chunks and paint callbacks.
    await absent.clock.setSystemTime(new Date(start + 7200000));
    await click(absent, '#long');
    assert.equal(await phase(absent), 'catching-up');
    await click(absent, '#restart');
    await absent.clock.runFor(200);
    assert.equal(await cash(absent), 10000);
    assert.equal(await absent.locator('#elapsed').textContent(), '0:00');
    assert.equal(await phase(absent), 'trading');
    await absent.context().close();
    console.log('PASS one-hour hidden catch-up, bounded chunks, liquidation, repeated lifecycle callbacks, restart cancels old work');

    // Production parameters: this sweep crosses liquidation and then recovers
    // above entry. The paired background path never liquidates this position.
    const swept = await open(390, { seed: 11 });
    const { CONFIG } = await import('../gate/games/crypto/config.js');
    const sweepModel = createSession(11), sweepBaseline = createSession(11, { ...CONFIG, sweeps: { ...CONFIG.sweeps, enabled: false } });
    const entry = sweepModel.snapshot().market.price;
    sweepModel.enter(1, .5, 20); sweepBaseline.enter(1, .5, 20);
    await select(swept, 'leverage', 20); await select(swept, 'allocation', .5); await click(swept, '#long');
    const sweepStart = await swept.evaluate(() => Date.now());
    await hidden(swept, true);
    await swept.clock.setSystemTime(new Date(sweepStart + 30000));
    await hidden(swept, false); await swept.clock.runFor(64);
    sweepModel.advance(30064); sweepBaseline.advance(30064);
    assert.ok(sweepModel.snapshot().market.price > entry);
    assert.equal(sweepModel.snapshot().liquidations, 1);
    assert.equal(sweepBaseline.snapshot().liquidations, 0);
    assert.equal(await cash(swept), 5000);
    assert.equal(await swept.locator('#position-name').textContent(), 'Flat');
    assert.equal(numeric(await swept.locator('#quote').textContent()), +sweepModel.snapshot().market.price.toFixed(2));
    await swept.screenshot({ path: path.join(output, 'crypto-sweep-recovered.png'), fullPage: true });
    await swept.context().close();
    console.log('PASS production sweep liquidates while hidden despite recovery above entry; paired background position survives');

    const bankrupt = await open(390);
    await select(bankrupt, 'leverage', 20); await click(bankrupt, '#long');
    await hidden(bankrupt, true);
    const bankStart = await bankrupt.evaluate(() => Date.now());
    await bankrupt.clock.setSystemTime(new Date(bankStart + 120000));
    await hidden(bankrupt, false);
    await bankrupt.clock.runFor(200);
    assert.equal(await phase(bankrupt), 'bankrupt');
    assert.equal(await cash(bankrupt), 0);
    assert.equal(await bankrupt.locator('#retry').isVisible(), true);
    await bankrupt.screenshot({ path: path.join(output, 'crypto-bankrupt.png'), fullPage: true });
    const endedTicker = await bankrupt.locator('#ticker').textContent();
    await click(bankrupt, '#retry');
    assert.equal(await cash(bankrupt), 10000);
    assert.equal(await phase(bankrupt), 'trading');
    const retryTicker = await bankrupt.locator('#ticker').textContent();
    assert.match(retryTicker, /^[A-Z]{4}$/); assert.notEqual(retryTicker, endedTicker);
    assert.equal(await bankrupt.locator('#chart title').textContent(), `Fictional ${retryTicker} / USD candlestick chart`);
    await bankrupt.context().close();
    console.log('PASS unseen liquidation / bankruptcy and touch retry');

    async function win(page, blocked) {
      await select(page, 'leverage', 5); // Pacing fixture deliberately uses 5x, not the default.
      const session = createSession(WIN_SEED), policy = createPolicy('trend', WIN_SEED);
      let goal = false;
      for (let step = 0; step < 300; step++) {
        let state = session.snapshot();
        if (state.account.cashAfterClose >= 50000) {
          if (state.account.position) { session.close(1); await click(page, '#close'); }
          goal = true; break;
        }
        const action = policy(state);
        if (action.close) { session.close(1); await click(page, '#close'); }
        state = session.snapshot();
        if (action.side && !state.account.position) { session.enter(action.side, 1, 5); await click(page, action.side === 1 ? '#long' : '#short'); }
        session.advance(2000); await page.clock.runFor(2000);
      }
      assert.equal(goal, true);
      assert.equal(await page.locator('#pay').isEnabled(), true);
      assert.ok(Math.abs(await cash(page) - session.snapshot().account.cash) < .02);
      if (!blocked) {
        assert.equal(await page.evaluate(key => sessionStorage.getItem(key), KEY), null, 'No pass before explicit Pay');
        await page.screenshot({ path: path.join(output, 'crypto-goal.png'), fullPage: true });
        const amount = await cash(page);
        await page.evaluate(() => new MutationObserver(() => {
          if (document.querySelector('#game').dataset.phase === 'paid') sessionStorage.setItem('crypto-test-cash-at-exit', document.querySelector('#cash').textContent);
        }).observe(document.querySelector('#game'), { attributes: true, attributeFilter: ['data-phase'] }));
        await page.route('**/personal/', route => route.fulfill({ contentType: 'text/html', body: '<p>Personal navigation reached</p>' }));
        await click(page, '#pay');
        await page.waitForURL(`${base}personal/`);
        const pass = JSON.parse(await page.evaluate(key => sessionStorage.getItem(key), KEY));
        assert.equal(pass.version, 1);
        assert.equal(pass.expiresAt - pass.issuedAt, 3600000);
        assert.ok(amount >= 50000);
        assert.ok(Math.abs(numeric(await page.evaluate(() => sessionStorage.getItem('crypto-test-cash-at-exit'))) - (amount - 50000)) < .02);
      } else {
        const before = await cash(page);
        await click(page, '#pay');
        assert.equal(await cash(page), before);
        assert.match(await page.locator('#status').textContent(), /storage is unavailable/);
        assert.doesNotMatch(await page.locator('#status').getAttribute('class'), /sr-only/, 'Storage errors remain visible');
        assert.equal(await page.locator('#pay').isEnabled(), true);
        assert.match(page.url(), /crypto/);
      }
    }
    const winner = await open(1280, { seed: WIN_SEED }); await win(winner, false); await winner.context().close();
    const deniedStorage = await open(390, { seed: WIN_SEED, storageBlocked: true }); await win(deniedStorage, true); await deniedStorage.context().close();
    console.log('PASS real seeded 5x UI strategy reaches goal, explicit Pay issues existing pass and navigates; unavailable storage does not spend');

    // Real (unmocked) timer smoke check complements controlled-time tests.
    const real = await open(390, { controlled: false });
    const initialChart = await chartBars(real);
    await real.waitForTimeout(2200);
    assert.notDeepEqual(await chartBars(real), initialChart);
    assert.equal(await phase(real), 'trading');
    assert.deepEqual(errors, []);
    console.log('PASS unmocked browser clock advances; zero browser errors. No physical handset tested.');
  } finally {
    await Promise.all(contexts.map(context => context.close().catch(() => {})));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
