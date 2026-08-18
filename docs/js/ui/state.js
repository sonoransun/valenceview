/* Valence View — VV.store: tiny pub/sub state container.
 * Top-level shape is FROZEN by contract (contracts.md §7); shallow-merge per
 * top-level key. Subscribers get (state, changedKeys, source, meta). */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  const defaults = {
    element: 6,
    orbital: '2p_z',
    viz: {
      tab: '3d', mode: 'points', colorMode: 'sign', quality: 'med',
      showAxes: true, showNucleus: true, plot2d: 'radial', plane: 'xz',
      isoMode: 'prob', isoFrac: 0.9, isoK: 0.1, transparent: true,
    },
    anim: { playing: true, speed: 1 },
    field: { enabled: false, logB: 1 },
    comp: {
      enabled: false, mode: 'mo', z: 1, dist: 2.0,
      combo: 'bonding', hybrid: 'sp3', hybridIndex: 0,
      topology: 'chain', nAtoms: 6, k: 0,
    },
    // composite viewing: keys = canonical orbital keys of the CURRENT element
    multi: { enabled: false, keys: [] },
  };

  const OBJ_KEYS = ['viz', 'anim', 'field', 'comp', 'multi'];
  const SCALAR_KEYS = ['element', 'orbital'];

  const state = {
    element: defaults.element,
    orbital: defaults.orbital,
    viz: Object.assign({}, defaults.viz),
    anim: Object.assign({}, defaults.anim),
    field: Object.assign({}, defaults.field),
    comp: Object.assign({}, defaults.comp),
    multi: { enabled: defaults.multi.enabled, keys: defaults.multi.keys.slice() },
  };

  const subs = [];
  let rule = null;

  function snapshot() {
    return Object.freeze({
      element: state.element,
      orbital: state.orbital,
      viz: Object.freeze(Object.assign({}, state.viz)),
      anim: Object.freeze(Object.assign({}, state.anim)),
      field: Object.freeze(Object.assign({}, state.field)),
      comp: Object.freeze(Object.assign({}, state.comp)),
      multi: Object.freeze({
        enabled: state.multi.enabled,
        keys: Object.freeze(state.multi.keys.slice()),
      }),
    });
  }

  function sameArray(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function applyPatch(patch) {
    const changed = [];
    for (const k of SCALAR_KEYS) {
      if (patch[k] !== undefined && patch[k] !== state[k]) {
        state[k] = patch[k];
        changed.push(k);
      }
    }
    for (const k of OBJ_KEYS) {
      const p = patch[k];
      if (!p || typeof p !== 'object') continue;
      let any = false;
      for (const sk of Object.keys(p)) {
        if (!(sk in state[k])) continue; // unknown subkeys dropped
        if (p[sk] === undefined || p[sk] === state[k][sk]) continue;
        if (Array.isArray(state[k][sk])) {
          if (!Array.isArray(p[sk])) continue; // malformed patch value dropped
          if (sameArray(p[sk], state[k][sk])) continue; // content-equal: no change
          state[k][sk] = p[sk].slice(); // own copy — caller cannot mutate state
        } else {
          state[k][sk] = p[sk];
        }
        changed.push(k + '.' + sk);
        any = true;
      }
      if (any) changed.push(k);
    }
    return changed;
  }

  function matches(keys, changed) {
    for (const want of keys) {
      if (want === '*') return true;
      for (const got of changed) {
        if (got === want) return true;
        // subscriber to 'viz' matches 'viz.quality'
        if (got.lastIndexOf(want + '.', 0) === 0) return true;
      }
    }
    return false;
  }

  VV.store = {
    defaults: defaults,

    get: function () { return snapshot(); },

    // Optional pre-commit transform (mutual-exclusion etc.), set by app.js.
    setRule: function (fn) { rule = fn; },

    set: function (patch, source, opts) {
      if (!patch || typeof patch !== 'object') return;
      if (rule) {
        // rule may return a replacement patch or mutate a shallow copy
        const copy = Object.assign({}, patch);
        const out = rule(copy, snapshot());
        patch = out || copy;
      }
      const changed = applyPatch(patch);
      if (!changed.length) return;
      const snap = snapshot();
      const meta = { transient: !!(opts && opts.transient) };
      // iterate over a copy so subscribe/unsubscribe during notify is safe
      const list = subs.slice();
      for (const s of list) {
        if (!s.active) continue;
        if (matches(s.keys, changed)) {
          try {
            s.fn(snap, changed, source || null, meta);
          } catch (e) {
            if (typeof console !== 'undefined') console.error('VV.store subscriber failed:', e);
          }
        }
      }
    },

    subscribe: function (keys, fn) {
      const rec = { keys: keys.slice(), fn: fn, active: true };
      subs.push(rec);
      return function () {
        rec.active = false;
        const i = subs.indexOf(rec);
        if (i >= 0) subs.splice(i, 1);
      };
    },
  };
})();
