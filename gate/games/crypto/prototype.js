import { createCryptoGame } from './game.js?v=20261022-render';
import { CONFIG } from './config.js?v=20261019-sweeps';
import { enterPersonal } from '../../common/entry.js';

const root = document.querySelector('#game');
const game = createCryptoGame(root, () => {}, async () => {
  // Only this explicit action issues the shared pass. Failed storage never charges.
  let result;
  const paid = await game.pay(state => {
    result = enterPersonal(CONFIG.target, state, undefined, () => {});
    return result === 'entered';
  });
  if (paid) window.location.assign('../../../personal/');
  if (result === 'unavailable') game.message('Session storage is unavailable.', true);
});
document.querySelector('#restart').addEventListener('click', () => game.reset());
// A seed URL is useful for a reproducible review. Restart always draws a new path.
const raw = new URLSearchParams(location.search).get('seed');
const seed = raw !== null && /^\d{1,10}$/.test(raw) && Number(raw) <= 0xFFFFFFFF ? Number(raw) : undefined;
game.reset({ seed });
// The adapter reconciles elapsed time after background throttling / bfcache.
// Reload starts a new run; this prototype does not persist an account.
