// A first-person look controller. The scene owns a fixed camera position;
// this module only emits a unit viewing direction and intentional clicks.
export const INITIAL_VIEW = Object.freeze({ yaw: 0, pitch: 0 });
export const PITCH_LIMIT = Math.PI * 5 / 12;

export function normalizeView({ yaw, pitch }) {
  return {
    yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)),
    pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch)),
  };
}

export function viewDirection({ yaw, pitch }) {
  const horizontal = Math.cos(pitch);
  return { x: Math.sin(yaw) * horizontal, y: Math.sin(pitch), z: -Math.cos(yaw) * horizontal };
}

export function attachViewControls(element, {
  onView = () => {}, onPick = () => {}, initialView = INITIAL_VIEW,
  dragThreshold = 7, radiansPerPixel = 0.004,
} = {}) {
  let view = normalizeView(initialView), gesture = null, destroyed = false;
  const pointers = new Set(), removeListeners = [];
  const previousTouchAction = element.style.touchAction;
  element.style.touchAction = 'none';
  const listen = (type, handler) => {
    element.addEventListener(type, handler);
    removeListeners.push(() => element.removeEventListener(type, handler));
  };
  const emit = () => onView({ ...view }, viewDirection(view));
  const setView = next => { view = normalizeView(next); emit(); };
  const release = id => {
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
  };
  const cancel = () => {
    gesture = null;
    for (const id of pointers) release(id);
    pointers.clear();
    element.removeAttribute('data-dragging');
  };
  listen('pointerdown', event => {
    if (event.button !== 0) return;
    pointers.add(event.pointerId);
    element.setPointerCapture(event.pointerId);
    if (pointers.size > 1) {
      // A pinch/multi-touch gesture must never become a navigation click.
      gesture = null;
      element.removeAttribute('data-dragging');
      return;
    }
    element.focus({ preventScroll: true });
    gesture = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      start: { ...view }, dragged: false,
    };
  });
  listen('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (Math.hypot(dx, dy) >= dragThreshold) gesture.dragged = true;
    if (!gesture.dragged) return;
    element.setAttribute('data-dragging', '');
    setView({ yaw: gesture.start.yaw - dx * radiansPerPixel, pitch: gesture.start.pitch + dy * radiansPerPixel });
  });
  listen('pointerup', event => {
    const completed = gesture?.id === event.pointerId ? gesture : null;
    gesture = null;
    pointers.delete(event.pointerId);
    release(event.pointerId);
    element.removeAttribute('data-dragging');
    if (!completed || completed.dragged) return;
    // Check the final displacement as well, even if pointermove was coalesced.
    if (Math.hypot(event.clientX - completed.x, event.clientY - completed.y) >= dragThreshold) return;
    const rect = element.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    onPick({ clientX: event.clientX, clientY: event.clientY });
  });
  listen('pointercancel', cancel);
  listen('lostpointercapture', event => {
    pointers.delete(event.pointerId);
    if (gesture?.id === event.pointerId) {
      gesture = null;
      element.removeAttribute('data-dragging');
    }
  });
  listen('blur', cancel);
  listen('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const step = Math.PI / 36;
    let next = { ...view };
    switch (event.key) {
      case 'ArrowLeft': next.yaw -= step; break;
      case 'ArrowRight': next.yaw += step; break;
      case 'ArrowUp': next.pitch += step; break;
      case 'ArrowDown': next.pitch -= step; break;
      case 'Home': next = initialView; break;
      default: return;
    }
    event.preventDefault();
    cancel();
    setView(next);
  });
  emit();
  return {
    getView: () => ({ ...view }),
    reset: () => { if (!destroyed) { cancel(); setView(initialView); } },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      cancel();
      removeListeners.forEach(remove => remove());
      element.style.touchAction = previousTouchAction;
    },
  };
}
