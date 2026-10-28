// Local prototype configuration, never an admin system or a publishing API.
export const STORAGE_KEY = 'personal-studio-preview:v1';
export const MAX_OBJECTS = 6;
export const OBJECT_TYPES = Object.freeze(['plant', 'books', 'game']);
export const DESTINATIONS = Object.freeze({
  profile: '/',
  personal: '/personal/',
  play: '/play/',
});

export function validateObjects(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.objects) || value.objects.length > MAX_OBJECTS) return null;
  const ids = new Set(), slots = new Set(), result = [];
  for (const item of value.objects) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(item.id) || ids.has(item.id)
      || !OBJECT_TYPES.includes(item.type) || !Object.hasOwn(DESTINATIONS, item.destination)
      || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 48
      || !Number.isInteger(item.slot) || item.slot < 0 || item.slot >= MAX_OBJECTS || slots.has(item.slot)) return null;
    ids.add(item.id);
    slots.add(item.slot);
    result.push({ id: item.id, type: item.type, destination: item.destination, label: item.label.trim(), slot: item.slot });
  }
  return result;
}

export function createObjectStore({ getStorage = () => localStorage, makeId = () => crypto.randomUUID() } = {}) {
  let objects = [], persistence = 'available';
  try {
    const raw = getStorage().getItem(STORAGE_KEY);
    if (raw !== null) {
      const validated = validateObjects(JSON.parse(raw));
      if (validated) objects = validated;
      else persistence = 'invalid';
    }
  } catch { persistence = 'unavailable'; }
  const snapshot = () => ({ objects: objects.map(item => ({ ...item })), persistence });
  const save = () => {
    try {
      getStorage().setItem(STORAGE_KEY, JSON.stringify({ version: 1, objects }));
      persistence = 'saved';
    } catch { persistence = 'unavailable'; }
    return snapshot();
  };
  return {
    snapshot,
    add({ type, destination, label }) {
      if (objects.length >= MAX_OBJECTS) return { ok: false, reason: 'full', ...snapshot() };
      const slot = Array.from({ length: MAX_OBJECTS }, (_, index) => index).find(index => !objects.some(item => item.slot === index));
      const next = { id: makeId(), type, destination, label, slot };
      const validated = validateObjects({ version: 1, objects: [...objects, next] });
      if (!validated) return { ok: false, reason: 'invalid', ...snapshot() };
      objects = validated;
      return { ok: true, ...save() };
    },
    remove(id) {
      if (!objects.some(item => item.id === id)) return { ok: false, reason: 'missing', ...snapshot() };
      objects = objects.filter(item => item.id !== id);
      return { ok: true, ...save() };
    },
    // The interface must explicitly confirm before calling reset.
    // This only touches our own key; gate/game/session storage is unaffected.
    reset() { objects = []; return save(); },
  };
}
