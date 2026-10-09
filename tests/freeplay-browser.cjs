// Run against a served checkout or deployed site:
// SITE_URL=https://example.test/ CHROMIUM=/usr/bin/chromium node tests/freeplay-browser.cjs
// This is a browser suite, not a physical-device or authentication/security test.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const base = (process.env.SITE_URL || 'http://127.0.0.1:8765').replace(/\/?$/, '/');
const url = path => new URL(path, base).href;
const KEY = 'personal-gate-pass', TTL = 3600000;
const ids = ['dial', 'cannon', 'slots', 'soda', 'cube', 'cube2', 'gomoku'];
const selectors = { dial:'#dial', cannon:'#fire', slots:'#lever', soda:'#soda', cube:'#cube', cube2:'#cube', gomoku:'.gomoku-board' };
const gateOnlyHelp = /activat(?:e|ing) Enter|Enter to (?:unlock|enter)|before (?:entering|entry)|unlock (?:the|your) personal|개인 공간.*입장/iu;

(async () => {
  const browser = await chromium.launch({ executablePath:process.env.CHROMIUM || '/usr/bin/chromium', headless:true, args:['--no-sandbox'] });
  const errors = [], contexts = [];
  async function open({ width=1200, touch=false, clock=false, storageBlocked=false } = {}) {
    const context = await browser.newContext({ viewport:{ width, height:900 }, hasTouch:touch, isMobile:touch });
    contexts.push(context);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
    await page.addInitScript(() => {
      // Predictable challenges/outcomes, without replacing any app controller or state.
      Math.random = () => 0;
      window.freeplayWorkerEvents = [];
      const Original = window.Worker;
      window.Worker = class extends Original {
        constructor(...args) { super(...args); this.testStopped = false; window.freeplayWorkerEvents.push('start'); }
        terminate() {
          if (!this.testStopped) { this.testStopped = true; window.freeplayWorkerEvents.push('stop'); }
          return super.terminate();
        }
      };
    });
    if (storageBlocked) await page.addInitScript(() => {
      for (const key of ['sessionStorage', 'localStorage']) Object.defineProperty(window, key, {
        configurable:true, get() { throw new DOMException('Disabled for storage test', 'SecurityError'); }
      });
    });
    if (clock) await page.clock.install({ time:new Date('2026-10-09T12:00:00Z') });
    await page.goto(url(''));
    if (!storageBlocked) await page.evaluate(() => localStorage.setItem('academic-language', 'en'));
    return page;
  }
  const raw = page => page.evaluate(key => sessionStorage.getItem(key), KEY);
  async function grant(page) {
    return page.evaluate(({ key, ttl }) => {
      const issuedAt = Date.now() - 10000;
      const record = JSON.stringify({ version:1, issuedAt, expiresAt:issuedAt + ttl });
      sessionStorage.setItem(key, record);
      return record;
    }, { key:KEY, ttl:TTL });
  }
  async function ready(page, id=null) {
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-private-pending'));
    if (id) {
      await page.waitForFunction(id => document.querySelector('#game')?.dataset.game === id, id);
      await page.locator(selectors[id]).waitFor({ state:'visible' });
    } else {
      await page.locator('#selection').waitFor({ state:'visible' });
      assert.equal(await page.locator('#game').evaluate(root => root.childElementCount), 0);
    }
  }
  async function direct(page, id) { await page.goto(url(`play/${id ? `?game=${id}` : ''}`)); await ready(page, id); }
  async function choose(page, id) {
    if (await page.locator('#play-stage').isVisible()) await page.locator('#all-games').click();
    await page.locator(`[data-select-game="${id}"]`).click();
    await ready(page, id);
  }
  async function immutable(page, original, reason) {
    assert.equal(await raw(page), original, `The original pass changed: ${reason}`);
    assert.equal(new URL(page.url()).pathname, new URL(url('play/')).pathname, `Unexpected navigation: ${reason}`);
  }
  async function noGateUI(page) {
    assert.equal(await page.locator('#enter, #entry-error').count(), 0, 'Freeplay must not expose gate entry actions');
    for (const text of await page.locator('#game-help, #instructions, #gomoku-help').allTextContents()) {
      assert.ok(!gateOnlyHelp.test(text), `Gate-only instruction leaked: ${text}`);
    }
  }
  async function noOverflow(page, detail) {
    const sizes = await page.evaluate(() => ({ viewport:innerWidth, html:document.documentElement.scrollWidth, body:document.body.scrollWidth }));
    assert.ok(sizes.html <= sizes.viewport && sizes.body <= sizes.viewport, `${detail}: ${JSON.stringify(sizes)}`);
  }
  const workerEvents = page => page.evaluate(() => window.freeplayWorkerEvents);
  async function noLiveWorkers(page, detail) {
    const events = await workerEvents(page);
    assert.equal(events.filter(x => x === 'start').length, events.filter(x => x === 'stop').length, detail);
  }
  async function waitUntil(predicate, description) {
    const deadline = Date.now() + 15000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(predicate(), `Timed out: ${description}`);
  }
  const humanTurn = page => page.waitForFunction(() => document.querySelector('#game')?.dataset.phase === 'human');
  const idle = page => page.waitForFunction(() => document.querySelector('#game')?.dataset.phase === 'idle');

  try {
    // No private markup flash while the guard/module is delayed, even on a game deep link.
    const missing = await open();
    let heldModule;
    await missing.route('**/play/play.js', route => { heldModule = route; });
    await missing.goto(url('play/?game=gomoku'), { waitUntil:'commit' });
    await waitUntil(() => heldModule, 'protected page module request');
    await missing.locator('#play-main').waitFor({ state:'attached' });
    assert.ok(await missing.locator('#play-main').isHidden());
    assert.equal(await missing.locator('.gomoku-board').count(), 0);
    await heldModule.continue();
    await missing.waitForURL(url('gate/'));
    assert.equal(await raw(missing), null);
    assert.deepEqual(await workerEvents(missing), []);
    await missing.unroute('**/play/play.js');

    const invalid = await open();
    const valid = JSON.parse(await grant(invalid));
    const records = [
      '{broken', 'null', '[]',
      JSON.stringify({ ...valid, version:2 }),
      JSON.stringify({ ...valid, issuedAt:String(valid.issuedAt) }),
      JSON.stringify({ ...valid, expiresAt:valid.expiresAt + 1 }),
      JSON.stringify({ version:1, issuedAt:Date.now() + 60000, expiresAt:Date.now() + 60000 + TTL }),
      JSON.stringify({ version:1, issuedAt:Date.now() - TTL - 60000, expiresAt:Date.now() - 60000 })
    ];
    for (const record of records) {
      await invalid.evaluate(({ key, record }) => sessionStorage.setItem(key, record), { key:KEY, record });
      await invalid.goto(url('play/?game=gomoku'));
      await invalid.waitForURL(url('gate/'));
      assert.equal(await raw(invalid), null);
      assert.equal(await invalid.locator('.gomoku-board').count(), 0);
      assert.deepEqual(await workerEvents(invalid), []);
    }
    const blocked = await open({ storageBlocked:true });
    await blocked.goto(url('play/?game=dial'));
    await blocked.waitForURL(url('gate/'));
    await blocked.waitForTimeout(150);
    assert.equal(blocked.url(), url('gate/'), 'Unavailable storage must not cause a redirect loop');
    console.log('PASS missing/invalid/unavailable passes, protected-content no-flash, no unauthorized Gomoku worker');

    const page = await open(), original = await grant(page);
    await direct(page);
    assert.equal(await page.locator('[data-select-game]').count(), 7);
    assert.deepEqual(await page.locator('[data-select-game]').evaluateAll(links => links.map(link => link.dataset.selectGame)), ids);
    assert.deepEqual(await workerEvents(page), [], 'The chooser must not create an AI worker');
    // A marker survives only same-document selection and history changes.
    await page.evaluate(() => { window.freeplayDocumentMarker = 'same-document'; });
    await choose(page, 'dial');
    await page.locator('#dial').focus();
    await page.keyboard.press('Enter');
    await immutable(page, original, 'dial Enter');
    await page.locator('#restart').click();
    await ready(page, 'dial');
    await immutable(page, original, 'dial restart');
    await choose(page, 'slots');
    await page.goBack(); await ready(page);
    await page.goBack(); await ready(page, 'dial');
    await page.goForward(); await ready(page);
    await page.goForward(); await ready(page, 'slots');
    assert.equal(await page.evaluate(() => window.freeplayDocumentMarker), 'same-document');
    await immutable(page, original, 'back/forward');

    // Inspect each non-Gomoku game in the same document before any Gomoku visit.
    for (const id of ids.filter(id => id !== 'gomoku')) {
      await choose(page, id);
      await noGateUI(page);
      await immutable(page, original, `${id} selection`);
      await page.locator('#restart').click();
      await ready(page, id);
      await immutable(page, original, `${id} restart`);
    }
    assert.deepEqual(await workerEvents(page), []);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
    assert.ok(!resources.some(name => /\/gomoku\/(?:worker\.js|ai\.js|vendor\/)/.test(name)), 'AI payload must remain lazy outside Gomoku');
    await choose(page, 'gomoku'); await humanTurn(page);
    assert.ok((await workerEvents(page)).includes('start'));
    await noLiveWorkers(page, 'The opening worker terminates after delivering its move');
    await immutable(page, original, 'Gomoku opening');
    await choose(page, 'dial'); await noLiveWorkers(page, 'Leaving Gomoku destroys its worker');

    for (const id of ids) {
      await direct(page, id);
      if (id === 'gomoku') await humanTurn(page);
      await noGateUI(page);
      assert.equal(new URL(page.url()).searchParams.get('game'), id);
      await immutable(page, original, `${id} direct route`);
    }
    await page.reload(); await ready(page, 'gomoku'); await humanTurn(page);
    await immutable(page, original, 'refresh');
    for (const suffix of ['?game=not-a-game', '?game=GOMOKU', '?game=', '?game=%3Cscript%3E', '?other=value']) {
      await page.goto(url(`play/${suffix}`)); await ready(page);
      assert.equal(new URL(page.url()).search, '', 'An invalid route falls back to the canonical chooser URL');
      await immutable(page, original, suffix);
    }
    console.log('PASS all seven deep links, canonical invalid-ID fallback, same-document switch/history, lazy workers, no entry action, immutable pass');

    // User-visible wins in the real page: reels, empty-target soda, and both cubes.
    await choose(page, 'slots'); await page.locator('#lever').click();
    await page.waitForFunction(() => document.querySelector('#state').textContent === 'Nicely done.');
    await immutable(page, original, 'real slot win');
    await page.locator('#lever').click();
    await page.waitForFunction(() => document.querySelector('#state').textContent === 'Nicely done.');
    await immutable(page, original, 'repeat slot win');
    await choose(page, 'soda');
    assert.equal(await page.locator('#state').innerText(), 'Nicely done.');
    await immutable(page, original, 'real soda target-zero outcome');
    for (const id of ['cube', 'cube2']) {
      await choose(page, id);
      const keys = await page.evaluate(async id => {
        const { scramble } = await import('../gate/common/cube-engine.js');
        return scramble(() => 0, id === 'cube2' ? 15 : 25, id === 'cube2' ? 2 : 3).moves.reverse()
          .map(move => move.inverse ? move.face.toLowerCase() : `Shift+${move.face}`);
      }, id);
      await page.locator('#cube').focus();
      for (const key of keys) { await page.keyboard.press(key); await idle(page); }
      await page.waitForFunction(() => document.querySelector('#state').textContent === 'Cube solved.');
      await immutable(page, original, `${id} solved entirely by keyboard moves`);
      await page.keyboard.press('Enter'); await immutable(page, original, `${id} Enter after solve`);
      await page.locator('#restart').click(); await ready(page, id);
      assert.equal(await page.locator('#state').innerText(), '');
      await immutable(page, original, `${id} restart after win`);
    }

    // Isolated controller integrations cover all seven genuine adapter outcomes.
    // These are real adapters/getState/rules, with injected challenge/time/AI inputs.
    // No production global, active app instance, or adapter state is overwritten.
    await page.locator('#all-games').click(); await ready(page);
    const adapterResults = await page.evaluate(async ({ key }) => {
      const [{ createRegistry }, { createFreeplayController }, { canEnter }, { readPass }, { solvedCube }, { trajectory, landingCode }, { createGomokuGame }] = await Promise.all([
        import('../gate/registry.js'), import('./controller.js'), import('../gate/common/engine.js'),
        import('../gate/common/session-pass.js'), import('../gate/common/cube-engine.js'),
        import('../gate/games/cannon/physics.js'), import('../gate/games/gomoku/game.js')
      ]);
      const pass = sessionStorage.getItem(key), results = [];
      const frame = () => new Promise(requestAnimationFrame);
      for (const original of createRegistry(() => 0)) {
        let time = 0, latest = null, definition = null, challenge = null;
        const host = document.createElement('div'); host.dataset.gameInputScope = ''; document.body.append(host);
        const aiMoves = [30, 32, 34, 36];
        const game = { ...original,
          next:() => original.id === 'dial' ? { target:42, start:42 }
            : original.cube ? { target:1, stickers:solvedCube(original.id === 'cube2' ? 2 : 3) }
            : original.id === 'cannon' ? { target:landingCode(trajectory(45, .5).distance) }
            : original.id === 'slots' ? { target:777 } : { target:0 },
          create:(root, changed, enter) => original.id === 'gomoku'
            ? createGomokuGame(root, changed, enter, { humanFirst:true, random:() => 0, engine:{ findMove:async () => aiMoves.shift(), cancel() {}, destroy() {} } })
            : original.create(root, changed, enter, () => time, () => 0)
        };
        const controller = createFreeplayController({ registry:[game], root:host, allowed:() => readPass().status === 'valid',
          selected:(game, next) => { definition = game; challenge = next; }, changed:state => { latest = state; } });
        try {
          if (!controller.select(game.id)) throw Error(`Cannot select ${game.id}`);
          if (game.id === 'slots') { host.querySelector('#lever').click(); time = 3000; }
          if (game.id === 'cannon') {
            time = 250; host.querySelector('#fire').dispatchEvent(new KeyboardEvent('keydown', { key:' ', code:'Space' }));
            time = 500; window.dispatchEvent(new KeyboardEvent('keyup', { key:' ', code:'Space' })); time = 5000;
          }
          if (game.id === 'gomoku') for (const index of [0, 1, 2, 3, 4]) {
            host.querySelector(`[data-index="${index}"]`).click();
            const deadline = performance.now() + 2000;
            while (!latest?.stopped && performance.now() < deadline) await frame();
            if (!latest?.stopped) throw Error('Fixture AI response did not settle');
          }
          await frame();
          results.push({ id:game.id, won:canEnter(challenge.target, latest, definition.rules), passUnchanged:sessionStorage.getItem(key) === pass });
          controller.restart();
          if (sessionStorage.getItem(key) !== pass) throw Error(`${game.id} restarted with a renewed pass`);
        } finally { controller.close(); host.remove(); }
      }
      return results;
    }, { key:KEY });
    assert.deepEqual(adapterResults.map(result => result.id), ids);
    for (const result of adapterResults) { assert.ok(result.won, `${result.id} must reach a real adapter win`); assert.ok(result.passUnchanged, result.id); }
    await immutable(page, original, 'all adapter win/restart integrations');
    console.log('PASS real slot/soda and keyboard cube wins, seven adapter win/restart outcomes, no pass issuance or renewal');

    // Delay the real module Worker, switch away mid-think, then release stale work.
    const cancel = await open(), cancelPass = await grant(cancel); await direct(cancel);
    const heldWorkers = [];
    await cancel.route('**/gomoku/worker.js', route => { heldWorkers.push(route); });
    await choose(cancel, 'gomoku');
    await cancel.waitForFunction(() => document.querySelector('#game').dataset.phase === 'thinking');
    await waitUntil(() => heldWorkers.length > 0, 'held Gomoku worker request');
    await choose(cancel, 'soda');
    await noLiveWorkers(cancel, 'Switching while thinking terminates the worker');
    await heldWorkers.shift().continue().catch(() => {});
    await cancel.waitForTimeout(700);
    assert.equal(await cancel.locator('#game').getAttribute('data-game'), 'soda');
    assert.equal(await cancel.locator('.gomoku-board').count(), 0);
    await immutable(cancel, cancelPass, 'late worker after switch');
    await cancel.unroute('**/gomoku/worker.js');
    await choose(cancel, 'gomoku'); await humanTurn(cancel);
    await cancel.route('**/gomoku/worker.js', route => { heldWorkers.push(route); });
    await cancel.locator('.gomoku-cell[data-stone="0"]').first().click();
    await waitUntil(() => heldWorkers.length > 0, 'held Gomoku worker request');
    await cancel.locator('#restart').click();
    await waitUntil(() => heldWorkers.length >= 2, 'replacement Gomoku worker request');
    assert.equal(await cancel.locator('.gomoku-cell[data-stone="1"]').count(), 0);
    await heldWorkers.shift().continue().catch(() => {});
    await heldWorkers.shift().continue();
    await humanTurn(cancel);
    assert.equal(await cancel.locator('.gomoku-cell[data-stone="1"]').count(), 0, 'Restart must not restore the old human move');
    assert.equal(await cancel.locator('.gomoku-cell[data-stone="2"]').count(), 1, 'Restart gets only its own opening move');
    await noLiveWorkers(cancel, 'Old and replacement workers finish/terminate once');
    await immutable(cancel, cancelPass, 'mid-think restart');
    await cancel.unroute('**/gomoku/worker.js');
    console.log('PASS real worker cancellation on switch/restart, no late state revival');

    // Touch-capable Chromium exercises real pointer events at both phone widths.
    for (const width of [320, 390, 1200]) {
      const touch = width < 1200, responsive = await open({ width, touch });
      const responsivePass = await grant(responsive); await direct(responsive);
      const cdp = touch ? await responsive.context().newCDPSession(responsive) : null;
      async function gesture(selector, start, end, hold=0, cancelTouch=false) {
        const element = responsive.locator(selector); await element.scrollIntoViewIfNeeded();
        const box = await element.boundingBox(); assert.ok(box);
        const point = values => ({ x:box.x + box.width * values[0], y:box.y + box.height * values[1] });
        const a = point(start), b = point(end || start);
        if (touch) {
          const dispatch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints:p ? [{ ...p, id:1 }] : [] });
          await dispatch('touchStart', a); if (hold) await responsive.waitForTimeout(hold);
          if (end) await dispatch('touchMove', b);
          await dispatch(cancelTouch ? 'touchCancel' : 'touchEnd');
        } else {
          await responsive.mouse.move(a.x, a.y); await responsive.mouse.down();
          if (hold) await responsive.waitForTimeout(hold);
          if (end) await responsive.mouse.move(b.x, b.y, { steps:5 });
          await responsive.mouse.up();
        }
      }
      await noOverflow(responsive, `${width}px chooser`);
      for (const id of ids) {
        await choose(responsive, id); if (id === 'gomoku') await humanTurn(responsive);
        await noOverflow(responsive, `${width}px ${id}`); await noGateUI(responsive);
        if (id === 'dial') {
          const before = await responsive.locator('#dial').getAttribute('aria-valuenow');
          await gesture('[data-direction="1"]', [.5, .5], null, 250);
          assert.notEqual(await responsive.locator('#dial').getAttribute('aria-valuenow'), before);
        } else if (id === 'cannon') {
          await gesture('#fire', [.5, .5], null, 250);
          await responsive.waitForFunction(() => document.querySelector('#distance').textContent !== '—');
        } else if (id === 'slots') {
          await (touch ? responsive.locator('#lever').tap() : responsive.locator('#lever').click());
          await responsive.waitForFunction(() => document.querySelector('#state').textContent === 'Nicely done.');
        } else if (id === 'soda') {
          await gesture('#soda', [105 / 420, 165 / 440], [230 / 420, 165 / 440]);
          await (touch ? responsive.locator('#empty-cup').tap() : responsive.locator('#empty-cup').click());
          assert.match(await responsive.locator('#volume').innerText(), /^0\.0/);
        } else if (id === 'cube' || id === 'cube2') {
          const before = await responsive.locator('#cube-accessible').textContent();
          await gesture('#cube', [.5, .5], [.5, .75]); await idle(responsive);
          assert.notEqual(await responsive.locator('#cube-accessible').textContent(), before, `${width}px ${id} pointer turn`);
        } else {
          const cell = responsive.locator('.gomoku-cell[data-stone="0"]').first();
          await (touch ? cell.tap() : cell.click()); await humanTurn(responsive);
          assert.equal(await responsive.locator('.gomoku-cell[data-stone="1"]').count(), 1);
        }
        await noOverflow(responsive, `${width}px ${id} after interaction`);
        await immutable(responsive, responsivePass, `${width}px ${id} interaction`);
        await responsive.locator('[data-lang="ko"]').click();
        assert.equal(await responsive.locator('html').getAttribute('lang'), 'ko');
        assert.equal(await responsive.locator('#restart').innerText(), '다시 시작');
        assert.equal(await responsive.locator('[data-lang="ko"]').getAttribute('aria-pressed'), 'true');
        assert.match(await responsive.locator('#game-help').innerText(), /[가-힣]/);
        await noOverflow(responsive, `${width}px ${id} Korean`);
        await responsive.locator('[data-lang="en"]').click();
        assert.equal(await responsive.locator('html').getAttribute('lang'), 'en');
        assert.equal(await responsive.locator('#restart').innerText(), 'Start again');
      }
      await responsive.locator('#all-games').click();
      await responsive.locator('[data-lang="ko"]').click();
      assert.equal(await responsive.locator('#hub-title').innerText(), '골라서 놀아요.');
      await responsive.reload(); await ready(responsive);
      assert.equal(await responsive.locator('html').getAttribute('lang'), 'ko', 'Language persists across refresh');
      await immutable(responsive, responsivePass, `${width}px language toggle/refresh`);
      await responsive.context().close();
    }
    console.log('PASS 320/390/1200px chooser and seven games, pointer/touch interactions, EN/KO shell/help and persistence, no horizontal overflow');

    const expiry = await open({ clock:true }), expiringPass = await grant(expiry);
    await direct(expiry, 'soda');
    const expiresAt = JSON.parse(expiringPass).expiresAt;
    // Freeze near expiry so real command latency cannot consume the last millisecond.
    await expiry.clock.pauseAt(new Date(expiresAt - 1000));
    await expiry.clock.runFor(999);
    await immutable(expiry, expiringPass, 'one millisecond before fixed expiry');
    await expiry.clock.runFor(2); await expiry.waitForURL(url('gate/'));
    assert.equal(await raw(expiry), null);
    assert.equal(await expiry.locator('#play-stage').count(), 0);

    for (const mode of ['pagehide', 'visibilitychange']) {
      const lifecycle = await open({ clock:true }), record = await grant(lifecycle); await direct(lifecycle);
      const pending = [];
      await lifecycle.route('**/gomoku/worker.js', route => { pending.push(route); });
      await choose(lifecycle, 'gomoku');
      await waitUntil(() => pending.length > 0, `${mode} held Gomoku worker request`);
      await lifecycle.evaluate(mode => {
        if (mode === 'pagehide') window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted:true }));
        else { Object.defineProperty(document, 'hidden', { configurable:true, value:true }); document.dispatchEvent(new Event('visibilitychange')); }
      }, mode);
      assert.ok(await lifecycle.locator('#play-main').isHidden());
      await noLiveWorkers(lifecycle, `${mode} cancels the outstanding worker`);
      if (mode === 'pagehide') assert.equal(await lifecycle.locator('#game').evaluate(root => root.childElementCount), 0);
      await lifecycle.clock.setSystemTime(JSON.parse(record).expiresAt + 1);
      await lifecycle.evaluate(mode => {
        if (mode === 'pagehide') window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted:true }));
        else { Object.defineProperty(document, 'hidden', { configurable:true, value:false }); document.dispatchEvent(new Event('visibilitychange')); }
      }, mode);
      await lifecycle.waitForURL(url('gate/'));
      for (const route of pending) await route.continue().catch(() => {});
      await lifecycle.clock.fastForward(1000);
      assert.equal(await raw(lifecycle), null);
      assert.equal(await lifecycle.locator('.gomoku-board, #play-stage').count(), 0);
    }
    // Real history restoration must recheck, regardless of whether Chromium uses bfcache.
    const history = await open({ clock:true }), historyPass = await grant(history); await direct(history, 'soda');
    await history.goto(url(''));
    await history.clock.setSystemTime(JSON.parse(historyPass).expiresAt + 1);
    await history.goBack(); await history.waitForURL(url('gate/'));
    assert.equal(await raw(history), null);
    assert.equal(await history.locator('#play-stage').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS fixed expiry timer, hidden-tab/pageshow/history revalidation, cancellation and no expired-game revival; zero page errors');
  } finally {
    await Promise.all(contexts.map(context => context.close().catch(() => {})));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
