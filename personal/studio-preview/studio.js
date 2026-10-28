import { attachViewControls } from './view-controls.js';
import { createObjectStore, DESTINATIONS, MAX_OBJECTS } from './object-store.js';

const $ = id => document.getElementById(id);
const store = createObjectStore();
const names = { plant: '작은 화분', books: '책과 낮은 선반', game: '게임 테이블' };
const destinations = { profile: '연구 프로필', personal: '개인 페이지', play: '게임' };
let room, controls;
const say = message => { $('announcement').textContent = message; };

function updateUI(state = store.snapshot()) {
  $('labels').replaceChildren();
  $('object-list').replaceChildren();
  for (const object of state.objects) {
    const href = DESTINATIONS[object.destination];
    const label = document.createElement('a');
    label.className = 'object-label'; label.href = href; label.textContent = object.label;
    label.dataset.id = object.id; label.setAttribute('aria-label', `${object.label}: ${destinations[object.destination]}로 이동`);
    label.hidden = true; $('labels').append(label);
    const item = document.createElement('li'), link = document.createElement('a'), remove = document.createElement('button');
    link.href = href; link.textContent = `${object.label} ↗`; link.title = destinations[object.destination];
    remove.type = 'button'; remove.textContent = '삭제'; remove.setAttribute('aria-label', `${object.label} 삭제`);
    remove.addEventListener('click', () => {
      updateUI(store.remove(object.id));
      say(`${object.label}을 삭제했습니다.`);
      const next = $('object-list').querySelector('button'); (next || $('add-object')).focus();
    });
    item.append(link, remove); $('object-list').append(item);
  }
  $('object-count').textContent = `${state.objects.length} / ${MAX_OBJECTS}`;
  $('empty-note').hidden = state.objects.length > 0;
  $('empty-room').disabled = state.objects.length === 0;
  $('add-object').disabled = state.objects.length >= MAX_OBJECTS;
  $('add-object').textContent = state.objects.length >= MAX_OBJECTS ? '6개를 모두 놓았어요' : '＋ 오브젝트 놓기';
  $('storage-status').textContent = {
    available: '배치는 이 브라우저에만 저장됩니다.',
    saved: '이 브라우저에 저장했어요.',
    invalid: '이전 배치를 읽을 수 없어 빈 방으로 열었어요. 새 배치를 놓으면 다시 저장합니다.',
    unavailable: '저장소를 사용할 수 없어 지금 열린 화면에만 유지됩니다. 새로고침하면 사라질 수 있어요.',
  }[state.persistence];
  $('reset-confirm').hidden = true;
  room?.setObjects(state.objects);
}

$('edit').addEventListener('click', () => { $('quick-links').open = false; $('editor').showModal(); });
$('close-editor').addEventListener('click', () => $('editor').close());
$('editor').addEventListener('click', event => { if (event.target === $('editor')) {
  const rect = $('editor').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('editor').close();
} });
$('home-view').addEventListener('click', () => { controls?.reset(); say('처음 시점으로 돌아왔습니다.'); });
$('object-type').addEventListener('change', () => {
  $('object-name').value = names[$('object-type').value];
  $('destination').value = $('object-type').value === 'game' ? 'play' : 'profile';
});
$('add-form').addEventListener('submit', event => {
  event.preventDefault();
  const result = store.add({ type: $('object-type').value, destination: $('destination').value, label: $('object-name').value });
  if (!result.ok) { say(result.reason === 'full' ? '오브젝트는 6개까지 놓을 수 있어요.' : '이름과 오브젝트를 확인해주세요.'); return; }
  updateUI(result); say(`${$('object-name').value}을 놓았습니다. 편집을 닫고 방 안에서 확인해보세요.`);
});
$('empty-room').addEventListener('click', () => { $('reset-confirm').hidden = false; $('cancel-reset').focus(); });
$('cancel-reset').addEventListener('click', () => { $('reset-confirm').hidden = true; $('empty-room').focus(); });
$('confirm-reset').addEventListener('click', () => { updateUI(store.reset()); $('add-object').focus(); say('배치를 비웠습니다.'); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') $('quick-links').open = false; });

function showFallback() {
  $('loading').hidden = true;
  $('loading').style.display = 'none';
  $('fallback').hidden = false;
  $('labels').hidden = true;
  $('scene').hidden = true;
  $('edit').disabled = true;
  $('home-view').disabled = true;
  document.body.dataset.ready = 'fallback';
  controls?.destroy();
  room?.destroy();
}

try {
  const { createRoom, START_VIEW } = await import('./room.js');
  room = createRoom($('scene'), {
    onProjection: positions => {
      for (const point of positions) {
        const label = [...$('labels').children].find(element => element.dataset.id === point.id);
        if (label) { label.hidden = !point.visible; label.style.left = `${point.x}px`; label.style.top = `${point.y}px`; }
      }
    },
    onContextLost: showFallback,
  });
  controls = attachViewControls($('scene'), {
    initialView: START_VIEW,
    onView: (view, direction) => room.look(direction),
    onPick: ({ clientX, clientY }) => {
      const id = room.pick(clientX, clientY), object = store.snapshot().objects.find(item => item.id === id);
      if (object) location.assign(DESTINATIONS[object.destination]);
    },
  });
  updateUI();
  $('edit').disabled = false;
  $('loading').style.display = 'none';
  document.body.dataset.ready = 'room';
  // Explicit opt-in diagnostics for repeatable preview QA; no storage or secrets.
  if (new URLSearchParams(location.search).has('inspect')) {
    window.studioInspect = () => ({ ...room.inspect(), view: controls.getView(), stored: store.snapshot() });
    window.studioPick = (x, y) => room.pick(x, y);
  }
  window.addEventListener('pagehide', event => { if (!event.persisted) { controls.destroy(); room.destroy(); } });
} catch (error) {
  console.warn('Studio preview could not initialize:', error.message);
  showFallback();
}
