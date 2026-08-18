/* Valence View — VV.Iso: chunked scalar-grid builder + marching-cubes
 * extraction of |psi| = iso as TWO signed passes (+iso and -iso), which keeps
 * lobes cleanly separated at nodal surfaces and consistently oriented.
 * Grid indexing: values[ix + n*(iy + n*iz)], world x = center - halfSize
 * + 2*halfSize*ix/(n-1) (same for y,z). Deps: VV.MC, VV.sched. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  /* buildGridAsync(cfg, onProgress, onDone) -> {cancel(), promise}
   * cfg = { psi(x,y,z)->number (signed), center:[x,y,z], halfSize, n, owner? }
   * Evaluates z-slabs through VV.sched (6 ms budget shared with everything). */
  function buildGridAsync(cfg, onProgress, onDone) {
    const n = cfg.n;
    const center = cfg.center || [0, 0, 0];
    const halfSize = cfg.halfSize;
    const psi = cfg.psi;
    const values = new Float32Array(n * n * n);
    const step = (2 * halfSize) / (n - 1);
    const x0 = center[0] - halfSize, y0 = center[1] - halfSize, z0 = center[2] - halfSize;
    let iz = 0;
    let vmin = Infinity, vmax = -Infinity;

    const job = VV.sched.submit(function (deadline) {
      while (iz < n && VV.now() < deadline) {
        const z = z0 + iz * step;
        let idx = n * n * iz;
        for (let iy = 0; iy < n; iy++) {
          const y = y0 + iy * step;
          for (let ix = 0; ix < n; ix++) {
            const v = psi(x0 + ix * step, y, z);
            values[idx++] = v;
            if (v < vmin) vmin = v;
            if (v > vmax) vmax = v;
          }
        }
        iz++;
        if (onProgress) onProgress(iz / n);
      }
      if (iz < n) return false;
      const dV = step * step * step;
      const grid = {
        values: values, n: n, center: [center[0], center[1], center[2]],
        halfSize: halfSize, min: vmin, max: vmax, dV: dV, step: step,
      };
      if (onDone) onDone(grid);
      return true;
    }, { owner: cfg.owner || 'iso-grid' });

    return { cancel: job.cancel, promise: job.promise };
  }

  /* Histogram method: one O(n^3) pass; 512 bins of |psi| weighted by psi^2*dV;
   * walk bins from the top until accumulated probability >= frac*total; the
   * returned iso (lower edge of the stopping bin) encloses ~frac of |psi|^2. */
  function chooseIsoByProbability(grid, frac) {
    const v = grid.values;
    const NB = 512;
    const amax = Math.max(Math.abs(grid.min), Math.abs(grid.max));
    if (!(amax > 0)) return 0;
    const hist = new Float64Array(NB);
    const scale = NB / amax;
    for (let i = 0; i < v.length; i++) {
      const a = Math.abs(v[i]);
      let b = (a * scale) | 0;
      if (b >= NB) b = NB - 1;
      hist[b] += v[i] * v[i];
    }
    let total = 0;
    for (let b = 0; b < NB; b++) total += hist[b];
    const want = frac * total;
    let acc = 0;
    for (let b = NB - 1; b >= 0; b--) {
      acc += hist[b];
      if (acc >= want) return (b * amax) / NB;
    }
    return 0;
  }

  function isoFromMax(grid, k) {
    const amax = Math.max(Math.abs(grid.min), Math.abs(grid.max));
    return k * amax;
  }

  // Growable Float32Array (amortized push of 6-float vertices).
  function makeSink(initial) {
    return { a: new Float32Array(initial || 65536), len: 0 };
  }
  function sinkEnsure(s, extra) {
    if (s.len + extra > s.a.length) {
      let cap = s.a.length * 2;
      while (cap < s.len + extra) cap *= 2;
      const b = new Float32Array(cap);
      b.set(s.a.subarray(0, s.len));
      s.a = b;
    }
  }

  /* Marches sign*values at +isoAbs. With the Bourke tables (bit set when value
   * below iso) triangle winding faces the below-iso region, i.e. outward from
   * the lobe; the -iso pass marches the negated field, which is exactly the
   * "flipped winding" second pass. Normals: n = normalize(-sign * grad psi),
   * central differences, lerped along the crossed edge. */
  function marchSigned(grid, isoAbs, sign) {
    const MC = VV.MC;
    const n = grid.n, v = grid.values, step = grid.step;
    const x0 = grid.center[0] - grid.halfSize;
    const y0 = grid.center[1] - grid.halfSize;
    const z0 = grid.center[2] - grid.halfSize;
    const nn = n * n;
    const sink = makeSink();
    let cx = 0, cy = 0, cz = 0, vtx = 0; // centroid accumulator

    // gradient of the RAW field at grid node (one-sided at boundaries)
    function grad(ix, iy, iz, out) {
      const i = ix + n * (iy + n * iz);
      const xm = ix > 0 ? v[i - 1] : v[i], xp = ix < n - 1 ? v[i + 1] : v[i];
      const ym = iy > 0 ? v[i - n] : v[i], yp = iy < n - 1 ? v[i + n] : v[i];
      const zm = iz > 0 ? v[i - nn] : v[i], zp = iz < n - 1 ? v[i + nn] : v[i];
      const dx = ix > 0 && ix < n - 1 ? 2 : 1;
      const dy = iy > 0 && iy < n - 1 ? 2 : 1;
      const dz = iz > 0 && iz < n - 1 ? 2 : 1;
      out[0] = (xp - xm) / (dx * step);
      out[1] = (yp - ym) / (dy * step);
      out[2] = (zp - zm) / (dz * step);
    }

    const corner = MC.CORNER, ec = MC.EDGE_CORNERS;
    const cval = new Float64Array(8);
    const cix = new Int32Array(8), ciy = new Int32Array(8), ciz = new Int32Array(8);
    const eP = new Float64Array(12 * 3); // interpolated point per edge
    const eN = new Float64Array(12 * 3); // interpolated normal per edge
    const gA = [0, 0, 0], gB = [0, 0, 0];

    for (let iz = 0; iz < n - 1; iz++) {
      for (let iy = 0; iy < n - 1; iy++) {
        let base = 0 + n * (iy + n * iz);
        for (let ix = 0; ix < n - 1; ix++, base++) {
          let cube = 0;
          for (let c = 0; c < 8; c++) {
            const ox = ix + corner[c][0], oy = iy + corner[c][1], oz = iz + corner[c][2];
            const val = sign * v[ox + n * (oy + n * oz)];
            cval[c] = val;
            cix[c] = ox; ciy[c] = oy; ciz[c] = oz;
            if (val < isoAbs) cube |= 1 << c;
          }
          const edges = MC.EDGE_TABLE[cube];
          if (edges === 0) continue;

          for (let e = 0; e < 12; e++) {
            if (!(edges & (1 << e))) continue;
            const a = ec[e][0], b = ec[e][1];
            const va = cval[a], vb = cval[b];
            let t = (isoAbs - va) / (vb - va);
            if (!isFinite(t)) t = 0.5;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            eP[e * 3] = x0 + (cix[a] + (cix[b] - cix[a]) * t) * step;
            eP[e * 3 + 1] = y0 + (ciy[a] + (ciy[b] - ciy[a]) * t) * step;
            eP[e * 3 + 2] = z0 + (ciz[a] + (ciz[b] - ciz[a]) * t) * step;
            grad(cix[a], ciy[a], ciz[a], gA);
            grad(cix[b], ciy[b], ciz[b], gB);
            // n = -sign * grad(psi), lerped then normalized
            let nx = -sign * (gA[0] + (gB[0] - gA[0]) * t);
            let ny = -sign * (gA[1] + (gB[1] - gA[1]) * t);
            let nz = -sign * (gA[2] + (gB[2] - gA[2]) * t);
            const nl = Math.hypot(nx, ny, nz) || 1;
            eN[e * 3] = nx / nl; eN[e * 3 + 1] = ny / nl; eN[e * 3 + 2] = nz / nl;
          }

          const row = cube * 16;
          for (let tI = 0; MC.TRI_TABLE[row + tI] !== -1; tI += 3) {
            const e0 = MC.TRI_TABLE[row + tI];
            const e1 = MC.TRI_TABLE[row + tI + 1];
            const e2 = MC.TRI_TABLE[row + tI + 2];
            // degenerate guard (iso hitting a grid value exactly)
            const ax = eP[e1 * 3] - eP[e0 * 3], ay = eP[e1 * 3 + 1] - eP[e0 * 3 + 1], az = eP[e1 * 3 + 2] - eP[e0 * 3 + 2];
            const bx = eP[e2 * 3] - eP[e0 * 3], by = eP[e2 * 3 + 1] - eP[e0 * 3 + 1], bz = eP[e2 * 3 + 2] - eP[e0 * 3 + 2];
            const crx = ay * bz - az * by, cry = az * bx - ax * bz, crz = ax * by - ay * bx;
            if (crx * crx + cry * cry + crz * crz < 1e-24) continue;
            sinkEnsure(sink, 18);
            const arr = sink.a;
            let o = sink.len;
            const es = [e0, e1, e2];
            for (let k = 0; k < 3; k++) {
              const e = es[k];
              const px = eP[e * 3], py = eP[e * 3 + 1], pz = eP[e * 3 + 2];
              arr[o++] = px; arr[o++] = py; arr[o++] = pz;
              arr[o++] = eN[e * 3]; arr[o++] = eN[e * 3 + 1]; arr[o++] = eN[e * 3 + 2];
              cx += px; cy += py; cz += pz; vtx++;
            }
            sink.len = o;
          }
        }
      }
    }

    return {
      data: sink.a.slice(0, sink.len),
      vcount: vtx,
      centroid: vtx ? [cx / vtx, cy / vtx, cz / vtx] : [0, 0, 0],
    };
  }

  /* extract(grid, isoAbs) -> { pos: Mesh, neg: Mesh }
   * Mesh = { data: Float32Array [x,y,z,nx,ny,nz]*, vcount, centroid } */
  function extract(grid, isoAbs) {
    VV.assert(isoAbs > 0, 'iso value must be positive');
    return {
      pos: marchSigned(grid, isoAbs, 1),
      neg: marchSigned(grid, isoAbs, -1),
    };
  }

  VV.Iso = {
    buildGridAsync: buildGridAsync,
    chooseIsoByProbability: chooseIsoByProbability,
    isoFromMax: isoFromMax,
    extract: extract,
  };
})();
