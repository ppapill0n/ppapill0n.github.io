import { advance, physics, wrap } from '../../common/motion.js';
export { wrap } from '../../common/motion.js';
export class InertiaDial {
  constructor(element, onChange, buttons = []) {
    this.element = element;
    this.onChange = onChange;
    this.position = 0;
    this.velocity = 0;
    this.holdTime = 0;
    this.inputs = new Map();
    this.pointers = new Map();
    this.frame = null;
    this.events = new AbortController();
    const listen = (target, name, handler) => target.addEventListener(name, handler, { signal:this.events.signal });
    const scope = element.closest('[data-game-input-scope]') ?? element.closest('main');
    listen(scope, 'keydown', event => this.key(event));
    listen(scope, 'focusout', event => { if (!scope.contains(event.relatedTarget)) this.stop(); });
    listen(window, 'keyup', event => this.release(`key:${event.code || event.key}`));
    listen(window, 'blur', () => this.stop());
    listen(window, 'pagehide', () => this.stop());
    listen(document, 'visibilitychange', () => { if (document.hidden) this.stop(); });
    buttons.forEach(button => {
      const direction = Number(button.dataset.direction);
      listen(button, 'pointerdown', event => {
        if (event.button !== 0 || this.pointers.has(event.pointerId)) return;
        event.preventDefault();
        button.focus({ preventScroll:true });
        button.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, button);
        this.press(`pointer:${event.pointerId}`, direction);
      });
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        listen(button, name, event => this.releasePointer(event.pointerId));
      }
      listen(button, 'contextmenu', event => event.preventDefault());
    });
  }
  direction() {
    const values = [...this.inputs.values()];
    return Number(values.includes(1)) - Number(values.includes(-1));
  }
  getState() { return { value:wrap(Math.round(this.position)), stopped:!this.inputs.size && this.velocity === 0 }; }
  emit() { this.onChange(this.getState()); }
  press(id, direction) {
    if (this.inputs.has(id)) return;
    const before = this.direction();
    const idle = !this.inputs.size && !this.velocity;
    this.inputs.set(id, direction);
    if (before !== this.direction()) this.holdTime = 0;
    if (idle) this.velocity = direction * physics.initialSpeed;
    this.emit();
    this.animate();
  }
  release(id) {
    const before = this.direction();
    if (!this.inputs.delete(id)) return;
    if (before !== this.direction()) this.holdTime = 0;
    this.emit();
    this.animate();
  }
  releasePointer(id) {
    const button = this.pointers.get(id);
    if (!button) return;
    this.pointers.delete(id);
    this.release(`pointer:${id}`);
    if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
  }
  key(event) {
    let direction = { ArrowUp:1, ArrowRight:1, ArrowDown:-1, ArrowLeft:-1 }[event.key];
    if (!direction && [' ', 'Enter'].includes(event.key)) direction = Number(event.target.dataset.direction);
    if (!direction) return;
    event.preventDefault();
    if (!event.repeat) this.press(`key:${event.code || event.key}`, direction);
  }
  animate() {
    if (this.frame !== null) return;
    this.lastFrame = performance.now();
    this.frame = requestAnimationFrame(time => this.tick(time));
  }
  tick(time) {
    this.frame = null;
    const dt = Math.min(0.05, Math.max(0, (time - this.lastFrame) / 1000));
    this.lastFrame = time;
    Object.assign(this, advance(this, this.direction(), dt));
    if (!this.inputs.size && !this.velocity) this.snap();
    else { this.emit(); this.frame = requestAnimationFrame(next => this.tick(next)); }
  }
  snap() { this.position = wrap(Math.round(this.position)); this.emit(); }
  stop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.inputs.clear();
    const pointers = [...this.pointers];
    this.pointers.clear();
    for (const [id, button] of pointers) if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
    this.velocity = 0;
    this.holdTime = 0;
    this.snap();
  }
  destroy() { this.stop(); this.events.abort(); }
  reset(value) { this.stop(); this.position = wrap(Math.round(value)); this.emit(); }
}
