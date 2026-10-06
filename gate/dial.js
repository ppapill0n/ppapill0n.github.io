export const wrap = value => ((value % 10000) + 10000) % 10000;
export class InertiaDial {
  constructor(element, onChange) {
    this.element = element;
    this.onChange = onChange;
    this.position = 0;
    this.velocity = 0;
    this.pointer = null;
    this.keys = new Set();
    this.frame = null;
    element.addEventListener('pointerdown', event => this.grab(event));
    element.addEventListener('pointermove', event => this.move(event));
    element.addEventListener('pointerup', event => this.release(event));
    element.addEventListener('pointercancel', event => { if (event.pointerId === this.pointer) this.stop(); });
    element.addEventListener('lostpointercapture', event => { if (event.pointerId === this.pointer) this.stop(); });
    element.addEventListener('keydown', event => this.key(event));
    window.addEventListener('keyup', event => {
      if (this.keys.delete(event.key)) { event.preventDefault(); this.emit(); this.animate(); }
    });
    element.addEventListener('blur', () => this.stop());
    window.addEventListener('blur', () => this.stop());
    window.addEventListener('pagehide', () => this.stop());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop(); });
  }
  getState() {
    return { value: wrap(Math.round(this.position)), stopped: this.pointer === null && !this.keys.size && this.velocity === 0 };
  }
  emit() { this.onChange(this.getState()); }
  angle(event) {
    const rect = this.element.getBoundingClientRect();
    return Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2);
  }
  grab(event) {
    if (event.button !== 0 || this.pointer !== null) return;
    event.preventDefault();
    this.stop();
    this.element.focus({ preventScroll: true });
    this.pointer = event.pointerId;
    this.element.setPointerCapture(event.pointerId);
    this.lastAngle = this.angle(event);
    this.lastMove = event.timeStamp;
    this.emit();
  }
  move(event) {
    if (event.pointerId !== this.pointer) return;
    const angle = this.angle(event);
    const delta = Math.atan2(Math.sin(angle - this.lastAngle), Math.cos(angle - this.lastAngle));
    const amount = delta * 1200;
    const elapsed = Math.max(0.008, (event.timeStamp - this.lastMove) / 1000);
    this.position = wrap(this.position + amount);
    this.velocity = Math.max(-5000, Math.min(5000, amount / elapsed));
    this.lastAngle = angle;
    this.lastMove = event.timeStamp;
    this.emit();
  }
  release(event) {
    if (event.pointerId !== this.pointer) return;
    this.pointer = null;
    if (this.element.hasPointerCapture(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
    if (event.timeStamp - this.lastMove > 120 || Math.abs(this.velocity) < 1) this.velocity = 0;
    if (!this.velocity) this.snap();
    else { this.emit(); this.animate(); }
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
    const positive = this.keys.has('ArrowUp') || this.keys.has('ArrowRight');
    const negative = this.keys.has('ArrowDown') || this.keys.has('ArrowLeft');
    const direction = Number(positive) - Number(negative);
    const friction = direction ? 1.6 : 6;
    const terminal = direction * 2000 / friction;
    const decay = Math.exp(-friction * dt);
    this.position = wrap(this.position + terminal * dt + (this.velocity - terminal) * (1 - decay) / friction);
    this.velocity = terminal + (this.velocity - terminal) * decay;
    if (!direction && Math.abs(this.velocity) < 1) this.velocity = 0;
    if (!this.keys.size && !this.velocity) this.snap();
    else {
      this.emit();
      this.frame = requestAnimationFrame(next => this.tick(next));
    }
  }
  key(event) {
    if (!['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].includes(event.key)) return;
    event.preventDefault();
    if (this.pointer !== null || event.repeat || this.keys.has(event.key)) return;
    const wasIdle = !this.keys.size && this.velocity === 0;
    this.keys.add(event.key);
    if (wasIdle) this.velocity = ['ArrowUp', 'ArrowRight'].includes(event.key) ? 80 : -80;
    this.emit();
    this.animate();
  }
  snap() { this.position = wrap(Math.round(this.position)); this.emit(); }
  stop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    const pointer = this.pointer;
    this.pointer = null;
    this.keys.clear();
    this.velocity = 0;
    if (pointer !== null && this.element.hasPointerCapture(pointer)) this.element.releasePointerCapture(pointer);
    this.snap();
  }
  reset(value) { this.stop(); this.position = wrap(Math.round(value)); this.emit(); }
}
