import { CONFIG } from './config.js?v=20261019-sweeps';
import { createSession } from './session.js?v=20261019-orders';
import { drawChart } from './chart.js?v=20261029-ticker';
import { createWallClock, createReconciler } from './live-clock.js';
import { createOrderQueue } from './orders.js?v=20261019-orders';

const money = value => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const signedMoney = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;
const priceText = price => price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
// Freeplay recreates the adapter on restart. Remember only the label per root,
// independently of market seeds, so even a repeated draw gets a new ticker.
const previousTickers = new WeakMap();
function freshTicker(root) {
  const letters = Array.from(crypto.getRandomValues(new Uint8Array(4)), n => String.fromCharCode(65 + n % 26));
  if (letters.join('') === previousTickers.get(root)) letters[3] = String.fromCharCode(65 + (letters[3].charCodeAt(0) - 64) % 26);
  const ticker = letters.join('');
  previousTickers.set(root, ticker);
  return ticker;
}

export function createCryptoGame(root, changed = () => {}, tryEnter = () => {}, { mode = 'standalone' } = {}) {
  root.classList.add('crypto-game');
  root.innerHTML = `
    <section class="balance" aria-label="Account summary">
      <div><span class="label" aria-label="Total equity">Equity</span><strong id="equity">$10,000.00</strong></div>
    </section>
    <progress id="goal-progress" max="50000" value="10000" aria-label="Equity toward $50,000 goal"></progress>
    <section class="market" aria-label="Fictional market">
      <div class="market-heading"><div><strong id="ticker"></strong><strong> <span>/ USD</span></strong><span class="market-meta" aria-label="Two-second candles">2s</span><span id="market-state" class="sr-only">live</span></div><div class="quote"><strong id="quote"></strong><span id="price-change"></span></div></div>
      <div class="chart-wrap"><svg id="chart" role="img"></svg><div id="catchup-layer" hidden aria-describedby="catchup-help"><strong id="catchup-title">Catching up</strong><span id="catchup-help" class="sr-only">The market kept moving while you were away.</span><button id="retry" type="button" hidden>Retry</button></div></div>
      <div class="chart-footer"><span><span class="live-dot" aria-hidden="true"></span><span id="elapsed" aria-label="Elapsed market time">0:00</span></span></div>
    </section>
    <section class="position" aria-label="Position details">
      <div class="position-heading"><strong id="position-name" aria-label="No open position">Flat</strong><span id="position-size"></span></div>
      <div class="account-stats"><div><span class="label" aria-label="Available cash">Cash</span><strong id="cash"></strong></div><div><span class="label" aria-label="Position profit and loss">P&amp;L</span><strong id="pnl">—</strong></div><div><span class="label" aria-label="Entry and liquidation prices">Entry / Liq.</span><strong id="levels">— / —</strong></div></div>
    </section>
    <section class="controls" aria-label="Trading controls">
      <div class="selectors"><fieldset><legend>Leverage <span id="leverage-note" class="sr-only">· more risk, more reward</span></legend><div class="segments" id="leverage">${CONFIG.leverage.map(n => `<button type="button" data-leverage="${n}" aria-pressed="${n === CONFIG.defaultLeverage}">${n}×</button>`).join('')}</div></fieldset><fieldset><legend>Order size <span class="sr-only">· cash in / position out</span></legend><div class="segments" id="allocation">${CONFIG.allocations.map(n => `<button type="button" data-allocation="${n}" aria-pressed="${n === 1}">${n * 100}%</button>`).join('')}</div></fieldset></div>
      <div class="mobile-selectors"><label>Leverage <select id="mobile-leverage" aria-describedby="leverage-note">${CONFIG.leverage.map(n => `<option value="${n}" ${n === CONFIG.defaultLeverage ? 'selected' : ''}>${n}×</option>`).join('')}</select></label><label>Order size <select id="mobile-allocation" aria-describedby="order-hint">${CONFIG.allocations.map(n => `<option value="${n}" ${n === 1 ? 'selected' : ''}>${n * 100}%</option>`).join('')}</select></label></div>
      <div class="trade-buttons" role="group" aria-describedby="order-hint"><button id="long" type="button">Long</button><button id="short" type="button">Short</button><button id="close" type="button" disabled>Close</button></div>
      <p id="order-hint" class="sr-only"></p>
      <p id="status" class="sr-only" role="status" aria-live="polite"></p>
      <button id="pay" type="button" aria-describedby="pay-help" disabled>Pay $50,000 <span aria-hidden="true">→</span></button>
      <p id="pay-help" class="sr-only">Close your position and hold $50,000 cash to enter.</p>
    </section>`;
  const el = id => root.querySelector(`#${id}`);
  const events = new AbortController();
  const listen = (target, type, callback) => target.addEventListener(type, callback, { signal: events.signal });
  let session, reconciler, orders, state, leverage = CONFIG.defaultLeverage, allocation = 1, catching = false, destroyed = false, suspended = false;
  let timer = 0, generation = 0, notified = '', priorLiquidations = 0, chartKey = '';
  let status = '', ticker = '';
  function message(text, visible = false) {
    status = text;
    el('status').textContent = text;
    el('status').classList.toggle('sr-only', !visible);
  }
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
    el('quote').textContent = `$${priceText(m.price)}`;
    const latest = m.candle || m.candles.at(-1), change = (m.price / latest.open - 1) * 100;
    el('price-change').textContent = `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(2)}%`;
    el('price-change').setAttribute('aria-label', `${el('price-change').textContent} this candle`);
    el('price-change').className = change < 0 ? 'negative' : 'positive';
    el('elapsed').textContent = `${Math.floor(state.elapsed / 60000)}:${String(Math.floor(state.elapsed / 1000) % 60).padStart(2, '0')}`;
    el('position-name').textContent = p ? `${p.side === 1 ? 'Long' : 'Short'} · ${p.leverage}×` : 'Flat';
    el('position-name').setAttribute('aria-label', p ? el('position-name').textContent : 'No open position');
    el('position-size').textContent = p ? `${p.quantity.toFixed(3)} ${ticker}` : '';
    el('levels').textContent = p ? `$${priceText(p.entry)} / ${a.liquidationPrice > 0 ? `$${priceText(a.liquidationPrice)}` : 'none'}` : '— / —';
    el('leverage-note').textContent = p ? '· locked while holding' : '· more risk, more reward';
    const stopped = document.hidden || suspended || a.bankrupt || a.paid;
    for (const button of root.querySelectorAll('[data-leverage]')) {
      button.disabled = !!p || orders.pending || stopped;
      button.setAttribute('aria-pressed', String(Number(button.dataset.leverage) === leverage));
    }
    for (const button of root.querySelectorAll('[data-allocation]')) {
      button.disabled = stopped;
      button.setAttribute('aria-pressed', String(Number(button.dataset.allocation) === allocation));
    }
    el('mobile-leverage').value = String(leverage);
    el('mobile-leverage').disabled = !!p || orders.pending || stopped;
    el('mobile-allocation').value = String(allocation);
    el('mobile-allocation').disabled = stopped;
    el('long').disabled = stopped || a.cash * allocation < CONFIG.minimumOrder || p?.side === -1;
    el('short').disabled = stopped || a.cash * allocation < CONFIG.minimumOrder || p?.side === 1;
    el('close').disabled = stopped || !p;
    el('pay').disabled = stopped || !a.canPay;
    el('pay').hidden = mode === 'gate';
    el('pay-help').textContent = a.paid ? 'Paid. Goal complete.' : a.canPay ? 'Goal reached. Payment is available.' : p && a.cashAfterClose >= CONFIG.target ? 'Goal in reach. Close 100% to secure your cash.' : 'Close your position and hold $50,000 cash to pay.';
    el('order-hint').textContent = p ? `${allocation * 100}% close · ${(p.quantity * allocation).toFixed(3)} ${ticker} · ${money(p.quantity * allocation * m.price * CONFIG.feeRate)} fee`
      : `${money(a.cash * allocation)} cash · ${leverage}× leverage · entry fee included`;
    el('market-state').textContent = a.bankrupt ? 'ended' : a.paid ? 'complete' : catching ? 'catching up' : 'live';
    root.dataset.phase = a.bankrupt ? 'bankrupt' : a.paid ? 'paid' : catching ? 'catching-up' : 'trading';
    el('catchup-layer').hidden = !stopped && !catching;
    el('catchup-title').textContent = a.bankrupt ? 'Out of cash' : a.paid ? 'Paid' : 'Catching up';
    el('catchup-help').textContent = a.bankrupt ? 'A fresh $10,000 and a new chart await.' : a.paid ? 'Your fictional entry is complete.' : 'The market kept moving. Updating every missed price…';
    el('retry').hidden = !a.bankrupt;
    if (state.liquidations > priorLiquidations) {
      priorLiquidations = state.liquidations;
      message(a.bankrupt ? 'Liquidated. Your isolated collateral is gone. Try again with a fresh $10,000.' : 'Liquidated.', !a.bankrupt);
    }
    if (a.bankrupt && !status.startsWith('Liquidated')) message('No tradeable cash remains. Try again with a fresh $10,000.');
    const chart = el('chart');
    const nextChartKey = JSON.stringify([m.time, m.price, p?.entry, a.liquidationPrice, chart.clientWidth, chart.clientHeight]);
    // Polls, selectors and order notifications often share the same chart.
    // Keep its SVG nodes intact unless a tick, position marker or size changed.
    if (nextChartKey !== chartKey) { drawChart(chart, m, a, ticker); chartKey = nextChartKey; }
    const next = JSON.stringify(getState());
    if (next !== notified) { notified = next; changed(getState()); }
  }
  function schedule(delay) {
    clearTimeout(timer);
    const current = generation;
    timer = setTimeout(() => { if (current === generation) pump(); }, delay);
  }
  function pump() {
    if (destroyed || suspended || !session) return;
    clearTimeout(timer);
    const result = reconciler.reconcile(CONFIG.catchupChunkTicks);
    orders.flush();
    // Show only substantial work still remaining after this bounded chunk.
    // A delay already reconciled, or a tick due during rendering, is ordinary
    // foreground work and must not flash an overlay or wait for extra paints.
    catching = !session.ended && result.remainingMs >= CONFIG.catchupNoticeMs;
    render();
    if (session.ended && !orders.pending) return;
    if (reconciler.pending() || orders.pending) { schedule(0); return; }
    schedule(document.hidden ? CONFIG.tickMs : CONFIG.tickMs / 2);
  }
  const readyForInput = () => !destroyed && !suspended && !!session && !document.hidden && !session.ended;
  function trade(action) {
    if (!readyForInput()) return;
    const current = generation, fraction = allocation, selectedLeverage = leverage;
    const result = orders.submit({ action, allocation: fraction, leverage: selectedLeverage, positionId: state.account.position?.id ?? null });
    pump();
    result.then(fill => {
      if (destroyed || current !== generation || fill.status === 'cancelled') return;
      if (fill.status === 'filled') message(action === 'close'
        ? `Closed ${fraction * 100}% at $${priceText(fill.price)}.`
        : `${fill.added ? 'Added to' : 'Opened'} ${action} at $${priceText(fill.price)} · ${selectedLeverage}×.`);
      else if (!status.startsWith('Liquidated')) message('Order unavailable: the position or available cash changed.');
      render();
    });
  }
  for (const side of ['long', 'short', 'close']) listen(el(side), 'click', () => trade(side));
  for (const button of root.querySelectorAll('[data-leverage]')) listen(button, 'click', () => { if (!state?.account.position && readyForInput()) { leverage = Number(button.dataset.leverage); render(); } });
  for (const button of root.querySelectorAll('[data-allocation]')) listen(button, 'click', () => { if (readyForInput()) allocation = Number(button.dataset.allocation); render(); });
  listen(el('mobile-leverage'), 'change', () => { if (!state?.account.position && readyForInput()) leverage = Number(el('mobile-leverage').value); render(); });
  listen(el('mobile-allocation'), 'change', () => { if (readyForInput()) allocation = Number(el('mobile-allocation').value); render(); });
  listen(el('pay'), 'click', () => { if (readyForInput()) { if (mode === 'freeplay') pay(); else tryEnter(); } });
  listen(el('retry'), 'click', () => reset());
  listen(document, 'visibilitychange', pump);
  listen(window, 'pagehide', () => { suspended = true; generation++; orders?.cancel(); clearTimeout(timer); });
  listen(window, 'pageshow', event => {
    if (event.persisted) {
      if (suspended) orders = createOrderQueue(session, reconciler);
      suspended = false; pump();
    }
  });
  const observer = new ResizeObserver(() => render()); observer.observe(root);
  function reset({ seed = freshSeed() } = {}) {
    if (destroyed) return;
    generation++; orders?.cancel(); clearTimeout(timer);
    session = createSession(seed); reconciler = createReconciler(session, createWallClock());
    orders = createOrderQueue(session, reconciler); suspended = false;
    leverage = CONFIG.defaultLeverage; allocation = 1; catching = document.hidden;
    priorLiquidations = 0; notified = ''; chartKey = '';
    ticker = freshTicker(root);
    el('ticker').textContent = ticker;
    message('');
    root.dataset.seed = String(seed);
    render();
    schedule(CONFIG.tickMs / 2);
  }
  function pay(complete = () => true) {
    if (!readyForInput()) return Promise.resolve(false);
    const current = generation, result = orders.submit({ action: 'pay', complete });
    pump();
    return result.then(fill => {
      if (destroyed || current !== generation) return false;
      render(); return fill.status === 'filled';
    });
  }
  return { reset, getState, message, pay,
    destroy() { destroyed = true; generation++; orders?.cancel(); clearTimeout(timer); observer.disconnect(); events.abort(); root.classList.remove('crypto-game'); root.replaceChildren(); },
  };
}
