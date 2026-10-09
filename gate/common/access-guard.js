import { readPass, clearPass, PASS_KEY } from './session-pass.js';

// Shared by personal and freeplay. Reading a pass never renews its fixed expiry.
export function createAccessGuard({
  page = document.documentElement, document: doc = document, window: win = window,
  read = readPass, clear = clearPass, now = Date.now,
  navigate = () => win.location.replace(new URL('../', import.meta.url).href),
  onValid = () => {}, onBlocked = () => {}, onPageHide = () => {}
} = {}) {
  let timer = null, blocked = false, destroyed = false;
  const listeners = [];
  const listen = (target, type, fn) => { target.addEventListener(type, fn); listeners.push(() => target.removeEventListener(type, fn)); };
  function hide() { page.setAttribute('data-private-pending', ''); clearTimeout(timer); timer = null; }
  function check() {
    if (destroyed || blocked) return false;
    hide();
    const result = read(now());
    if (result.status !== 'valid') {
      blocked = true; clear(); onBlocked(); navigate(); return false;
    }
    // Revalidate before a hidden tab or bfcache restoration can show content.
    if (!doc.hidden) { page.removeAttribute('data-private-pending'); onValid(result.pass); }
    timer = setTimeout(check, Math.max(0, result.pass.expiresAt - now()));
    return true;
  }
  listen(win, 'pagehide', () => { hide(); onPageHide(); });
  listen(win, 'pageshow', check);
  listen(win, 'focus', check);
  listen(doc, 'visibilitychange', check);
  listen(win, 'storage', event => { if (event.key === PASS_KEY || event.key === null) check(); });
  check();
  return { check, destroy() { destroyed = true; hide(); listeners.forEach(remove => remove()); } };
}
