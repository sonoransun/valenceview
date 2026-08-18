/* Valence View — namespace bootstrap, tiny utilities, shared job scheduler.
 * Every file in this project attaches exactly one sub-namespace to self.VV via
 * this same IIFE pattern (`self`, not `window`, so files also load in workers
 * or a Node shim). Classic deferred scripts only — no modules, no fetch. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  VV.assert = function (cond, msg) {
    if (!cond) throw new Error('VV assert: ' + msg);
  };

  VV.clamp = function (v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  };

  VV.debounce = function (fn, ms) {
    let t = 0;
    const d = function () {
      const args = arguments, self_ = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self_, args); }, ms);
    };
    d.cancel = function () { clearTimeout(t); };
    return d;
  };

  VV.fmt = {
    // Scientific-or-fixed formatting for verify tables and readouts.
    sci: function (x, digits) {
      digits = digits == null ? 6 : digits;
      if (x === 0) return '0';
      if (!isFinite(x)) return String(x);
      const a = Math.abs(x);
      if (a >= 1e-3 && a < 1e5) {
        return String(parseFloat(x.toPrecision(digits)));
      }
      return x.toExponential(digits - 1);
    },
    num: function (x, digits) {
      digits = digits == null ? 4 : digits;
      return isFinite(x) ? String(parseFloat(x.toPrecision(digits))) : String(x);
    },
  };

  const now = (typeof performance !== 'undefined' && performance.now)
    ? function () { return performance.now(); }
    : function () { return Date.now(); };
  VV.now = now;

  /* VV.sched — the single cooperative job queue shared by sampling, iso-grid
   * builds, heatmap fills and the verify runner. A job is a function
   * step(deadlineMs) that works until VV.now() >= deadlineMs and returns true
   * when finished. Jobs run round-robin inside one 6 ms slice per tick. */
  const queue = [];
  let pumping = false;
  const BUDGET_MS = 6;

  function pump() {
    const sliceEnd = now() + BUDGET_MS;
    while (queue.length && now() < sliceEnd) {
      const job = queue[0];
      if (job.cancelled) { queue.shift(); continue; }
      let done = false;
      try {
        done = job.step(sliceEnd);
      } catch (e) {
        queue.shift();
        job.reject(e);
        continue;
      }
      if (done) {
        queue.shift();
        job.resolve();
      } else {
        // rotate so long jobs don't starve later ones
        queue.push(queue.shift());
      }
    }
    if (queue.length) {
      setTimeout(pump, 0);
    } else {
      pumping = false;
    }
  }

  VV.sched = {
    submit: function (step, opts) {
      opts = opts || {};
      const job = { step: step, owner: opts.owner || null, cancelled: false };
      job.promise = new Promise(function (res, rej) { job.resolve = res; job.reject = rej; });
      // avoid unhandled-rejection noise for fire-and-forget jobs
      job.promise.catch(function () {});
      queue.push(job);
      if (!pumping) { pumping = true; setTimeout(pump, 0); }
      return {
        promise: job.promise,
        cancel: function () {
          if (!job.cancelled) {
            job.cancelled = true;
            job.reject(new Error('cancelled'));
          }
        },
      };
    },
    cancelOwner: function (owner) {
      for (const job of queue) {
        if (job.owner === owner && !job.cancelled) {
          job.cancelled = true;
          job.reject(new Error('cancelled'));
        }
      }
    },
    pending: function () { return queue.filter(function (j) { return !j.cancelled; }).length; },
  };
})();
