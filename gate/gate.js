import { createGate, formatValue } from './engine.js';
import { InertiaDial } from './dial.js';
const copy = {
  en: { eyebrow:'Beyond research · A little detour', title:'One more turn.', intro:'An unnecessarily difficult door to a very ordinary page.', target:'Target code', random:'New target ↻', fine:'Fine control', instructions:'Drag around the dial. Release to let it coast. Use fine control for the last few digits.', keyboard:'Keyboard: focus the dial, then use arrow keys (±1); Shift + arrow (±100). Values wrap from 9999 to 0000.', enter:'Enter →', rule:'Match the target, let the dial stop completely, then press Enter.', note:'Just a local game, not a password or a security check. Nothing to submit, nothing to remember.', back:'← Back to research', moving:'Still moving. Let it settle.', ready:'Perfectly still. Perfectly matched. Come in!', stopped:'Stopped. A little more turning?', dial:'Inertia dial' },
  ko: { eyebrow:'연구 밖의 공간 · 잠깐의 샛길', title:'한 바퀴만 더.', intro:'아주 평범한 페이지로 가는, 쓸데없이 어려운 문.', target:'목표 번호', random:'새 목표 ↻', fine:'미세 조절', instructions:'다이얼을 따라 둥글게 드래그하세요. 손을 놓으면 관성으로 돌아갑니다. 마지막 몇 칸은 미세 조절로 맞춰 보세요.', keyboard:'키보드: 다이얼에 초점을 두고 방향키(±1), Shift + 방향키(±100)를 누르세요. 9999 다음은 0000입니다.', enter:'입장 →', rule:'목표 번호를 맞추고 완전히 멈춘 뒤 입장 버튼을 누르세요.', note:'비밀번호나 보안 절차가 아닌, 이 브라우저 안에서만 하는 놀이입니다. 제출하거나 기억할 것은 없어요.', back:'← 연구 프로필로 돌아가기', moving:'아직 움직이고 있어요. 멈출 때까지 기다려 주세요.', ready:'정확히 맞췄고, 완전히 멈췄어요. 들어오세요!', stopped:'멈췄어요. 조금 더 돌려 볼까요?', dial:'관성 다이얼' }
};
const gate = createGate();
const element = document.querySelector('#dial');
const enter = document.querySelector('#enter');
const status = document.querySelector('#state');
let lang = 'en';
try { lang = localStorage.getItem('academic-language') === 'ko' ? 'ko' : 'en'; } catch {}
function render(state) {
  const value = formatValue(state.value);
  document.querySelector('#value').textContent = value;
  element.setAttribute('aria-valuenow', state.value);
  element.setAttribute('aria-valuetext', value);
  element.style.setProperty('--rotation', `${state.value * 360 / 10000}deg`);
  enter.disabled = !gate.canEnter(state);
  const message = copy[lang][!state.stopped ? 'moving' : gate.canEnter(state) ? 'ready' : 'stopped'];
  if (status.textContent !== message) status.textContent = message;
}
const dial = new InertiaDial(element, render);
function setLanguage(next) {
  lang = next;
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-copy]').forEach(el => { el.textContent = copy[lang][el.dataset.copy]; });
  document.querySelectorAll('[data-lang]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.lang === lang)));
  element.setAttribute('aria-label', copy[lang].dial);
  try { localStorage.setItem('academic-language', lang); } catch {}
  render(dial.getState());
}
function newTarget() {
  const { target, start } = gate.next();
  document.querySelector('#target').textContent = formatValue(target);
  dial.reset(start);
}
document.querySelector('#new-target').addEventListener('click', newTarget);
document.querySelector('#new-target').disabled = false;
document.querySelector('#fine').addEventListener('click', event => {
  dial.fine = !dial.fine;
  event.currentTarget.setAttribute('aria-pressed', String(dial.fine));
});
enter.addEventListener('click', () => { if (gate.canEnter(dial.getState())) window.location.assign('../personal/'); });
document.querySelectorAll('[data-lang]').forEach(el => el.addEventListener('click', () => setLanguage(el.dataset.lang)));
document.querySelector('#year').textContent = new Date().getFullYear();
setLanguage(lang);
newTarget();
window.addEventListener('pageshow', () => dial.stop());
