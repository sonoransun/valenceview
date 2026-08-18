/* Valence View — VV.Anim: the single rAF loop + sim clock.
 * clock.t is in SECONDS (display time; physics owns real omegas/energies,
 * the renderer maps them to visible periods). speed is a continuous float
 * (UI slider 0.1..3). Render-on-demand: the loop always ticks while visible,
 * but frameFn decides whether to issue GL work (it receives the dirty flag).
 * Tab hidden -> rAF cancelled entirely; resumed on visibilitychange. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  const clock = { t: 0, speed: 1, playing: true };

  let frameFn = null;
  let rafId = 0;
  let last = 0;
  let dirty = true;
  let started = false;

  const hasRaf = typeof requestAnimationFrame === 'function';

  function tick() {
    rafId = hasRaf ? requestAnimationFrame(tick) : 0;
    const now = VV.now();
    const dtWall = Math.min(now - last, 100) / 1000; // clamp tab-switch gaps
    last = now;
    if (clock.playing) clock.t += dtWall * clock.speed;
    if (frameFn) frameFn(dtWall, clock, dirty);
    dirty = false;
  }

  function start(fn) {
    frameFn = fn;
    if (started) return;
    started = true;
    last = VV.now();
    dirty = true;
    if (hasRaf) rafId = requestAnimationFrame(tick);
  }

  function stop() {
    started = false;
    if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function markDirty() {
    dirty = true;
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
        rafId = 0;
      } else if (started && !rafId && hasRaf) {
        last = VV.now();
        dirty = true;
        rafId = requestAnimationFrame(tick);
      }
    });
  }

  VV.Anim = {
    clock: clock,
    start: start,
    stop: stop,
    markDirty: markDirty,
  };
})();
