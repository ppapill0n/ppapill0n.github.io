import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../academic.css', import.meta.url), 'utf8');
const script = await readFile(new URL('../academic.js', import.meta.url), 'utf8');

test('intro source order is heading, one portrait, then biography and research', () => {
  const intro = html.match(/<section class="intro" id="about">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(intro);
  assert.match(intro, /<div class="intro-heading">\s*<p class="overline" data-i18n="role">[^<]+<\/p>\s*<h1>Yonghee Kim<span>\.<\/span><\/h1>\s*<\/div>/);
  assert.equal((html.match(/class="academic-portrait"/g) || []).length, 1);
  const markers = ['class="intro-heading"', 'data-i18n="role"', '<h1>', 'class="academic-portrait"', 'class="intro-copy"', 'data-i18n-html="intro"', 'data-i18n="research"', 'class="topics"'];
  let previous = -1;
  for (const marker of markers) {
    const position = intro.indexOf(marker);
    assert.ok(position > previous, `${marker} follows the previous intro element`);
    previous = position;
  }
  assert.match(intro, /class="academic-portrait" role="img" aria-label="Portrait placeholder"/);
  assert.match(html, /class="personal-cue" href="gate\/" data-i18n="personalPrompt">wanna see more\?<\/a>/);
});

test('CSS retains the desktop column and defines the mobile portrait stack at 650px', () => {
  const [desktop, media] = css.split('@media (max-width:650px)');
  assert.ok(media, 'mobile breakpoint is present');
  const mobile = media.split('@media')[0];
  assert.match(desktop, /\.intro-grid\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) 210px;[^}]*grid-template-rows:auto 1fr;[^}]*grid-template-areas:"heading portrait" "copy portrait";[^}]*column-gap:3\.5rem;/);
  for (const [className, area] of [['intro-heading', 'heading'], ['intro-copy', 'copy'], ['academic-portrait', 'portrait']]) {
    assert.match(desktop, new RegExp(`\\.${className}\\s*\\{[^}]*grid-area:${area};`));
  }
  assert.match(desktop, /\.academic-portrait\s*\{[^}]*aspect-ratio:4\/5;/);
  assert.match(mobile, /\.intro-grid\s*\{[^}]*grid-template-columns:1fr;[^}]*grid-template-rows:auto;[^}]*grid-template-areas:"heading" "portrait" "copy";[^}]*gap:1\.7rem;/);
  assert.match(mobile, /\.academic-portrait\s*\{[^}]*width:min\(160px,100%\);[^}]*justify-self:start;/);
  assert.match(mobile, /\.intro-heading h1\s*\{[^}]*margin-bottom:0;/);
});

test('EN and KO switching updates every existing translation hook, including the moved portrait', () => {
  const textNodes = [];
  const htmlNodes = [];
  for (const match of html.matchAll(/data-i18n(-html)?="([^"]+)"/g)) {
    const node = { dataset: { [match[1] ? 'i18nHtml' : 'i18n']: match[2] } };
    (match[1] ? htmlNodes : textNodes).push(node);
  }
  const buttons = ['en', 'ko'].map(lang => ({
    dataset: { lang }, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(event, callback) { this[event] = callback; }
  }));
  const otherNodes = new Map();
  const stored = new Map();
  const document = {
    documentElement: {},
    querySelectorAll(selector) {
      return { '[data-i18n]': textNodes, '[data-i18n-html]': htmlNodes, '[data-lang]': buttons }[selector];
    },
    querySelector(selector) {
      if (!otherNodes.has(selector)) otherNodes.set(selector, { dataset: {}, addEventListener() {} });
      return otherNodes.get(selector);
    }
  };
  vm.runInNewContext(script, {
    document,
    localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) }
  });
  const text = key => textNodes.find(node => node.dataset.i18n === key)?.textContent;
  const content = key => htmlNodes.find(node => node.dataset.i18nHtml === key)?.innerHTML;
  for (const lang of ['en', 'ko', 'en', 'ko']) {
    buttons.find(button => button.dataset.lang === lang).click();
    assert.equal(document.documentElement.lang, lang);
    assert.equal(stored.get('academic-language'), lang);
    for (const node of textNodes) assert.equal(typeof node.textContent, 'string', node.dataset.i18n);
    for (const node of htmlNodes) assert.equal(typeof node.innerHTML, 'string', node.dataset.i18nHtml);
    assert.equal(text('role'), lang === 'en' ? 'PhD student · Programming languages' : '박사과정 · 프로그래밍 언어');
    assert.equal(text('portraitPlaceholder'), lang === 'en' ? 'Portrait to be added' : '사진 추가 예정');
    assert.match(content('intro'), lang === 'en' ? /advised by/ : /지도를 받고 있습니다/);
    assert.match(text('research'), lang === 'en' ? /formal verification/ : /정형 검증/);
    assert.equal(text('personalPrompt'), lang === 'en' ? 'wanna see more?' : '조금 더 볼까요?');
    for (const button of buttons) assert.equal(button.attributes['aria-pressed'], String(button.dataset.lang === lang));
  }
});
