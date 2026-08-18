/* Valence View — VV.url: hash <-> state partial.
 * Grammar (contracts.md §7, defaults omitted, order fixed):
 *   #<Sym>-<key>[;b=<logB>][;c=<Sym>:<dist>:<b|a>][;h=<sp|sp2|sp3>:<i>]
 *              [;k=<chain|ring>:<n>:<k>][;v=<tab>.<mode>]
 * The orbital token may be a '+'-joined list (composite mode): unknown keys
 * are dropped individually, 2+ survivors -> multi, 1 -> single, cap 8.
 * multi and companion never coexist: if both parse, multi wins.
 * Strict parse: any malformed/unknown fragment is dropped, the rest kept. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  const FIRST_RE = /^([A-Z][a-z]{0,2})-([a-z0-9_+]+)$/;
  const MAX_KEYS = 8;

  function num(x) {
    // short decimal for hash readability
    const r = Math.round(x * 100) / 100;
    return String(r);
  }

  function validKey(key) {
    if (!VV.hydro || typeof VV.hydro.parseKey !== 'function') return true;
    try {
      const p = VV.hydro.parseKey(key);
      return !!p && typeof p.n === 'number';
    } catch (e) {
      return false;
    }
  }

  function parse(hash) {
    if (!hash) return null;
    let s = hash.charAt(0) === '#' ? hash.slice(1) : hash;
    if (!s) return null;
    try { s = decodeURIComponent(s); } catch (e) { /* keep raw */ }
    const parts = s.split(';');
    const out = {};
    let any = false;

    const m = FIRST_RE.exec(parts[0]);
    if (m) {
      const el = VV.data && VV.data.bySym ? VV.data.bySym(m[1]) : null;
      if (el) {
        out.element = el.z;
        any = true;
        // '+'-joined token: dedupe + drop unknown keys individually, cap 8
        const keys = [];
        for (const k of m[2].split('+')) {
          if (k && validKey(k) && keys.indexOf(k) === -1) keys.push(k);
          if (keys.length >= MAX_KEYS) break;
        }
        if (keys.length > 1) {
          out.multi = { enabled: true, keys: keys };
          out.orbital = keys[0];
        } else if (keys.length === 1) {
          out.orbital = keys[0]; // single mode (unchanged)
        }
        // empty surviving list: fall back to single-mode default (no orbital)
      }
    }

    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      const eq = p.indexOf('=');
      if (eq < 1) continue;
      const k = p.slice(0, eq);
      const v = p.slice(eq + 1);

      if (k === 'b') {
        const lb = parseFloat(v);
        if (isFinite(lb)) {
          out.field = { enabled: true, logB: VV.clamp(lb, -1, 5) };
          any = true;
        }
      } else if (k === 'c') {
        const seg = v.split(':');
        const ce = seg.length === 3 && VV.data && VV.data.bySym ? VV.data.bySym(seg[0]) : null;
        const d = parseFloat(seg[1]);
        if (ce && isFinite(d) && (seg[2] === 'b' || seg[2] === 'a')) {
          out.comp = {
            enabled: true, mode: 'mo', z: ce.z,
            dist: VV.clamp(d, 0.5, 10),
            combo: seg[2] === 'a' ? 'antibonding' : 'bonding',
          };
          any = true;
        }
      } else if (k === 'h') {
        const seg = v.split(':');
        const kind = seg[0];
        const idx = parseInt(seg[1], 10);
        if ((kind === 'sp' || kind === 'sp2' || kind === 'sp3') && isFinite(idx)) {
          const maxI = kind === 'sp' ? 1 : (kind === 'sp2' ? 2 : 3);
          out.comp = {
            enabled: true, mode: 'hybrid', hybrid: kind,
            hybridIndex: VV.clamp(idx, 0, maxI),
          };
          any = true;
        }
      } else if (k === 'k') {
        const seg = v.split(':');
        const topo = seg[0];
        const n = parseInt(seg[1], 10);
        const kk = parseInt(seg[2], 10);
        if ((topo === 'chain' || topo === 'ring') &&
            n >= 3 && n <= 6 && kk >= 0 && kk < n) {
          out.comp = { enabled: true, mode: 'cluster', topology: topo, nAtoms: n, k: kk };
          any = true;
        }
      } else if (k === 'v') {
        const seg = v.split('.');
        const viz = {};
        let ok = false;
        if (seg[0] === '3d' || seg[0] === '2d') { viz.tab = seg[0]; ok = true; }
        if (seg[1] === 'points' || seg[1] === 'iso') { viz.mode = seg[1]; ok = true; }
        if (ok) { out.viz = viz; any = true; }
      }
      // unknown fragment keys are dropped silently
    }
    // composite and companion never coexist: multi wins, comp is dropped
    if (out.multi && out.comp) delete out.comp;
    return any ? out : null;
  }

  function serialize(st) {
    const el = VV.data && VV.data.byZ ? VV.data.byZ(st.element) : null;
    const multiOn = st.multi && st.multi.enabled && st.multi.keys && st.multi.keys.length;
    const token = multiOn ? st.multi.keys.join('+') : st.orbital;
    let h = (el ? el.sym : '?') + '-' + token;
    if (st.field && st.field.enabled) {
      h += ';b=' + num(st.field.logB);
    } else if (st.comp && st.comp.enabled && !multiOn) {
      if (st.comp.mode === 'hybrid') {
        h += ';h=' + st.comp.hybrid + ':' + st.comp.hybridIndex;
      } else if (st.comp.mode === 'cluster') {
        h += ';k=' + st.comp.topology + ':' + st.comp.nAtoms + ':' + st.comp.k;
      } else {
        const ce = VV.data && VV.data.byZ ? VV.data.byZ(st.comp.z) : null;
        h += ';c=' + (ce ? ce.sym : 'H') + ':' + num(st.comp.dist) + ':' +
             (st.comp.combo === 'antibonding' ? 'a' : 'b');
      }
    }
    if (st.viz && (st.viz.tab !== '3d' || st.viz.mode !== 'points')) {
      h += ';v=' + st.viz.tab + '.' + st.viz.mode;
    }
    return h;
  }

  VV.url = {
    parse: parse,
    serialize: serialize,

    read: function () {
      if (typeof location === 'undefined') return null;
      return parse(location.hash);
    },

    write: function (state) {
      if (typeof location === 'undefined') return;
      const h = '#' + serialize(state);
      if (location.hash === h) return;
      try {
        history.replaceState(null, '', h);
      } catch (e) {
        // history API can throw on file:// in some browsers
        location.hash = h;
      }
    },
  };
})();
