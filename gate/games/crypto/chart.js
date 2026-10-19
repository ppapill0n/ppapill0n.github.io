import { CONFIG } from './config.js';

const priceLabel = value => value >= 100_000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(2);
const timeLabel = ms => `${ms < 0 ? '−' : ''}${Math.floor(Math.abs(ms) / 60000)}:${String(Math.floor(Math.abs(ms) / 1000) % 60).padStart(2, '0')}`;

export function drawChart(svg, market, account) {
  const width = Math.max(280, svg.clientWidth), height = svg.clientHeight || 240;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const left = 8, right = width - 76, top = 14, bottom = height - 27;
  const visible = width < 500 ? 40 : CONFIG.visibleCandles;
  const bars = [...market.candles, ...(market.candle ? [market.candle] : [])].slice(-visible);
  const min = Math.min(...bars.map(c => c.low)), max = Math.max(...bars.map(c => c.high));
  const padding = Math.max((max - min) * .16, market.price * .003);
  const lo = min - padding, hi = max + padding;
  const y = p => top + (hi - p) / (hi - lo) * (bottom - top);
  const step = (right - left) / visible, body = Math.max(1.5, step * .64);
  const offset = visible - bars.length;
  const markers = [{ value: market.price, label: priceLabel(market.price), type: 'price-marker' }];
  if (account.position) {
    markers.push({ value: account.position.entry, label: 'Entry', type: 'entry-marker' });
    if (account.liquidationPrice > 0) markers.push({ value: account.liquidationPrice, label: 'Liq.', type: 'liquidation-marker' });
  }
  for (const m of markers) {
    m.py = Math.max(top + 9, Math.min(bottom - 9, y(m.value)));
    m.ly = m.py;
    m.arrow = m.value > hi ? ' ↑' : m.value < lo ? ' ↓' : '';
  }
  // Separate nearby labels without moving their actual price lines.
  markers.sort((a, b) => a.py - b.py);
  for (let i = 1; i < markers.length; i++) markers[i].ly = Math.max(markers[i].ly, markers[i - 1].ly + 21);
  for (let i = markers.length - 1; i >= 0; i--) markers[i].ly = Math.min(markers[i].ly, bottom - 9 - (markers.length - i - 1) * 21);
  let content = '<title>Fictional MOTH / USD candlestick chart</title>';
  for (let i = 0; i <= 4; i++) {
    const value = lo + (hi - lo) * i / 4, py = y(value);
    content += `<path class="grid-line" d="M${left},${py}H${right}"/>`;
    if (!markers.some(m => Math.abs(m.ly - py) < 17)) content += `<text class="axis" x="${right + 7}" y="${py + 4}">${priceLabel(value)}</text>`;
  }
  bars.forEach((c, i) => {
    const x = left + (offset + i + .5) * step;
    const up = c.close >= c.open;
    content += `<g class="candle ${up ? 'up' : 'down'}"><path d="M${x},${y(c.high)}V${y(c.low)}"/><rect x="${x - body / 2}" y="${Math.min(y(c.open), y(c.close))}" width="${body}" height="${Math.max(1, Math.abs(y(c.open) - y(c.close)))}"/></g>`;
    if (i % (width < 500 ? 10 : 15) === 0) content += `<text class="axis" text-anchor="${i === 0 ? 'start' : 'middle'}" x="${x}" y="${height - 6}">${timeLabel(c.time)}</text>`;
  });
  for (const m of markers) {
    content += `<g class="${m.type}"><path class="marker-line" d="M${left},${m.py}H${right}L${right + 4},${m.ly}"/><rect x="${right + 4}" y="${m.ly - 9}" width="68" height="18" rx="3"/><text x="${right + 8}" y="${m.ly + 4}">${m.label}${m.arrow}</text></g>`;
  }
  svg.innerHTML = content;
  const last = bars.at(-1);
  svg.setAttribute('aria-label', `MOTH / USD, two-second candles. Price ${market.price.toFixed(2)}. Latest open ${last.open.toFixed(2)}, high ${last.high.toFixed(2)}, low ${last.low.toFixed(2)}, close ${last.close.toFixed(2)}.`);
}
