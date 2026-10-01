const copy = {
  en: { skip:'Skip to content',aboutNav:'About',publicationsNav:'Publications',contactNav:'Contact',role:'PhD student · Programming languages',intro:'I am a PhD student in the <a href="https://cse.snu.ac.kr/" target="_blank" rel="noreferrer">Department of Computer Science and Engineering</a> at Seoul National University, advised by <a href="https://sf.snu.ac.kr/gil.hur/" target="_blank" rel="noreferrer">Prof. Chung-Kil Hur</a>.',research:'My goal is to bring formal verification closer to real-world programs. As a long-term research interest, I also hope to explore how formal verification can help us understand and communicate with superintelligent AI.',portraitPlaceholder:'Portrait to be added',citation:'Proc. ACM Program. Lang., Vol. 10, PLDI, Article 239, June 2026',education:'Education',phd:'<strong>PhD, Seoul National University</strong><br />Computer Science and Engineering',bs:'<strong>B.S., Seoul National University</strong><br />Electrical and Computer Engineering',highSchool:'<strong>Seoul Science High School</strong><br />Mar. 2012 – Feb. 2015',personalPrompt:'Curious beyond research?'},
  ko: { skip:'본문으로 건너뛰기',aboutNav:'소개',publicationsNav:'논문',contactNav:'연락처',role:'박사과정 · 프로그래밍 언어',intro:'서울대학교 <a href="https://cse.snu.ac.kr/" target="_blank" rel="noreferrer">컴퓨터공학부</a> 박사과정에 재학 중이며, <a href="https://sf.snu.ac.kr/gil.hur/" target="_blank" rel="noreferrer">허충길 교수님</a>의 지도를 받고 있습니다.',research:'현실의 프로그램에 정형 검증을 더 가까이 가져가는 것이 연구 목표입니다. 장기적으로는 정형 검증을 통해 초지능 AI를 이해하고 소통하는 방법을 탐구하고자 합니다.',portraitPlaceholder:'사진 추가 예정',citation:'Proc. ACM Program. Lang., Vol. 10, PLDI, Article 239, 2026년 6월',education:'학력',phd:'<strong>박사과정, 서울대학교</strong><br />컴퓨터공학부',bs:'<strong>학사, 서울대학교</strong><br />전기·정보공학부',highSchool:'<strong>서울과학고등학교</strong><br />2012.03–2015.02',personalPrompt:'연구 밖의 제가 궁금하다면?'}
};
Object.assign(copy.en, { showEmail:'Show email', hideEmail:'Hide email', copyEmail:'Copy', emailCopied:'Email address copied.', emailCopyFallback:'Select the address above and copy it manually.' });
Object.assign(copy.ko, { showEmail:'이메일 보기', hideEmail:'이메일 숨기기', copyEmail:'복사', emailCopied:'이메일 주소를 복사했습니다.', emailCopyFallback:'위 주소를 선택하여 직접 복사해 주세요.' });
function setLanguage(lang) { document.documentElement.lang=lang; document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=copy[lang][el.dataset.i18n]); document.querySelectorAll('[data-i18n-html]').forEach(el=>el.innerHTML=copy[lang][el.dataset.i18nHtml]); document.querySelectorAll('[data-lang]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.lang===lang))); localStorage.setItem('academic-language',lang); }
const emailAddress = document.querySelector('#email-address');
const emailStatus = document.querySelector('#email-status');
let emailViewVersion = 0;
function announceEmail(key) {
  emailStatus.dataset.i18n = key;
  emailStatus.textContent = copy[document.documentElement.lang][key];
}
document.querySelector('#reveal-email').addEventListener('click', event => {
  const show = event.currentTarget.getAttribute('aria-expanded') !== 'true';
  emailViewVersion++;
  emailAddress.textContent = show ? ['yonghee', 'kim'].join('.') + '@' + ['sf', 'snu', 'ac', 'kr'].join('.') : '';
  document.querySelector('#email-details').hidden = !show;
  event.currentTarget.setAttribute('aria-expanded', String(show));
  event.currentTarget.dataset.i18n = show ? 'hideEmail' : 'showEmail';
  event.currentTarget.textContent = copy[document.documentElement.lang][event.currentTarget.dataset.i18n];
  delete emailStatus.dataset.i18n;
  emailStatus.textContent = '';
});
document.querySelector('#copy-email').addEventListener('click', async () => {
  if (!emailAddress.textContent) return;
  const viewVersion = emailViewVersion;
  try {
    await navigator.clipboard.writeText(emailAddress.textContent);
    if (viewVersion === emailViewVersion) announceEmail('emailCopied');
  } catch {
    if (viewVersion === emailViewVersion) announceEmail('emailCopyFallback');
  }
});
document.querySelectorAll('[data-lang]').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.lang)));
document.querySelector('#year').textContent=new Date().getFullYear();
setLanguage(localStorage.getItem('academic-language')||'en');
