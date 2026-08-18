/* Valence View — VV.Scene: the 3D panel orchestrator. Consumes the scene
 * descriptor from contracts.md §6 (atoms/bonds/extent/colorMode/sampler/psi/
 * bAxis/precessOmegaVis/phase). Draw order per frame: clear -> nuclei (opaque
 * sphere impostors, depth write ON) -> bond lines -> cloud (additive) or iso
 * lobes (sorted, approximate transparency) -> gizmo (2D overlay) -> DOM label
 * reposition. Larmor precession is a model-matrix rotation about bAxis —
 * nuclei, bonds, labels and gizmo do NOT precess, only the electron cloud.
 * Composite mode: desc.components (addendum) puts one point cloud — and in
 * iso mode one grid+mesh pair, iso from that component's own histogram — per
 * component on the layer, tinted with the component's categorical sign shades;
 * absent components = the unchanged single-system path.
 * WebGL-unavailable: create() returns a no-op stub with available:false. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  const M = VV.M;

  const TIERS = {
    low: { points: 30000, grid: 48 },
    med: { points: 80000, grid: 64 },
    high: { points: 200000, grid: 96 },
  };
  const TOUCH_POINT_CAP = 30000;
  const FADE_MS = 400;
  const GIZMO = 84;

  const NUC_VS =
    'attribute vec3 aPos;\n' +
    'uniform mat4 uView;\nuniform mat4 uProj;\nuniform float uSizePx;\n' +
    'void main() {\n' +
    '  vec4 vp = uView * vec4(aPos, 1.0);\n' +
    '  gl_Position = uProj * vp;\n' +
    '  gl_PointSize = uSizePx;\n' +
    '}\n';
  const NUC_FS =
    'precision mediump float;\n' +
    'uniform vec3 uColor;\n' +
    'void main() {\n' +
    '  vec2 q = gl_PointCoord * 2.0 - 1.0;\n' +
    '  float d2 = dot(q, q);\n' +
    '  if (d2 > 1.0) discard;\n' +
    '  vec3 n = vec3(q.x, -q.y, sqrt(1.0 - d2));\n' +
    '  float li = 0.35 + 0.65 * max(dot(n, normalize(vec3(0.35, 0.4, 0.85))), 0.0);\n' +
    '  gl_FragColor = vec4(uColor * li, 1.0);\n' +
    '}\n';

  const LINE_VS =
    'attribute vec3 aPos;\n' +
    'uniform mat4 uViewProj;\n' +
    'void main() { gl_Position = uViewProj * vec4(aPos, 1.0); }\n';
  const LINE_FS =
    'precision mediump float;\n' +
    'uniform vec4 uColor;\n' +
    'void main() { gl_FragColor = uColor; }\n';

  const MESH_VS =
    'attribute vec3 aPos;\nattribute vec3 aNormal;\n' +
    'uniform mat4 uModel;\nuniform mat4 uViewProj;\nuniform mat3 uNormalMat;\n' +
    'varying vec3 vN;\nvarying vec3 vWorld;\n' +
    'void main() {\n' +
    '  vec4 wp = uModel * vec4(aPos, 1.0);\n' +
    '  vWorld = wp.xyz;\n' +
    '  vN = uNormalMat * aNormal;\n' +
    '  gl_Position = uViewProj * wp;\n' +
    '}\n';
  // Blinn-Phong, two lights: headlight (0.7) + fixed key (0.3), double-sided.
  const MESH_FS =
    'precision mediump float;\n' +
    'varying vec3 vN;\nvarying vec3 vWorld;\n' +
    'uniform vec3 uColor;\nuniform float uAlpha;\nuniform vec3 uEye;\n' +
    'void main() {\n' +
    '  vec3 N = normalize(vN);\n' +
    '  if (!gl_FrontFacing) N = -N;\n' +
    '  vec3 V = normalize(uEye - vWorld);\n' +
    '  vec3 K = normalize(vec3(0.4, 0.3, 0.85));\n' +
    '  float diff = 0.65 * (0.7 * max(dot(N, V), 0.0) + 0.3 * max(dot(N, K), 0.0));\n' +
    '  float spec = 0.35 * (0.7 * pow(max(dot(N, V), 0.0), 48.0)\n' +
    '             + 0.3 * pow(max(dot(N, normalize(K + V)), 0.0), 48.0));\n' +
    '  vec3 c = uColor * (0.25 + diff) + vec3(spec);\n' +
    '  gl_FragColor = vec4(c, uAlpha);\n' +
    '}\n';

  function ease(t) { return 0.5 - 0.5 * Math.cos(Math.PI * VV.clamp(t, 0, 1)); }

  function parseColor(css) {
    if (Array.isArray(css)) return css;
    if (typeof css === 'string' && css[0] === '#' && css.length >= 7) {
      const n = parseInt(css.slice(1, 7), 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    return [0.72, 0.77, 0.82];
  }

  function desat(c, f) {
    const g = (c[0] + c[1] + c[2]) / 3;
    return [c[0] + (g - c[0]) * f, c[1] + (g - c[1]) * f, c[2] + (g - c[2]) * f];
  }

  function isTouch() {
    return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  }

  function noopScene() {
    const S = { available: false, camera: null, renderer: null };
    ['setSystem', 'transitionTo', 'setMode', 'setQuality', 'setIso',
      'setTransparent', 'setOverlay', 'requestRender', 'render', 'start',
      'dispose', 'onDead',
    ].forEach(function (k) { S[k] = function () {}; });
    return S;
  }

  function create(containerEl) {
    if (!VV.GL.available()) return noopScene();

    // DOM scaffolding
    const doc = containerEl.ownerDocument;
    if (getComputedStyle(containerEl).position === 'static') {
      containerEl.style.position = 'relative';
    }
    const canvas = doc.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;';
    containerEl.appendChild(canvas);
    const gizmoCanvas = doc.createElement('canvas');
    gizmoCanvas.style.cssText =
      'position:absolute;top:8px;right:8px;width:' + GIZMO + 'px;height:' + GIZMO + 'px;pointer-events:none;';
    containerEl.appendChild(gizmoCanvas);
    const labelLayer = doc.createElement('div');
    labelLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
    containerEl.appendChild(labelLayer);

    const R = VV.GL.create(canvas);
    if (!R) return noopScene();
    const gl = R.gl;
    const cam = new VV.Camera(canvas);

    const S = {
      available: true,
      camera: cam,
      renderer: R,
      reducedQuality: false,
    };

    let mode = 'points';
    let quality = 'med';
    let isoOpts = { mode: 'prob', frac: 0.9, k: 0.1 };
    let transparent = true;
    let dirty = true;
    let geomDirty = true;
    let cur = null, old = null;
    let layerSeq = 0;
    let deadCb = null, deadTimer = 0;
    let frameTimes = [];

    // scratch matrices
    const mView = new Float32Array(16), mProj = new Float32Array(16);
    const mViewProj = new Float32Array(16), mModel = new Float32Array(16);
    const mNormal = new Float32Array(9);
    const eye = [0, 0, 0];
    const scratch2 = [0, 0];

    cam.onchange = function () { S.requestRender(); };

    function tier() {
      const t = TIERS[quality] || TIERS.med;
      const pts = isTouch() ? Math.min(t.points, TOUCH_POINT_CAP) : t.points;
      return { points: pts, grid: t.grid };
    }

    function centroid(desc) {
      const a = desc.atoms || [];
      if (!a.length) return [0, 0, 0];
      const c = [0, 0, 0];
      for (const at of a) { c[0] += at.pos[0]; c[1] += at.pos[1]; c[2] += at.pos[2]; }
      return [c[0] / a.length, c[1] / a.length, c[2] / a.length];
    }

    /* ------------------------------------------------------------ layers */
    function newLayer(desc, fadeIn) {
      layerSeq++;
      return {
        id: layerSeq,
        owner: 'scene#' + layerSeq,
        desc: desc,
        cloud: null, cloudStarted: false, cloudDone: false, sampleHandle: null,
        grid: null, gridJob: null, isoAbs: 0, meshes: null,
        comps: desc.components && desc.components.length
          ? desc.components.map(function () {
              return { cloud: null, cloudDone: false, sampleHandle: null,
                       grid: null, gridJob: null, isoAbs: 0, meshes: null };
            })
          : null,
        fade: fadeIn ? { mode: 'in', t0: VV.now() } : null,
        atomBuf: null, bondBuf: null, atomData: null, bondData: null,
      };
    }

    function layerAlpha(layer) {
      if (!layer.fade) return 1;
      const t = (VV.now() - layer.fade.t0) / FADE_MS;
      if (layer.fade.mode === 'in') {
        if (t >= 1) { layer.fade = null; return 1; }
        return ease(t);
      }
      return t >= 1 ? 0 : 1 - ease(t);
    }

    function deleteMeshBufs(meshes) {
      if (!meshes) return;
      for (const k of ['pos', 'neg']) {
        if (meshes[k] && meshes[k].buf) gl.deleteBuffer(meshes[k].buf);
      }
    }

    function layerCloudsDone(layer) {
      if (!layer.comps) return layer.cloudDone;
      for (const rec of layer.comps) if (!rec.cloudDone) return false;
      return true;
    }

    function disposeLayer(layer) {
      if (!layer) return;
      if (layer.sampleHandle) layer.sampleHandle.cancel();
      if (layer.gridJob) layer.gridJob.cancel();
      if (layer.comps) {
        for (const rec of layer.comps) {
          if (rec.sampleHandle) rec.sampleHandle.cancel();
          if (rec.gridJob) rec.gridJob.cancel();
          if (rec.cloud) rec.cloud.dispose(); // dispose unhooks its restore cb
          deleteMeshBufs(rec.meshes);
          rec.cloud = null; rec.meshes = null; rec.grid = null;
          rec.sampleHandle = null; rec.gridJob = null;
        }
      }
      VV.sched.cancelOwner(layer.owner);
      if (layer.cloud) layer.cloud.dispose();
      deleteMeshBufs(layer.meshes);
      if (layer.atomBuf) gl.deleteBuffer(layer.atomBuf);
      if (layer.bondBuf) gl.deleteBuffer(layer.bondBuf);
      layer.cloud = null; layer.meshes = null; layer.grid = null;
      layer.atomBuf = null; layer.bondBuf = null;
    }

    // composite: tier points split evenly across K clouds, >= 10k each; on
    // touch the 10k clamp yields to the TOTAL touch cap.
    function compCount(K) {
      const tp = tier().points;
      let per = Math.max(10000, Math.floor(tp / K));
      if (isTouch() && per * K > TOUCH_POINT_CAP) {
        per = Math.max(1, Math.floor(TOUCH_POINT_CAP / K));
      }
      return per;
    }

    function startCompClouds(layer) {
      layer.cloudStarted = true;
      const per = compCount(layer.comps.length);
      layer.desc.components.forEach(function (cdesc, i) {
        const rec = layer.comps[i];
        const sampler = cdesc.sampler;
        if (!sampler) { rec.cloudDone = true; return; }
        const count = sampler.count ? Math.min(per, sampler.count) : per;
        rec.cloud = VV.PointCloud.create(R);
        rec.cloud.begin(count, 'sign');
        rec.sampleHandle = VV.Sample.stream(
          {
            states: sampler.states,
            coeffs: sampler.coeffs,
            count: count,
            seed: sampler.seed == null ? 1 : sampler.seed,
            chunkSize: sampler.chunkSize || 8192,
            owner: layer.owner,
          },
          function (chunk) {
            if (rec.cloud) rec.cloud.append(chunk);
            geomDirty = true;
            S.requestRender();
          },
          function () {
            rec.cloudDone = true;
            S.requestRender();
          }
        );
      });
    }

    function startCloud(layer) {
      if (layer.cloudStarted) return;
      if (layer.comps) { startCompClouds(layer); return; }
      if (!layer.desc.sampler) return;
      layer.cloudStarted = true;
      const t = tier();
      const sampler = layer.desc.sampler;
      const K = (sampler.states || []).length;
      let count = t.points;
      if (K > 2) count = Math.min(count, 50000); // envelope acceptance ~1/K
      if (sampler.count) count = Math.min(count, sampler.count);
      layer.cloud = VV.PointCloud.create(R);
      layer.cloud.begin(count, layer.desc.colorMode);
      layer.sampleHandle = VV.Sample.stream(
        {
          states: sampler.states,
          coeffs: sampler.coeffs,
          count: count,
          seed: sampler.seed == null ? 1 : sampler.seed,
          chunkSize: sampler.chunkSize || 8192,
          owner: layer.owner,
        },
        function (chunk) {
          if (layer.cloud) layer.cloud.append(chunk);
          geomDirty = true;
          S.requestRender();
        },
        function () {
          layer.cloudDone = true;
          S.requestRender();
        }
      );
    }

    function startGrid(layer) {
      if (layer.grid || layer.gridJob || !layer.desc.psi) return;
      const t = tier();
      layer.gridJob = VV.Iso.buildGridAsync(
        {
          psi: layer.desc.psi,
          center: centroid(layer.desc),
          halfSize: layer.desc.extent,
          n: t.grid,
          owner: layer.owner,
        },
        null,
        function (grid) {
          layer.gridJob = null;
          layer.grid = grid;
          extractRec(layer);
        }
      );
    }

    // rec is the layer itself (single) or one component record (composite);
    // both carry {grid, isoAbs, meshes}. Iso from the rec's OWN histogram.
    function extractRec(rec) {
      if (!rec.grid) return;
      let isoAbs = isoOpts.mode === 'max'
        ? VV.Iso.isoFromMax(rec.grid, isoOpts.k)
        : VV.Iso.chooseIsoByProbability(rec.grid, isoOpts.frac);
      const amax = Math.max(Math.abs(rec.grid.min), Math.abs(rec.grid.max));
      if (!(isoAbs > 0)) isoAbs = amax * 0.05;
      if (!(isoAbs > 0)) return;
      rec.isoAbs = isoAbs;
      const ex = VV.Iso.extract(rec.grid, isoAbs);
      deleteMeshBufs(rec.meshes);
      rec.meshes = {};
      for (const k of ['pos', 'neg']) {
        const m = ex[k];
        rec.meshes[k] = m.vcount
          ? { buf: R.buffer(m.data), vcount: m.vcount, centroid: m.centroid, data: m.data }
          : null;
      }
      geomDirty = true;
      S.requestRender();
    }

    // K clouds mean K grid marches: drop one grid tier (min 48^3) for K >= 4
    function compGridN(K) {
      const g = tier().grid;
      return K >= 4 ? (g > 64 ? 64 : 48) : g;
    }

    function ensureCompIso(layer) {
      const n = compGridN(layer.comps.length);
      layer.desc.components.forEach(function (cdesc, i) {
        const rec = layer.comps[i];
        if (rec.grid) { if (!rec.meshes) extractRec(rec); return; }
        if (rec.gridJob || !cdesc.psi) return;
        rec.gridJob = VV.Iso.buildGridAsync(
          {
            psi: cdesc.psi,
            center: centroid(layer.desc),
            halfSize: layer.desc.extent,
            n: n,
            owner: layer.owner,
          },
          null,
          function (grid) {
            rec.gridJob = null;
            rec.grid = grid;
            extractRec(rec);
          }
        );
      });
    }

    function ensureRep(layer) {
      if (!layer) return;
      if (mode === 'points') startCloud(layer);
      else if (layer.comps) ensureCompIso(layer);
      else if (layer.grid) { if (!layer.meshes) extractRec(layer); }
      else startGrid(layer);
    }

    /* -------------------------------------------------------- atoms/bonds */
    function uploadSystem(layer) {
      const atoms = layer.desc.atoms || [];
      if (atoms.length) {
        const a = new Float32Array(atoms.length * 3);
        for (let i = 0; i < atoms.length; i++) {
          a[i * 3] = atoms[i].pos[0]; a[i * 3 + 1] = atoms[i].pos[1]; a[i * 3 + 2] = atoms[i].pos[2];
        }
        layer.atomData = a;
        layer.atomBuf = R.buffer(a);
      }
      const bonds = layer.desc.bonds || [];
      if (bonds.length) {
        const b = new Float32Array(bonds.length * 6);
        for (let i = 0; i < bonds.length; i++) {
          const p = atoms[bonds[i][0]].pos, q = atoms[bonds[i][1]].pos;
          b.set([p[0], p[1], p[2], q[0], q[1], q[2]], i * 6);
        }
        layer.bondData = b;
        layer.bondBuf = R.buffer(b);
      }
    }

    function rebuildLabels(desc) {
      labelLayer.textContent = '';
      const atoms = desc.atoms || [];
      for (const at of atoms) {
        const div = doc.createElement('div');
        div.className = 'vv-atom-label';
        div.textContent = at.sym;
        div.style.cssText =
          'position:absolute;transform:translate(-50%,-150%);pointer-events:none;' +
          'font:600 12px -apple-system,"Segoe UI",Roboto,sans-serif;color:#e6e9ee;' +
          'text-shadow:0 1px 3px rgba(0,0,0,0.8);';
        labelLayer.appendChild(div);
      }
    }

    function positionLabels() {
      if (!cur) return;
      const atoms = cur.desc.atoms || [];
      const kids = labelLayer.children;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      for (let i = 0; i < atoms.length && i < kids.length; i++) {
        const ok = cam.project(scratch2, atoms[i].pos, mViewProj, w, h);
        if (ok) {
          kids[i].style.display = '';
          kids[i].style.left = scratch2[0] + 'px';
          kids[i].style.top = scratch2[1] + 'px';
        } else {
          kids[i].style.display = 'none';
        }
      }
    }

    /* ------------------------------------------------------------- draws */
    function drawNuclei(layer) {
      const atoms = layer.desc.atoms || [];
      if (!atoms.length || !layer.atomBuf) return;
      const P = R.program('sc-nuc', NUC_VS, NUC_FS);
      gl.useProgram(P.id);
      gl.uniformMatrix4fv(P.u.uView, false, mView);
      gl.uniformMatrix4fv(P.u.uProj, false, mProj);
      gl.bindBuffer(gl.ARRAY_BUFFER, layer.atomBuf);
      gl.enableVertexAttribArray(P.a.aPos);
      gl.vertexAttribPointer(P.a.aPos, 3, gl.FLOAT, false, 12, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      for (let i = 0; i < atoms.length; i++) {
        const c = parseColor(atoms[i].color);
        gl.uniform3f(P.u.uColor, c[0], c[1], c[2]);
        gl.uniform1f(P.u.uSizePx, 2 * (atoms[i].radiusPx || 9) * R.dpr);
        gl.drawArrays(gl.POINTS, i, 1);
      }
      gl.disableVertexAttribArray(P.a.aPos);
    }

    function drawBonds(layer) {
      if (!layer.bondBuf || !layer.bondData) return;
      const P = R.program('sc-line', LINE_VS, LINE_FS);
      gl.useProgram(P.id);
      gl.uniformMatrix4fv(P.u.uViewProj, false, mViewProj);
      gl.uniform4f(P.u.uColor, 0.62, 0.66, 0.72, 0.5);
      gl.bindBuffer(gl.ARRAY_BUFFER, layer.bondBuf);
      gl.enableVertexAttribArray(P.a.aPos);
      gl.vertexAttribPointer(P.a.aPos, 3, gl.FLOAT, false, 12, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.LINES, 0, layer.bondData.length / 3);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.disableVertexAttribArray(P.a.aPos);
    }

    function drawCloud(layer, clock) {
      if (!layer.comps && (!layer.cloud || !layer.cloud.count)) return;
      const a = layerAlpha(layer);
      if (a <= 0) return;
      const desc = layer.desc;
      const pointPx = Math.max(0.035, desc.extent * 0.014); // world-size (a0)
      const hPx = canvas.clientHeight || 400;
      const st = {
        view: mView,
        proj: mProj,
        model: mModel,
        pointScale: (pointPx * hPx) / (2 * Math.tan(cam.fovY / 2)),
        globalAlpha: a,
        phaseOffset: desc.phase ? -desc.phase.omegaVis * clock.t : 0,
      };
      if (layer.comps) {
        // K overlapping additive clouds saturate to white; attenuate so the
        // per-orbital hues stay readable where components overlap
        st.globalAlpha = a / Math.sqrt(layer.comps.length);
        // per-component categorical sign shades override the lobe pair
        for (let i = 0; i < layer.comps.length; i++) {
          const rec = layer.comps[i];
          if (!rec.cloud || !rec.cloud.count) continue;
          st.colorPos = desc.components[i].colorPos;
          st.colorNeg = desc.components[i].colorNeg;
          rec.cloud.draw(st);
        }
        return;
      }
      if (desc.colorMode !== 'phase') {
        const lobe = VV.Cmap.lobeColors();
        st.colorPos = lobe.pos;
        st.colorNeg = lobe.neg;
      }
      layer.cloud.draw(st);
    }

    function drawIso(layer) {
      // gather every lobe of every representation: single = pos/neg lobe
      // pair; composite = pos/neg per component in its categorical shades
      const lobes = [];
      if (layer.comps) {
        const cds = layer.desc.components;
        for (let i = 0; i < layer.comps.length; i++) {
          const ms = layer.comps[i].meshes;
          if (!ms) continue;
          if (ms.pos) lobes.push({ mesh: ms.pos, color: desat(cds[i].colorPos, 0.15) });
          if (ms.neg) lobes.push({ mesh: ms.neg, color: desat(cds[i].colorNeg, 0.15) });
        }
      } else if (layer.meshes) {
        const lobe = VV.Cmap.lobeColors();
        if (layer.meshes.pos) lobes.push({ mesh: layer.meshes.pos, color: desat(lobe.pos, 0.15) });
        if (layer.meshes.neg) lobes.push({ mesh: layer.meshes.neg, color: desat(lobe.neg, 0.15) });
      }
      if (!lobes.length) return;
      const fade = layerAlpha(layer);
      if (fade <= 0) return;
      const P = R.program('sc-mesh', MESH_VS, MESH_FS);
      gl.useProgram(P.id);
      gl.uniformMatrix4fv(P.u.uModel, false, mModel);
      gl.uniformMatrix4fv(P.u.uViewProj, false, mViewProj);
      M.m3fromM4(mNormal, mModel);
      gl.uniformMatrix3fv(P.u.uNormalMat, false, mNormal);
      gl.uniform3f(P.u.uEye, eye[0], eye[1], eye[2]);

      const useBlend = transparent || fade < 1;
      const alpha = (transparent ? 0.55 : 1) * fade;

      // global back-to-front across ALL lobes by (precessed) centroid
      // distance to the eye
      const p3 = [0, 0, 0];
      for (const lb of lobes) {
        M.m4transformPoint(p3, mModel, lb.mesh.centroid);
        const dx = p3[0] - eye[0], dy = p3[1] - eye[1], dz = p3[2] - eye[2];
        lb.d = dx * dx + dy * dy + dz * dz;
      }
      lobes.sort(function (a, b) { return b.d - a.d; }); // farther first

      gl.enable(gl.DEPTH_TEST);
      if (useBlend) {
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      } else {
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      for (const lb of lobes) {
        const mesh = lb.mesh;
        const c = lb.color;
        gl.uniform3f(P.u.uColor, c[0], c[1], c[2]);
        gl.uniform1f(P.u.uAlpha, alpha);
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
        gl.enableVertexAttribArray(P.a.aPos);
        gl.vertexAttribPointer(P.a.aPos, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(P.a.aNormal);
        gl.vertexAttribPointer(P.a.aNormal, 3, gl.FLOAT, false, 24, 12);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.vcount);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.disableVertexAttribArray(P.a.aPos);
      gl.disableVertexAttribArray(P.a.aNormal);
    }

    function drawGizmoOverlay(bAxis) {
      const dpr = Math.min(self.devicePixelRatio || 1, 2);
      const pw = Math.round(GIZMO * dpr);
      if (gizmoCanvas.width !== pw) { gizmoCanvas.width = pw; gizmoCanvas.height = pw; }
      const ctx = gizmoCanvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      VV.Camera.drawGizmo(ctx, cam, bAxis || null, GIZMO);
    }

    /* ---------------------------------------------------------- public */
    let lastFrame = null;
    S.setSystem = function (desc) {
      disposeLayer(old); old = null;
      disposeLayer(cur);
      cur = newLayer(desc, false);
      uploadSystem(cur);
      ensureRep(cur);
      // keep the user's camera when the framing (extent/centroid) is unchanged
      // — display-only rebuilds (toggles, quality) must not snap the view
      const c = centroid(desc);
      const fr = [desc.extent, c[0], c[1], c[2]];
      const same = lastFrame && fr.every(function (v, i) {
        return Math.abs(v - lastFrame[i]) < 1e-9;
      });
      if (!same) cam.frame(desc.extent * 1.15, c);
      lastFrame = fr;
      rebuildLabels(desc);
      geomDirty = true;
      S.requestRender();
    };

    // cheap path for overlay toggles — no resample, no reframe
    S.setOverlay = function (opts) {
      if (!cur || !cur.desc) return;
      if (opts && 'showAxes' in opts) cur.desc.showAxes = opts.showAxes;
      if (opts && 'showNucleus' in opts) cur.desc.showNucleus = opts.showNucleus;
      geomDirty = true;
      S.requestRender();
    };

    S.transitionTo = function (desc) {
      if (!cur) { S.setSystem(desc); return; }
      disposeLayer(old);
      old = cur;
      old.fade = { mode: 'out', t0: VV.now() };
      cur = newLayer(desc, true);
      uploadSystem(cur);
      ensureRep(cur);
      rebuildLabels(desc);
      geomDirty = true;
      S.requestRender();
    };

    S.setMode = function (m) {
      m = m === 'iso' ? 'iso' : 'points'; // 'cloud' alias -> points
      if (m === mode) return;
      mode = m;
      if (old) { disposeLayer(old); old = null; } // avoid half-built fades
      ensureRep(cur);
      S.requestRender();
    };

    S.setQuality = function (q) {
      if (!TIERS[q] || q === quality) return;
      quality = q;
      if (!cur) return;
      // rebuild current representations at the new tier
      if (cur.sampleHandle) cur.sampleHandle.cancel();
      if (cur.gridJob) { cur.gridJob.cancel(); cur.gridJob = null; }
      if (cur.cloud) { cur.cloud.dispose(); cur.cloud = null; }
      cur.cloudStarted = false; cur.cloudDone = false;
      cur.grid = null;
      deleteMeshBufs(cur.meshes);
      cur.meshes = null;
      if (cur.comps) {
        for (const rec of cur.comps) {
          if (rec.sampleHandle) { rec.sampleHandle.cancel(); rec.sampleHandle = null; }
          if (rec.gridJob) { rec.gridJob.cancel(); rec.gridJob = null; }
          if (rec.cloud) { rec.cloud.dispose(); rec.cloud = null; }
          rec.cloudDone = false;
          rec.grid = null;
          deleteMeshBufs(rec.meshes);
          rec.meshes = null;
        }
      }
      ensureRep(cur);
      S.requestRender();
    };

    S.setIso = function (opts) {
      if (opts) {
        if (opts.mode) isoOpts.mode = opts.mode;
        if (opts.frac != null) isoOpts.frac = opts.frac;
        if (opts.k != null) isoOpts.k = opts.k;
      }
      if (cur && mode === 'iso') {
        if (cur.comps) {
          // re-march every cached component grid; no psi re-eval
          for (const rec of cur.comps) if (rec.grid) extractRec(rec);
        } else if (cur.grid) {
          extractRec(cur); // no psi re-eval
        }
      }
    };

    S.setTransparent = function (b) {
      transparent = !!b;
      S.requestRender();
    };

    S.requestRender = function () {
      dirty = true;
      if (VV.Anim) VV.Anim.markDirty();
    };

    S.onDead = function (fn) { deadCb = fn; };

    R.onLost(function () {
      deadTimer = setTimeout(function () {
        if (R.lost && deadCb) deadCb();
      }, 5000);
    });
    R.onRestore(function () {
      clearTimeout(deadTimer);
      // meshes + system buffers rebuilt from retained arrays (clouds rebuild
      // themselves via their own onRestore)
      for (const layer of [cur, old]) {
        if (!layer) continue;
        if (layer.atomData) layer.atomBuf = R.buffer(layer.atomData);
        if (layer.bondData) layer.bondBuf = R.buffer(layer.bondData);
        if (layer.meshes) {
          for (const k of ['pos', 'neg']) {
            if (layer.meshes[k]) layer.meshes[k].buf = R.buffer(layer.meshes[k].data);
          }
        }
        if (layer.comps) {
          for (const rec of layer.comps) {
            if (!rec.meshes) continue;
            for (const k of ['pos', 'neg']) {
              if (rec.meshes[k]) rec.meshes[k].buf = R.buffer(rec.meshes[k].data);
            }
          }
        }
      }
      S.requestRender();
    });

    /* Per-frame entry; wire as VV.Anim.start(S.render) (or via S.start()). */
    S.render = function (dt, clock, externalDirty) {
      if (R.lost) return;
      clock = clock || VV.Anim.clock;
      const resized = R.resize();
      const camChanged = cam.update(dt || 0.016);
      const desc = cur ? cur.desc : null;
      const fading = !!((cur && cur.fade) || (old && old.fade));
      const streaming = !!(cur && cur.cloudStarted && !layerCloudsDone(cur) && mode === 'points');
      const hasAnim = !!(desc && clock.playing &&
        (desc.phase || (desc.bAxis && desc.precessOmegaVis)));
      if (!(dirty || externalDirty || resized || camChanged || geomDirty || fading || hasAnim || streaming)) {
        return; // render-on-demand: tick without GL work
      }
      dirty = false;

      const t0 = VV.now();
      cam.viewMatrix(mView);
      cam.projMatrix(mProj, R.width / Math.max(1, R.height));
      M.m4mul(mViewProj, mProj, mView);
      cam.eye(eye);
      if (desc && desc.bAxis && desc.precessOmegaVis) {
        M.m4rotAxis(mModel, desc.bAxis, desc.precessOmegaVis * clock.t);
      } else {
        M.m4ident(mModel);
      }

      gl.clearColor(0.043, 0.055, 0.078, 1); // #0b0e14 — additive needs dark
      gl.clearDepth(1);
      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      if (cur) {
        if (cur.desc.showNucleus !== false) drawNuclei(cur);
        drawBonds(cur);
        const layers = old ? [old, cur] : [cur];
        for (const layer of layers) {
          if (mode === 'points') drawCloud(layer, clock);
          else drawIso(layer);
        }
        if (old && layerAlpha(old) <= 0) { disposeLayer(old); old = null; }
      }

      if (camChanged || resized || geomDirty || fading) {
        const showAxes = !desc || desc.showAxes !== false;
        gizmoCanvas.style.display = showAxes ? '' : 'none';
        if (showAxes) drawGizmoOverlay(desc && desc.bAxis);
        positionLabels();
      }
      geomDirty = false;

      // frame-time watchdog: after 20 drawn frames, median > 24 ms drops a tier
      if (!S.reducedQuality && frameTimes) {
        frameTimes.push(VV.now() - t0);
        if (frameTimes.length >= 20) {
          const s = frameTimes.slice().sort(function (a, b) { return a - b; });
          if (s[10] > 24) {
            S.reducedQuality = true;
            R.maxDPR = 1.5;
            if (quality !== 'low') S.setQuality(quality === 'high' ? 'med' : 'low');
          }
          frameTimes = null;
        }
      }
    };

    S.start = function () {
      if (VV.Anim) {
        VV.Anim.start(function (dt, clock, d) { S.render(dt, clock, d); });
      }
    };

    S.dispose = function () {
      disposeLayer(cur); disposeLayer(old);
      cur = old = null;
      labelLayer.textContent = '';
    };

    return S;
  }

  VV.Scene = { create: create };
})();
