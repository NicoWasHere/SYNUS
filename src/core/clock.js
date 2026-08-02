// Base clock. Every listener can declare a rate divisor: rate=1 runs
// every frame, rate=4 runs every 4th frame.
export class Clock {
  constructor() {
    this.frame = 0;
    this.listeners = [];
    this.running = false;
  }
  onTick(fn, rate = 1) {
    this.listeners.push({ fn, rate });
  }
  start() {
    this.running = true;
    const loop = (tMs) => {
      if (!this.running) return;
      this.frame++;
      const time = tMs / 1000;
      for (const { fn, rate } of this.listeners) {
        if (this.frame % rate === 0) fn(time, this.frame);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
  }
}
