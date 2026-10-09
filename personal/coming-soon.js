import { personalCue } from '../play/copy.js';
const copy = {
  en: {eyebrow:'Beyond research',title:'Coming soon<span>.</span>',message:'This personal space is still taking shape.',back:'Back to research profile →',play:personalCue.en},
  ko: {eyebrow:'연구 밖의 공간',title:'준비중<span>.</span>',message:'개인적인 공간을 준비하고 있습니다.',back:'연구 프로필로 돌아가기 →',play:personalCue.ko}
};
function setLanguage(lang) {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-copy]').forEach(el => {
    if(el.dataset.copy === 'title') el.innerHTML = copy[lang].title;
    else el.textContent = copy[lang][el.dataset.copy];
  });
  document.querySelectorAll('[data-lang]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.lang === lang)));
  try { localStorage.setItem('academic-language',lang); } catch { /* Language still works when storage is disabled. */ }
}
document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click',() => setLanguage(button.dataset.lang)));
document.querySelector('#year').textContent = new Date().getFullYear();
let language='en';
try { language=localStorage.getItem('academic-language') === 'ko' ? 'ko' : 'en'; } catch { /* Use the default language. */ }
setLanguage(language);
