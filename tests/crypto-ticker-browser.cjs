// SITE_URL=http://127.0.0.1:8765 node tests/crypto-ticker-browser.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { resetToGame } = require('./browser-selection.cjs');
const base = (process.env.SITE_URL || 'http://127.0.0.1:8765').replace(/\/?$/, '/');

(async () => {
  const { createSession } = await import('../gate/games/crypto/session.js');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const errors = [];
  async function labels(page, ticker, positioned = false) {
    assert.match(ticker, /^[A-Z]{4}$/);
    assert.equal(await page.locator('#ticker').textContent(), ticker);
    assert.deepEqual(await page.locator('#ticker').evaluate(node => {
      const style = getComputedStyle(node);
      return [style.fontSize, style.fontWeight];
    }), ['14px', '600'], 'Preserve the original ticker typography');
    assert.equal(await page.locator('#chart title').textContent(), `Fictional ${ticker} / USD candlestick chart`);
    assert.ok((await page.locator('#chart').getAttribute('aria-label')).startsWith(`${ticker} / USD,`));
    if (positioned) {
      assert.ok((await page.locator('#position-size').textContent()).endsWith(` ${ticker}`));
      assert.ok((await page.locator('#order-hint').textContent()).includes(` ${ticker} ·`));
    }
  }
  try {
    for (const route of ['gate/games/crypto/?seed=4', 'gate/', 'play/?game=crypto']) {
      for (const width of [320, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.install({ time: new Date('2026-10-29T12:00:00Z') });
        await page.clock.pauseAt(new Date('2026-10-29T12:00:01Z'));
        await page.addInitScript(() => {
          window.tickerProbe = { draws: 0, byte: 4, mutations: [] };
          Math.random = () => window.__gateTestDraws?.length ? window.__gateTestDraws.shift() : .999999;
          Object.defineProperty(crypto, 'getRandomValues', { value: array => {
            if (array instanceof Uint8Array) { tickerProbe.draws++; array.fill(tickerProbe.byte); }
            else array.fill(4);
            return array;
          } });
          const issuedAt = Date.now();
          sessionStorage.setItem('personal-gate-pass', JSON.stringify({ version: 1, issuedAt, expiresAt: issuedAt + 3600000 }));
        });
        await page.goto(new URL(route, base).href);
        await page.locator('#ticker').waitFor();
        const initial = await page.locator('#ticker').textContent();
        assert.equal(initial, 'EEEE');
        assert.equal(await page.evaluate(() => tickerProbe.draws), 1);
        await labels(page, initial);
        const model = createSession(4);
        assert.equal(await page.locator('#quote').textContent(), `$${model.snapshot().market.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        // Observe every heading mutation, including transient writes between paints.
        await page.evaluate(() => {
          new MutationObserver(() => tickerProbe.mutations.push(document.querySelector('#ticker').textContent))
            .observe(document.querySelector('#ticker'), { childList: true, characterData: true, subtree: true });
        });
        await page.locator('#long').click({ force: true });
        model.enter(1, 1, 1);
        await labels(page, initial, true);
        await page.clock.runFor(2100);
        model.advance(2100);
        await labels(page, initial, true);
        assert.equal(await page.locator('#quote').textContent(), `$${model.snapshot().market.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        const quantity = Number((await page.locator('#position-size').textContent()).split(' ')[0]);
        assert.ok(Math.abs(quantity - model.snapshot().account.position.quantity) < .001);
        await page.locator('#mobile-allocation').selectOption('0.5', { force: true });
        await page.locator('#close').click({ force: true });
        await labels(page, initial, true);
        await page.setViewportSize({ width: width === 320 ? 390 : 700, height: 1000 });
        await page.clock.runFor(64);
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now()) + 1800000));
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, value: false });
          document.dispatchEvent(new Event('visibilitychange'));
          window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        });
        await page.clock.runFor(500);
        await labels(page, initial);
        assert.equal(await page.evaluate(() => tickerProbe.draws), 1, 'Ticks, trades, resize and catch-up never draw a ticker');
        assert.deepEqual(await page.evaluate(() => tickerProbe.mutations), [], 'The ticker node never changes during a run');

        async function restart() {
          if (route === 'gate/') { await resetToGame(page, 'dial'); await resetToGame(page, 'crypto'); }
          else await page.locator('#restart').click({ force: true });
        }
        await restart();
        await labels(page, 'EEEF'); // Same entropy must not repeat, including recreated freeplay adapters.
        assert.equal(await page.evaluate(() => tickerProbe.draws), 2);
        await page.evaluate(() => { tickerProbe.byte = 25; });
        await restart(); await labels(page, 'ZZZZ');
        await restart(); await labels(page, 'ZZZA'); // Collision fallback wraps to A.
        assert.equal(await page.evaluate(() => tickerProbe.draws), 4);
        const name = route === 'gate/' ? 'gate' : route.startsWith('play/') ? 'freeplay' : 'standalone';
        await page.screenshot({ path: `/tmp/crypto-ticker-${name}-${width}.png`, fullPage: true });
        await page.context().close();
        console.log(`PASS ${route} ${width}px: consistent run labels, stable through trades/ticks/resize/catch-up, seeded path unchanged, no duplicate on restart`);
      }
    }
    // Real paints exercise the visible heading and both accessible chart labels.
    const live = await browser.newPage();
    live.on('pageerror', error => errors.push(error.message));
    await live.goto(new URL('gate/games/crypto/?seed=4', base).href);
    await live.locator('#ticker').waitFor();
    const ticker = await live.locator('#ticker').textContent();
    const frames = await live.evaluate(async () => {
      const expected = document.querySelector('#ticker').textContent;
      let frames = 0, invalid = 0;
      const until = performance.now() + 1500;
      await new Promise(resolve => {
        function sample() {
          frames++;
          if (document.querySelector('#ticker').textContent !== expected ||
              document.querySelector('#chart title').textContent !== `Fictional ${expected} / USD candlestick chart` ||
              !document.querySelector('#chart').getAttribute('aria-label').startsWith(`${expected} / USD,`)) invalid++;
          if (performance.now() < until) requestAnimationFrame(sample); else resolve();
        }
        requestAnimationFrame(sample);
      });
      return { frames, invalid };
    });
    assert.ok(frames.frames > 0); assert.equal(frames.invalid, 0);
    await labels(live, ticker);
    await live.screenshot({ path: '/tmp/crypto-ticker-standalone.png', fullPage: true });
    console.log('PASS real-timer ticker frame sampling:', frames);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
