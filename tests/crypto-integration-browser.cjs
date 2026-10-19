// Real gate/freeplay integration, controlled time and native browser input.
// NODE_PATH=<playwright path> SITE_URL=http://127.0.0.1:8767 node tests/crypto-integration-browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { resetToGame } = require('./browser-selection.cjs');
const base = (process.env.SITE_URL || 'http://127.0.0.1:8767').replace(/\/?$/, '/');
const output = process.env.ARTIFACT_DIR || '/tmp/crypto-integration-review/integration';
const KEY = 'personal-gate-pass';
const numeric = text => Number(text.replace(/[^\d.-]/g, ''));
(async () => {
  await fs.mkdir(output, { recursive: true });
  const { createSession } = await import('../gate/games/crypto/session.js');
  const { createPolicy } = await import('./crypto-simulation.mjs');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const contexts = [], errors = [];
  async function open(width = 1280, { route = 'gate/', pass = false, blocked = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 550, hasTouch: width < 550 });
    contexts.push(context); const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-19T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-19T12:00:01Z'));
    await page.addInitScript(({ pass, blocked, key }) => {
      Math.random = () => window.__gateTestDraws?.length ? window.__gateTestDraws.shift() : .999999;
      Object.defineProperty(crypto, 'getRandomValues', { value: array => { array.fill(4); return array; } });
      if (blocked) Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Test storage unavailable', 'SecurityError'); } });
      else if (pass && !sessionStorage.getItem(key)) {
        const issuedAt = Date.now() - 10000;
        sessionStorage.setItem(key, JSON.stringify({ version: 1, issuedAt, expiresAt: issuedAt + 3600000 }));
      }
    }, { pass, blocked, key: KEY });
    await page.goto(new URL(route, base).href);
    await page.locator('#long').waitFor();
    return page;
  }
  const click = (p, selector) => p.viewportSize().width < 550 ? p.locator(selector).tap({ force: true }) : p.locator(selector).click({ force: true });
  const cash = async p => numeric(await p.locator('#cash').textContent());
  const phase = p => p.locator('#game').getAttribute('data-phase');
  async function select(p, name, value) {
    if (p.viewportSize().width < 550) await p.locator(`#mobile-${name}`).selectOption(String(value), { force: true });
    else await click(p, `[data-${name}="${value}"]`);
  }
  async function noOverflow(p) { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), true); }
  async function notifyWake(p) {
    await p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  }
  async function win(p, freeplay = false, blocked = false) {
    await select(p, 'leverage', 5);
    const model = createSession(4), policy = createPolicy('trend', 4);
    for (let step = 0; step <= 300; step++) {
      let state = model.snapshot();
      if (state.account.cashAfterClose >= 50000) {
        if (state.account.position) { model.close(1); await click(p, '#close'); }
        break;
      }
      assert.ok(step < 300, 'The fixed payment fixture must reach its actual target');
      const action = policy(state);
      if (action.close) { model.close(1); await click(p, '#close'); }
      if (action.side && !model.snapshot().account.position) { model.enter(action.side, 1, 5); await click(p, action.side === 1 ? '#long' : '#short'); }
      model.advance(2000); await p.clock.runFor(2000);
    }
    const amount = await cash(p), button = freeplay ? '#pay' : '#enter';
    assert.ok(amount >= 50000); assert.equal(await p.locator(button).isEnabled(), true);
    const originalPass = blocked ? null : await p.evaluate(key => sessionStorage.getItem(key), KEY);
    if (!freeplay && !blocked) {
      assert.equal(originalPass, null);
      await p.evaluate(() => new MutationObserver(() => {
        if (document.querySelector('#game').dataset.phase === 'paid') sessionStorage.setItem('crypto-integration-final-cash', document.querySelector('#cash').textContent);
      }).observe(document.querySelector('#game'), { attributes: true, attributeFilter: ['data-phase'] }));
      await p.route('**/personal/', route => route.fulfill({ contentType: 'text/html', body: 'Personal reached' }));
    }
    await click(p, button);
    if (blocked) {
      assert.equal(await cash(p), amount); assert.equal(await phase(p), 'trading');
      assert.equal(await p.locator('#entry-error').isVisible(), true);
    } else if (freeplay) {
      assert.equal(await phase(p), 'paid'); assert.ok(Math.abs(await cash(p) - (amount - 50000)) < .02);
      assert.equal(await p.evaluate(key => sessionStorage.getItem(key), KEY), originalPass);
      assert.equal(new URL(p.url()).pathname, '/play/');
      await click(p, '#restart'); assert.equal(await cash(p), 10000);
      assert.equal(await p.evaluate(key => sessionStorage.getItem(key), KEY), originalPass);
    } else {
      await p.waitForURL(new URL('personal/', base).href);
      const pass = JSON.parse(await p.evaluate(key => sessionStorage.getItem(key), KEY));
      assert.equal(pass.expiresAt - pass.issuedAt, 3600000);
      assert.ok(Math.abs(numeric(await p.evaluate(() => sessionStorage.getItem('crypto-integration-final-cash'))) - (amount - 50000)) < .02);
    }
  }
  try {
    for (const width of [320, 390, 1280]) {
      const p = await open(width), expected = createSession(4);
      assert.equal(await p.locator('#game').getAttribute('data-game'), 'crypto');
      assert.equal(await p.locator('#enter').textContent(), 'Pay $50,000');
      assert.equal(await p.locator('#pay').isVisible(), false);
      assert.equal(await p.locator('#mobile-leverage').inputValue(), '1');
      await select(p, 'allocation', .5);
      const start = await p.evaluate(() => Date.now());
      await p.clock.setSystemTime(new Date(start + 5000)); await click(p, '#short');
      expected.advance(5000); expected.enter(-1, .5, 1);
      assert.equal(await cash(p), 5000);
      assert.equal(await p.locator('#position-name').textContent(), 'Short · 1×');
      assert.ok(Math.abs(numeric(await p.locator('#position-size').textContent()) - expected.snapshot().account.position.quantity) < .001);
      await select(p, 'allocation', .25);
      await p.clock.setSystemTime(new Date(start + 9000)); await click(p, '#close');
      expected.advance(4000); expected.close(.25);
      assert.ok(Math.abs(await cash(p) - expected.snapshot().account.cash) < .01);
      assert.ok(Math.abs(numeric(await p.locator('#position-size').textContent()) - expected.snapshot().account.position.quantity) < .001);
      await p.clock.runFor(64); await noOverflow(p);
      await p.screenshot({ path: `${output}/gate-${width}.png`, fullPage: true });
      await p.context().close();
    }
    console.log('PASS gate 320/390/1280px: one Pay button, default1x, delayed Short/partial Close fill current quote, no overflow');

    const queued = await open(390);
    await select(queued, 'allocation', .25);
    const start = await queued.evaluate(() => Date.now());
    await queued.clock.setSystemTime(new Date(start + 3600000));
    await queued.evaluate(() => { for (let i = 0; i < 3; i++) document.querySelector('#long').click(); });
    assert.equal(await phase(queued), 'catching-up'); assert.equal(await cash(queued), 10000);
    await notifyWake(queued); await queued.clock.runFor(500);
    assert.equal(await cash(queued), 4218.75);
    await notifyWake(queued); await notifyWake(queued); await queued.clock.runFor(64);
    assert.equal(await cash(queued), 4218.75);
    await resetToGame(queued, 'dial'); await resetToGame(queued, 'crypto');
    await select(queued, 'allocation', .5);
    const second = await queued.evaluate(() => Date.now());
    await queued.clock.setSystemTime(new Date(second + 3600000)); await click(queued, '#long');
    assert.equal(await phase(queued), 'catching-up');
    await resetToGame(queued, 'dial'); await queued.clock.runFor(500);
    assert.equal(await queued.locator('#game').getAttribute('class'), '');
    assert.equal(await queued.locator('#enter').textContent(), 'Enter');
    await resetToGame(queued, 'crypto'); assert.equal(await cash(queued), 10000);
    assert.equal(await queued.locator('#position-name').textContent(), 'Flat');
    await queued.context().close();
    console.log('PASS FIFO clicks during multi-chunk catch-up, duplicate wakeups, current-game exclusion and switching cancels queued orders');

    for (const action of ['close', 'long']) {
      const p = await open(390, { route: 'gate/games/crypto/?seed=11' });
      await select(p, 'leverage', 20); await select(p, 'allocation', .5); await click(p, '#long');
      const start = await p.evaluate(() => Date.now());
      await p.clock.setSystemTime(new Date(start + 30000)); await click(p, `#${action}`);
      assert.equal(await cash(p), 5000); assert.equal(await p.locator('#position-name').textContent(), 'Flat');
      assert.match(await p.locator('#status').textContent(), /Liquidated/);
      await p.context().close();
    }
    const navigation = await open(390, { route: 'gate/games/crypto/?seed=4' });
    const navStart = await navigation.evaluate(() => Date.now());
    await navigation.clock.setSystemTime(new Date(navStart + 3600000)); await click(navigation, '#long');
    await navigation.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await navigation.clock.runFor(500); await notifyWake(navigation); await navigation.clock.runFor(500);
    assert.equal(await cash(navigation), 10000); assert.equal(await navigation.locator('#position-name').textContent(), 'Flat');
    await navigation.context().close();
    console.log('PASS delayed Close/add after liquidation stay invalid, and pagehide/bfcache cancels queued actions');

    const winner = await open(); await win(winner); await winner.context().close();
    const denied = await open(390, { blocked: true }); await win(denied, false, true); await denied.context().close();
    const free = await open(390, { route: 'play/?game=crypto', pass: true }); await win(free, true);
    const pass = await free.evaluate(key => sessionStorage.getItem(key), KEY);
    const freeStart = await free.evaluate(() => Date.now());
    await free.clock.setSystemTime(new Date(freeStart + 1800000)); await click(free, '#long');
    await click(free, '#all-games'); await free.clock.runFor(500);
    assert.equal(await free.locator('[data-select-game]').count(), 8);
    assert.equal(await free.locator('#game').evaluate(root => root.childElementCount), 0);
    assert.equal(await free.evaluate(key => sessionStorage.getItem(key), KEY), pass);
    await noOverflow(free); await free.screenshot({ path: `${output}/gallery-390.png`, fullPage: true });
    await free.locator('[data-select-game="crypto"]').tap();
    assert.equal(await cash(free), 10000); await noOverflow(free);
    await free.screenshot({ path: `${output}/freeplay-390.png`, fullPage: true });
    await free.context().close();
    console.log('PASS actual gate payment/deduction/pass/navigation and storage failure; freeplay payment/restart/switch never renews pass');
    assert.deepEqual(errors, []);
  } finally { await Promise.all(contexts.map(c => c.close().catch(() => {}))); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
