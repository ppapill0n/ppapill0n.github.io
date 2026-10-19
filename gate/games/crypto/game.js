import { CONFIG } from './config.js';
import { createSession } from './session.js';
import { drawChart } from './chart.js';
import { createWallClock, createReconciler } from './live-clock.js';

const money = value => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const signedMoney = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;
const priceText = price => price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export function createCryptoGame(root, changed = () => {}, tryEnter = () => {}) {
  root.innerHTML = `
    <section class="balance" aria-label="Account summary">
      <div><span class="label">Total equity</span><strong id="equity">$10,000.00</strong></div>
      <div class="goal"><span class="label">The way in</span><strong>$50,000</strong><span id="progress-label">20% of goal</span></div>
    </section>
    <progress id="goal-progress" max="50000" value="10000" aria-label="Equity toward $50,000 goal"></progress>
    <section class="market" aria-label="Fictional market">
      <div class="market-heading"><div><strong>MOTH <span>/ USD</span></strong><span class="market-meta">2s candles · <span id="market-state">live</span></span></div><div class="quote"><strong id="quote"></strong><span id="price-change"></span></div></div>
      <div class="chart-wrap"><svg id="chart" role="img"></svg><div id="catchup-layer" hidden><strong id="catchup-title">Catching up</strong><span id="catchup-help">The market kept moving while you were away.</span><button id="retry" type="button" hidden>Try again</button></div></div>
      <div class="chart-footer"><span><span class="live-dot" aria-hidden="true"></span><span id="elapsed">0:00</span> market time</span><span>Always live</span></div>
    </section>
    <section class="position" aria-label="Position details">
      <div class="position-heading"><strong id="position-name">No open position</strong><span id="position-size">Ready when you are</span></div>
      <div class="account-stats"><div><span class="label">Available cash</span><strong id="cash"></strong></div><div><span class="label">Position P&amp;L</span><strong id="pnl">—</strong></div><div><span class="label">Entry / liquidation</span><strong id="levels">— / —</strong></div></div>
    </section>
    <section class="controls" aria-label="Trading controls">
      <div class="selectors"><fieldset><legend>Leverage <span id="leverage-note">· more risk, more reward</span></legend><div class="segments" id="leverage">${CONFIG.leverage.map(n => `<button type="button" data-leverage="${n}" aria-pressed="${n === 5}">${n}×</button>`).join('')}</div></fieldset><fieldset><legend>Order size <span>· cash in / position out</span></legend><div class="segments" id="allocation">${CONFIG.allocations.map(n => `<button type="button" data-allocation="${n}" aria-pressed="${n === 1}">${n * 100}%</button>`).join('')}</div></fieldset></div>
      <div class="mobile-selectors"><label>Leverage <select id="mobile-leverage">${CONFIG.leverage.map(n => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n}×</option>`).join('')}</select></label><label>Order size <select id="mobile-allocation">${CONFIG.allocations.map(n => `<option value="${n}" ${n === 1 ? 'selected' : ''}>${n * 100}%</option>`).join('')}</select></label></div>
      <div class="trade-buttons"><button id="long" type="button">Long</button><button id="short" type="button">Short</button><button id="close" type="button" disabled>Close</button></div>
      <p id="order-hint"></p>
      <p id="status" role="status" aria-live="polite">Follow the candles. Long gains on rises; Short gains on falls.</p>
      <button id="pay" type="button" disabled>Pay $50,000 <span aria-hidden="true">→</span></button>
      <p id="pay-help">Close your position and hold $50,000 cash to enter.</p>
    </section>
    <details class="rules"><summary>How to play</summary><div><p>Read the candles and choose Long for a rise or Short for a fall. Close takes the selected percentage out of your position. To switch direction, close it all first.</p><p>Leverage multiplies both gains and losses. It stays locked while you hold. Order size uses available cash for an entry (including its fee), or position quantity for a close. Same-direction entries add at a weighted average price.</p><p>Each entry and close costs 0.05% of its value. P&amp;L excludes the closing fee; equity includes your remaining collateral. At the liquidation line that collateral runs out after exit costs. Cash outside the position is safe, and you can never owe money.</p><p>Pay $50,000 spends fictional cash and opens the personal page. Aim for a 2–4 minute successful run; this is a difficult prototype, with no guaranteed win or time limit.</p><p>The market keeps moving when you switch tabs or your device sleeps. You can be liquidated while away. On return, trading waits for every missed tick to be processed and the current price to appear. There is no pause.</p><p>Restart or reload creates a fresh account with $10,000. The chart uses its own seeded random path and never reacts to your trades. Moving the system clock forward counts as elapsed time; moving it backward never rewinds the market.</p><p class="seed">Run seed: <span id="seed"></span></p></div></details>`;
  const el = id => root.querySelector(`#${id}`);
  const events = new AbortController();
  const listen = (target, type, callback) => target.addEventListener(type, callback, { signal: events.signal });
  let session, reconciler, state, leverage = CONFIG.defaultLeverage, allocation = 1, catching = false, destroyed = false;
  let timer = 0, frame = 0, generation = 0, notified = '', priorLiquidations = 0;
  let status = 'Follow the candles. Long gains on rises; Short gains on falls.';
  function message(text) { status = text; el('status').textContent = text; }
  function getState() {
    const a = state?.account;
    return { value: a?.canPay || a?.paid ? CONFIG.target : 0, stopped: !!a && !a.position, outcome: a?.paid ? 'paid' : a?.bankrupt ? 'bankrupt' : 'trading' };
  }
  function render() {
    if (!session || destroyed) return;
    state = session.snapshot();
    const { account: a, market: m } = state, p = a.position;
    el('equity').textContent = money(a.equity);
    el('cash').textContent = money(a.cash);
    el('pnl').textContent = p ? signedMoney(a.unrealized) : '—';
    el('pnl').className = p ? a.unrealized < 0 ? 'negative' : 'positive' : '';
    el('goal-progress').value = Math.min(CONFIG.target, a.equity);
    el('progress-label').textContent = `${Math.floor(a.equity / CONFIG.target * 100)}% of goal`;
    el('quote').textContent = `$${priceText(m.price)}`;
    const latest = m.candle || m.candles.at(-1), change = (m.price / latest.open - 1) * 100;
    el('price-change').textContent = `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(2)}% this candle`;
    el('price-change').className = change < 0 ? 'negative' : 'positive';
    el('elapsed').textContent = `${Math.floor(state.elapsed / 60000)}:${String(Math.floor(state.elapsed / 1000) % 60).padStart(2, '0')}`;
    el('position-name').textContent = p ? `${p.side === 1 ? 'Long' : 'Short'} · ${p.leverage}×` : 'No open position';
    el('position-size').textContent = p ? `${p.quantity.toFixed(3)} MOTH` : 'Ready when you are';
    el('levels').textContent = p ? `$${priceText(p.entry)} / ${a.liquidationPrice > 0 ? `$${priceText(a.liquidationPrice)}` : 'none'}` : '— / —';
    el('leverage-note').textContent = p ? '· locked while holding' : '· more risk, more reward';
    const stopped = catching || document.hidden || a.bankrupt || a.paid;
    for (const button of root.querySelectorAll('[data-leverage]')) {
      button.disabled = !!p || stopped;
      button.setAttribute('aria-pressed', String(Number(button.dataset.leverage) === leverage));
    }
    for (const button of root.querySelectorAll('[data-allocation]')) {
      button.disabled = stopped;
      button.setAttribute('aria-pressed', String(Number(button.dataset.allocation) === allocation));
    }
    el('mobile-leverage').value = String(leverage);
    el('mobile-leverage').disabled = !!p || stopped;
    el('mobile-allocation').value = String(allocation);
    el('mobile-allocation').disabled = stopped;
    el('long').disabled = stopped || a.cash * allocation < CONFIG.minimumOrder || p?.side === -1;
    el('short').disabled = stopped || a.cash * allocation < CONFIG.minimumOrder || p?.side === 1;
    el('close').disabled = stopped || !p;
    el('pay').disabled = stopped || !a.canPay;
    el('pay-help').textContent = a.paid ? 'Paid. Opening the personal page…' : a.canPay ? 'You made it. Pay to open the personal page.' : p && a.cashAfterClose >= CONFIG.target ? 'Goal in reach. Close 100% to secure your cash.' : 'Close your position and hold $50,000 cash to enter.';
    el('order-hint').textContent = p ? `${allocation * 100}% close · ${(p.quantity * allocation).toFixed(3)} MOTH · ${money(p.quantity * allocation * m.price * CONFIG.feeRate)} fee`
      : `${money(a.cash * allocation)} cash · ${leverage}× leverage · entry fee included`;
    el('market-state').textContent = a.bankrupt ? 'ended' : a.paid ? 'complete' : catching ? 'catching up' : 'live';
    root.dataset.phase = a.bankrupt ? 'bankrupt' : a.paid ? 'paid' : catching ? 'catching-up' : 'trading';
    el('catchup-layer').hidden = !stopped;
    el('catchup-title').textContent = a.bankrupt ? 'Out of cash' : a.paid ? 'Goal paid' : 'Catching up';
    el('catchup-help').textContent = a.bankrupt ? 'A fresh $10,000 and a new chart await.' : a.paid ? 'Your fictional entry is complete.' : 'The market kept moving. Updating every missed price…';
    el('retry').hidden = !a.bankrupt;
    if (state.liquidations > priorLiquidations) {
      priorLiquidations = state.liquidations;
      message(a.bankrupt ? 'Liquidated. Your isolated collateral is gone. Try again with a fresh $10,000.' : `Liquidated. ${money(a.cash)} outside the position is still available.`);
    }
    if (a.bankrupt && !status.startsWith('Liquidated')) message('No tradeable cash remains. Try again with a fresh $10,000.');
    drawChart(el('chart'), m, a);
    const next = JSON.stringify(getState());
    if (next !== notified) { notified = next; changed(getState()); }
  }
  function schedule(delay) { clearTimeout(timer); timer = setTimeout(pump, delay); }
  function pump() {
    if (destroyed || !session) return;
    clearTimeout(timer); cancelAnimationFrame(frame);
    const result = reconciler.reconcile(CONFIG.catchupChunkTicks);
    if (result.lagMs >= CONFIG.catchupNoticeMs || document.hidden) catching = true;
    render();
    if (result.ended) return;
    if (result.remainingMs >= CONFIG.tickMs) { catching = true; render(); schedule(0); return; }
    if (document.hidden) { schedule(CONFIG.tickMs); return; }
    if (!catching) { schedule(CONFIG.tickMs / 2); return; }
    // Keep controls locked until the reconciled quote has had a paint. If time
    // advances during that paint, reconcile again before enabling anything.
    const current = generation;
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (destroyed || current !== generation) return;
        if (reconciler.pending() || document.hidden) { pump(); return; }
        catching = false;
        render();
        schedule(CONFIG.tickMs / 2);
      });
    });
  }
  function readyForInput() {
    if (destroyed || !session || document.hidden || catching || session.ended) return false;
    if (reconciler.pending() || state.elapsed !== session.elapsed) {
      // A stale click updates the view and asks for a new click; it cannot fill
      // either an old quote or a newly computed price the player hasn't seen.
      catching = true;
      message('Price updated. Review the current quote, then tap again to trade.');
      pump();
      return false;
    }
    return true;
  }
  function trade(action) {
    if (!readyForInput()) return;
    // Input reconciliation never executes an order at an unseen future price.
    const fillPrice = state.market.price;
    if (action === 'close') {
      if (session.close(allocation)) message(`Closed ${allocation * 100}% at $${priceText(fillPrice)}. Margin and net P&L returned to cash.`);
    } else {
      if (session.enter(action === 'long' ? 1 : -1, allocation, leverage)) message(`${state.account.position ? 'Added to' : 'Opened'} ${action} at $${priceText(fillPrice)} · ${leverage}×.`);
    }
    render();
  }
  for (const side of ['long', 'short', 'close']) listen(el(side), 'click', () => trade(side));
  for (const button of root.querySelectorAll('[data-leverage]')) listen(button, 'click', () => { if (!state?.account.position && readyForInput()) { leverage = Number(button.dataset.leverage); render(); } });
  for (const button of root.querySelectorAll('[data-allocation]')) listen(button, 'click', () => { if (readyForInput()) allocation = Number(button.dataset.allocation); render(); });
  listen(el('mobile-leverage'), 'change', () => { if (!state?.account.position && readyForInput()) leverage = Number(el('mobile-leverage').value); render(); });
  listen(el('mobile-allocation'), 'change', () => { if (readyForInput()) allocation = Number(el('mobile-allocation').value); render(); });
  listen(el('pay'), 'click', () => { if (readyForInput() && state?.account.canPay) tryEnter(); });
  listen(el('retry'), 'click', () => reset());
  listen(document, 'visibilitychange', () => { catching = true; pump(); });
  listen(window, 'pageshow', event => { if (event.persisted) { catching = true; pump(); } });
  const observer = new ResizeObserver(() => render()); observer.observe(root);
  function reset({ seed = freshSeed() } = {}) {
    if (destroyed) return;
    generation++; clearTimeout(timer); cancelAnimationFrame(frame);
    session = createSession(seed); reconciler = createReconciler(session, createWallClock());
    leverage = CONFIG.defaultLeverage; allocation = 1; catching = document.hidden;
    priorLiquidations = 0; notified = '';
    message('Follow the candles. Long gains on rises; Short gains on falls.');
    el('seed').textContent = String(seed);
    render();
    schedule(CONFIG.tickMs / 2);
  }
  return {
    reset, getState, message,
    pay(complete = () => true) {
      if (!readyForInput() || !state.account.canPay) return false;
      // Synchronous transaction: eligibility is sampled once, before the shared
      // completion callback. A storage failure keeps all fictional cash intact.
      if (complete(getState()) !== true) return false;
      if (!session.pay()) return false;
      clearTimeout(timer); render(); return true;
    },
    destroy() { destroyed = true; generation++; clearTimeout(timer); cancelAnimationFrame(frame); observer.disconnect(); events.abort(); root.replaceChildren(); },
  };
}
