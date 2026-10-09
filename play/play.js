import { createRegistry } from '../gate/registry.js?v=20261009-freeplay';
import { canEnter, formatValue } from '../gate/common/engine.js';
import { readPass } from '../gate/common/session-pass.js';
import { createAccessGuard } from '../gate/common/access-guard.js';
import { createFreeplayController, selectedGame } from './controller.js';
import { copy } from './copy.js?v=20261009-gallery';

const registry = createRegistry();
const root = document.querySelector('#game');
const selection = document.querySelector('#selection');
const stage = document.querySelector('#play-stage');
const status = document.querySelector('#state');
let language = 'en', activeGame = null, activeChallenge = null, lastState = null;
try { language = localStorage.getItem('academic-language') === 'ko' ? 'ko' : 'en'; } catch { /* Default remains usable. */ }
let guard;
const controller = createFreeplayController({
  registry, root, allowed: () => readPass().status === 'valid',
  denied: () => queueMicrotask(() => guard?.check()),
  selected(game, challenge) {
    activeGame = game; activeChallenge = challenge; lastState = null;
    selection.hidden = !!game; stage.hidden = !game;
    stage.className = game ? `${game.id}-mode` : '';
    status.textContent = '';
    status.classList.toggle('sr-only', game?.id === 'gomoku');
    renderGameCopy();
  },
  changed(state) { lastState = state; renderStatus(); decorateGame(); },
  failed() { status.textContent = copy[language].failed; }
});
function renderGameCopy() {
  if (!activeGame) return;
  const text = copy[language], gameText = text.games[activeGame.id];
  document.querySelector('#game-title').textContent = gameText.name;
  document.querySelector('#game-help').textContent = gameText.help;
  document.querySelector('#target-row').hidden = !!activeGame.hideTarget || activeGame.id === 'slots';
  const value = activeChallenge?.target;
  document.querySelector('#target').textContent = activeGame.hideTarget ? '' : activeGame.id === 'cannon' ? `${(value / 10).toFixed(1)} m` : activeGame.id === 'soda' ? `${(value / 10).toFixed(1)} mL` : (activeGame.formatTarget ?? formatValue)(value);
  document.title = `${gameText.name} · ${text.pageTitle}`;
}
function decorateGame() {
  if (!activeGame) return;
  // Reuse the game UI while removing gate-only instructions from its help.
  const help = root.querySelector('#instructions, #gomoku-help');
  if (help) help.textContent = copy.en.games[activeGame.id].help;
  const rematch = root.querySelector('#rematch');
  if (rematch) { rematch.textContent = copy[language][root.dataset.phase === 'error' ? 'retry' : 'rematch']; rematch.lang = language; }
}
function renderStatus() {
  if (!activeGame || !lastState) return;
  const text = copy[language];
  let message = '';
  if (activeGame.id === 'gomoku') {
    message = text[lastState.outcome] ?? text[({ thinking:'thinking', human:'turn', paused:'paused', error:'paused' })[root.dataset.phase]] ?? '';
  } else if (canEnter(activeChallenge.target, lastState, activeGame.rules)) {
    message = activeGame.cube ? text.solved : text.matched;
  }
  if (status.textContent !== message) status.textContent = message;
}
function setLanguage(lang) {
  language = lang === 'ko' ? 'ko' : 'en';
  document.documentElement.lang = language;
  const text = copy[language];
  document.querySelectorAll('[data-copy]').forEach(el => { el.textContent = text[el.dataset.copy]; });
  document.querySelectorAll('[data-label]').forEach(el => { el.setAttribute('aria-label', text[el.dataset.label]); });
  document.querySelectorAll('[data-lang]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lang === language)));
  const list = document.querySelector('#game-list');
  list.replaceChildren(...registry.map((game, index) => {
    const link = document.createElement('a'), name = document.createElement('strong'), preview = document.createElement('span'), thumbnail = document.createElement('img');
    link.className = 'game-choice'; link.href = `?game=${game.id}`; link.dataset.selectGame = game.id;
    preview.className = 'game-preview'; preview.setAttribute('aria-hidden', 'true');
    thumbnail.src = `thumbnails/${game.id}.webp?v=20261009-gallery`; thumbnail.alt = '';
    thumbnail.width = 600; thumbnail.height = 450; thumbnail.decoding = 'async';
    thumbnail.loading = index < 3 ? 'eager' : 'lazy';
    // A failed preview keeps its reserved space and leaves the named link usable.
    thumbnail.addEventListener('error', () => { thumbnail.hidden = true; }, { once:true });
    name.textContent = text.games[game.id].name; preview.append(thumbnail);
    link.append(preview, name); return link;
  }));
  document.title = text.pageTitle;
  renderGameCopy(); renderStatus(); decorateGame();
  try { localStorage.setItem('academic-language', language); } catch { /* Controls still work. */ }
}
function route({ focus = false } = {}) {
  const id = selectedGame(window.location.search, registry);
  // Unknown game IDs fall back to the chooser without leaving a broken URL.
  if (!id && window.location.search) window.history.replaceState(null, '', window.location.pathname);
  if (controller.select(id) && focus) document.querySelector(id ? '#game-title' : '#hub-title').focus({ preventScroll:true });
}
function navigateGame(id) {
  const url = new URL(window.location.href); url.search = id ? `?game=${id}` : ''; url.hash = '';
  if (url.href !== window.location.href) window.history.pushState(null, '', url);
  route({ focus:true });
}
function plainClick(event) { return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey; }
document.querySelector('#game-list').addEventListener('click', event => {
  const link = event.target.closest('[data-select-game]');
  if (!link || !plainClick(event)) return;
  event.preventDefault(); navigateGame(link.dataset.selectGame);
});
document.querySelector('#all-games').addEventListener('click', event => {
  if (!plainClick(event)) return;
  event.preventDefault(); navigateGame(null);
});
document.querySelector('#restart').addEventListener('click', () => { controller.restart(); });
document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.lang)));
window.addEventListener('popstate', () => route({ focus:true }));
setLanguage(language);
guard = createAccessGuard({
  onValid: () => { if (!controller.id) route(); },
  onBlocked: () => controller.close(),
  onPageHide: () => controller.close()
});
