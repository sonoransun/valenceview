/* Valence View — VV.Sample: exact i.i.d. orbital sampling (no Metropolis).
 * Single state: inverse-CDF radial (P(r)=r^2 R^2 tabulated) x angular
 * rejection against a scanned |Ylm|^2 max. Multi-term LCAO: mixture proposal
 * q = sum w_i |psi_i|^2 with the Cauchy-Schwarz envelope
 * |sum c_i psi_i|^2 <= K sum |c_i|^2 |psi_i|^2, so acceptance >= 1/K.
 * State closures are LOCAL: state.psi/absYlm are evaluated in the state's own
 * frame; sampling applies an optional `postScale` [sx,sy,sz] (single-state
 * only, e.g. the B-field squeeze) to the local point, then `orient` (9-el
 * column-major 3x3, local->world, may be null), then adds `origin`.
 * Emitted layout per point (6 floats, 24 B):
 * x, y, z (world, a0), re, im (total psi at the point), invDen = 1/q. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  // Standard 32-bit mixer; reproducible clouds across reloads/crossfades.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* radialCDF(PrFn, rMax, N) -> {r, cdf} — trapezoid-accumulated, normalized.
   * PrFn(r) = r^2 R^2 (>= 0). */
  function radialCDF(PrFn, rMax, N) {
    N = N || 2048;
    const r = new Float32Array(N);
    const cdf = new Float32Array(N);
    const dr = rMax / (N - 1);
    let acc = 0, prev = Math.max(0, PrFn(0));
    r[0] = 0; cdf[0] = 0;
    for (let i = 1; i < N; i++) {
      const ri = i * dr;
      const p = Math.max(0, PrFn(ri));
      acc += 0.5 * (prev + p) * dr;
      prev = p;
      r[i] = ri;
      cdf[i] = acc;
    }
    const total = acc || 1;
    for (let i = 0; i < N; i++) cdf[i] /= total;
    cdf[N - 1] = 1;
    return { r: r, cdf: cdf };
  }

  // Inverse-CDF draw: binary search + linear interpolation.
  function sampleRadial(tab, u) {
    const cdf = tab.cdf, r = tab.r;
    let lo = 0, hi = cdf.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid; else hi = mid;
    }
    const c0 = cdf[lo], c1 = cdf[hi];
    const t = c1 > c0 ? (u - c0) / (c1 - c0) : 0.5;
    return r[lo] + (r[hi] - r[lo]) * t;
  }

  // One-time 64x128 (theta x phi) scan for max |Ylm|; 1.05 safety headroom.
  function scanYmax2(absYlm) {
    let m = 0;
    for (let i = 0; i < 64; i++) {
      const theta = Math.PI * (i + 0.5) / 64;
      for (let j = 0; j < 128; j++) {
        const phi = 2 * Math.PI * (j + 0.5) / 128;
        const a = Math.abs(absYlm(theta, phi));
        if (a > m) m = a;
      }
    }
    const y2 = 1.05 * m * m;
    return y2 > 0 ? y2 : 1;
  }

  function psiVal(fn, x, y, z, out) {
    const v = fn(x, y, z);
    if (typeof v === 'number') { out.re = v; out.im = 0; } else { out.re = v.re; out.im = v.im; }
  }

  /* stream(cfg, onChunk, onDone) -> {cancel()}
   * cfg = { states:[{psi, Pr, absYlm, rMax, origin, orient, postScale?}],
   *         coeffs:[{re,im}], count, seed, chunkSize, owner? }
   * onChunk(Float32Array n*6); onDone({count, proposals, acceptance}). */
  function stream(cfg, onChunk, onDone) {
    const states = cfg.states;
    const K = states.length;
    VV.assert(K >= 1, 'stream needs >= 1 state');
    const coeffs = cfg.coeffs && cfg.coeffs.length === K
      ? cfg.coeffs
      : states.map(function () { return { re: 1, im: 0 }; });
    const count = cfg.count;
    const chunkSize = cfg.chunkSize || 8192;
    const rng = mulberry32(cfg.seed == null ? 1 : cfg.seed);

    // toLocal has no postScale inverse, so the mixture path cannot use it
    // (field and companion modes are mutually exclusive: K is 1 with squeeze)
    if (K > 1) {
      for (let i = 0; i < K; i++) {
        VV.assert(!states[i].postScale, 'stream: postScale needs a single state');
      }
    }

    // per-state prep (lazy, done inside the first sched step)
    let prep = null;
    function prepare() {
      let sumC2 = 0;
      const c2 = new Float64Array(K);
      for (let i = 0; i < K; i++) {
        c2[i] = coeffs[i].re * coeffs[i].re + coeffs[i].im * coeffs[i].im;
        sumC2 += c2[i];
      }
      VV.assert(sumC2 > 0, 'stream: all coefficients zero');
      const wCum = new Float64Array(K); // cumulative component weights
      let acc = 0;
      for (let i = 0; i < K; i++) { acc += c2[i] / sumC2; wCum[i] = acc; }
      wCum[K - 1] = 1;
      prep = {
        c2: c2, sumC2: sumC2, wCum: wCum,
        // s.rMax may be a number or the model's rMax(frac) closure
        tabs: states.map(function (s) {
          const rm = typeof s.rMax === 'function' ? s.rMax(0.999) : s.rMax;
          VV.assert(isFinite(rm) && rm > 0, 'stream: bad rMax ' + rm);
          return radialCDF(s.Pr, rm, 2048);
        }),
        ymax2: states.map(function (s) { return scanYmax2(s.absYlm); }),
      };
    }

    let emitted = 0, proposals = 0;
    let chunk = new Float32Array(Math.min(chunkSize, count) * 6);
    let fill = 0;
    const tmp = { re: 0, im: 0 };
    const single = K === 1;

    // Draw one point from state i's |psi_i|^2 (local frame), return local xyz.
    function drawLocal(i, out) {
      const s = states[i];
      const tab = prep.tabs[i], y2 = prep.ymax2[i];
      const r = sampleRadial(tab, rng());
      // angular rejection: uniform sphere proposal, accept ~ |Y|^2/Ymax^2
      for (let tries = 0; tries < 256; tries++) {
        const ct = 2 * rng() - 1;
        const phi = 2 * Math.PI * rng();
        const theta = Math.acos(ct);
        const a = Math.abs(s.absYlm(theta, phi));
        if (rng() * y2 <= a * a) {
          const st = Math.sqrt(Math.max(0, 1 - ct * ct));
          out[0] = r * st * Math.cos(phi);
          out[1] = r * st * Math.sin(phi);
          out[2] = r * ct;
          return;
        }
      }
      // pathological absYlm: fall back to an unweighted direction
      const ct = 2 * rng() - 1, phi = 2 * Math.PI * rng();
      const st = Math.sqrt(Math.max(0, 1 - ct * ct));
      out[0] = r * st * Math.cos(phi); out[1] = r * st * Math.sin(phi); out[2] = r * ct;
    }

    function toWorld(i, local, out) {
      const s = states[i];
      const o = s.origin || [0, 0, 0];
      const ps = s.postScale;
      const lx = ps ? local[0] * ps[0] : local[0];
      const ly = ps ? local[1] * ps[1] : local[1];
      const lz = ps ? local[2] * ps[2] : local[2];
      const m = s.orient;
      if (m) {
        out[0] = m[0] * lx + m[3] * ly + m[6] * lz + o[0];
        out[1] = m[1] * lx + m[4] * ly + m[7] * lz + o[1];
        out[2] = m[2] * lx + m[5] * ly + m[8] * lz + o[2];
      } else {
        out[0] = lx + o[0]; out[1] = ly + o[1]; out[2] = lz + o[2];
      }
    }

    function toLocal(i, world, out) {
      const s = states[i];
      const o = s.origin || [0, 0, 0];
      const dx = world[0] - o[0], dy = world[1] - o[1], dz = world[2] - o[2];
      const m = s.orient;
      if (m) { // transpose = inverse for rotations
        out[0] = m[0] * dx + m[1] * dy + m[2] * dz;
        out[1] = m[3] * dx + m[4] * dy + m[5] * dz;
        out[2] = m[6] * dx + m[7] * dy + m[8] * dz;
      } else {
        out[0] = dx; out[1] = dy; out[2] = dz;
      }
    }

    const local = [0, 0, 0], world = [0, 0, 0], lj = [0, 0, 0];

    // Emits one accepted sample into chunk; returns true if one was emitted.
    function emitOne() {
      if (single) {
        proposals++;
        drawLocal(0, local);
        toWorld(0, local, world);
        psiVal(states[0].psi, local[0], local[1], local[2], tmp);
        const c = coeffs[0];
        const re = c.re * tmp.re - c.im * tmp.im;
        const im = c.re * tmp.im + c.im * tmp.re;
        // q = |psi_0|^2 (normalized density); w = |c psi|^2/q = |c|^2 (const)
        const q = tmp.re * tmp.re + tmp.im * tmp.im;
        chunk[fill++] = world[0]; chunk[fill++] = world[1]; chunk[fill++] = world[2];
        chunk[fill++] = re; chunk[fill++] = im;
        chunk[fill++] = 1 / Math.max(q, 1e-30);
        return true;
      }
      proposals++;
      // pick component ~ w_i, draw from |psi_i|^2
      const u = rng();
      let i = 0;
      while (i < K - 1 && prep.wCum[i] < u) i++;
      drawLocal(i, local);
      toWorld(i, local, world);
      // total psi and mixture density q at world point
      let re = 0, im = 0, den = 0;
      for (let j = 0; j < K; j++) {
        toLocal(j, world, lj);
        psiVal(states[j].psi, lj[0], lj[1], lj[2], tmp);
        const c = coeffs[j];
        re += c.re * tmp.re - c.im * tmp.im;
        im += c.re * tmp.im + c.im * tmp.re;
        den += (prep.c2[j] / prep.sumC2) * (tmp.re * tmp.re + tmp.im * tmp.im);
      }
      // Cauchy-Schwarz envelope: |psi|^2 <= K * sumC2 * q
      const p2 = re * re + im * im;
      const envelope = K * prep.sumC2 * Math.max(den, 1e-300);
      if (rng() * envelope > p2) return false;
      chunk[fill++] = world[0]; chunk[fill++] = world[1]; chunk[fill++] = world[2];
      chunk[fill++] = re; chunk[fill++] = im;
      chunk[fill++] = 1 / Math.max(den, 1e-30);
      return true;
    }

    function flush() {
      if (fill === 0) return;
      onChunk(fill === chunk.length ? chunk : chunk.slice(0, fill));
      chunk = new Float32Array(Math.min(chunkSize, count - emitted) * 6 || 6);
      fill = 0;
    }

    const job = VV.sched.submit(function (deadline) {
      if (!prep) prepare();
      while (emitted < count && VV.now() < deadline) {
        // inner batch so we don't hit the clock every sample
        for (let b = 0; b < 512 && emitted < count; b++) {
          if (emitOne()) {
            emitted++;
            if (fill === chunk.length) flush();
          }
        }
      }
      if (emitted < count) return false;
      flush();
      if (onDone) onDone({ count: emitted, proposals: proposals, acceptance: emitted / Math.max(1, proposals) });
      return true;
    }, { owner: cfg.owner || 'sample' });

    return { cancel: job.cancel, promise: job.promise };
  }

  VV.Sample = {
    mulberry32: mulberry32,
    radialCDF: radialCDF,
    sampleRadial: sampleRadial,
    scanYmax2: scanYmax2,
    stream: stream,
  };
})();
