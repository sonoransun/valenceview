/* Valence View — VV.app: boot, dependency asserts, feature detection, state
 * init from URL, component mounting and subscription wiring. All renderer
 * calls are guarded so a throw surfaces #error-banner, never a dead page. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  function $(id) { return document.getElementById(id); }

  let scene = null;
  let model = null;
  let tabsApi = null;
  let webgl = false;
  let firstScene = true;
  let recomputeTimer = 0;

  function showError(msg) {
    const b = $('error-banner');
    if (b) {
      b.textContent = 'Error — ' + msg;
      b.hidden = false;
    }
    if (typeof console !== 'undefined') console.error('VV:', msg);
  }

  function clearError() {
    const b = $('error-banner');
    if (b) b.hidden = true;
  }

  function announce(msg) {
    const s = $('sr-status');
    if (s) s.textContent = msg;
  }

  /* Every cross-layer symbol the shell calls, asserted at boot so a wrong
   * include order or renamed export fails loudly at load (spec-critique R1). */
  function assertDeps() {
    const A = VV.assert;
    A(VV.C && VV.sched && VV.fmt && VV.clamp && VV.debounce, 'core utilities (namespace.js/constants.js)');
    A(VV.data && Array.isArray(VV.data.ELEMENTS) && VV.data.ELEMENTS.length === 118, 'VV.data.ELEMENTS[118]');
    A(typeof VV.data.byZ === 'function' && typeof VV.data.bySym === 'function' &&
      typeof VV.data.valenceSubshells === 'function' && Array.isArray(VV.data.COMMON), 'VV.data API');
    A(VV.hydro && typeof VV.hydro.buildOrbital === 'function', 'VV.hydro.buildOrbital');
    A(typeof VV.hydro.orbitalKey === 'function' && typeof VV.hydro.parseKey === 'function' &&
      typeof VV.hydro.orbitalLabelHTML === 'function', 'VV.hydro key helpers');
    A(typeof VV.hydro.radialRfactory === 'function' && typeof VV.hydro.realYlm === 'function' &&
      typeof VV.hydro.suggestedExtent === 'function', 'VV.hydro primitives');
    A(VV.slater && VV.symbolic && VV.derived && VV.frac && VV.quad && VV.special, 'physics core modules');
    A(VV.magnetic && VV.lcao, 'speculative modules (spec/magnetic.js, spec/lcao.js)');
    A(VV.M && VV.GL && typeof VV.GL.available === 'function', 'render core (mat.js, gl-core.js)');
    A(VV.Camera && VV.MC && VV.Iso && VV.Sample && VV.PointCloud, 'render modules');
    A(VV.Scene && typeof VV.Scene.create === 'function', 'VV.Scene.create');
    A(VV.Anim && VV.Anim.clock && typeof VV.Anim.start === 'function', 'VV.Anim');
    A(VV.Cmap && VV.Cmap.DIVERGING && VV.Plot && typeof VV.Plot.line === 'function' &&
      typeof VV.Plot.heatmap === 'function' && typeof VV.Plot.polar === 'function', 'plot layer');
    A(VV.store && VV.url && VV.mathml, 'ui core (state/url/mathml)');
    A(VV.ui && VV.ui.tabs && VV.ui.periodicTable && VV.ui.orbitalPicker &&
      VV.ui.controls && VV.ui.fieldPanel && VV.ui.companionPanel &&
      VV.ui.infoPanel && VV.ui.vizGlue && VV.ui.tour, 'ui components');
  }

  function enterNoWebgl() {
    webgl = false;
    scene = null;
    document.documentElement.classList.add('no-webgl');
    const fb = $('webgl-fallback');
    if (fb) fb.hidden = false;
    if (tabsApi) tabsApi.setHidden('3d', true);
  }

  // Speculative banner: visibility plus a Details link that targets the
  // theory section for whichever speculative mode caused the banner.
  function updateSpecBanner(state) {
    const banner = $('speculative-banner');
    if (!banner) return;
    banner.hidden = !(state.field.enabled || state.comp.enabled);
    const link = banner.querySelector('a');
    if (link) {
      let section = 'zeeman'; // field mode
      if (!state.field.enabled && state.comp.enabled) {
        section = state.comp.mode === 'cluster' ? 'superstructure' : 'lcao';
      }
      link.href = 'theory.html#' + section;
    }
  }

  /* ---------- recompute pipeline ---------- */

  const debouncedRecompute = VV.debounce(doRecompute, 120);

  function scheduleRecompute(transient) {
    if (transient) {
      debouncedRecompute();
      return;
    }
    if (recomputeTimer) return;
    recomputeTimer = setTimeout(function () {
      recomputeTimer = 0;
      doRecompute();
    }, 0);
  }

  function isCompositeState(state) {
    if (typeof VV.hydro.isCompositeState === 'function') {
      return !!VV.hydro.isCompositeState(state);
    }
    return !!(state.multi && state.multi.enabled &&
              state.multi.keys && state.multi.keys.length >= 1);
  }

  function doRecompute() {
    debouncedRecompute.cancel(); // an immediate run supersedes any pending transient one
    const state = VV.store.get();
    const composite = isCompositeState(state);

    if (composite) {
      // coerce composite keys the current element does not offer (bad deep
      // link / element change); empty survivors fall back to the default key
      const ck = VV.ui.orbitalPicker.coerceKeys(state.element, state.multi.keys);
      if (ck.join('+') !== state.multi.keys.join('+')) {
        VV.store.set({ multi: { keys: ck }, orbital: ck[0] }, 'app');
        return; // subscription re-schedules the recompute
      }
    } else {
      // coerce an orbital the current element does not offer (bad deep link)
      const offered = VV.ui.orbitalPicker.orbitalsFor(state.element);
      if (offered.length && !offered.some(function (o) { return o.key === state.orbital; })) {
        VV.store.set({ orbital: VV.ui.orbitalPicker.defaultKey(state.element) }, 'app');
        return; // subscription re-schedules the recompute
      }
    }

    VV.sched.cancelOwner('plot2d');
    VV.sched.cancelOwner('app');
    clearError();

    try {
      model = composite ? VV.hydro.buildComposite(state) : VV.hydro.buildOrbital(state);
    } catch (e) {
      showError('could not build the orbital model: ' + e.message);
      return;
    }

    if (scene) {
      try {
        const desc = VV.ui.vizGlue.buildSceneDesc(model, state);
        if (!firstScene && typeof scene.transitionTo === 'function') {
          scene.transitionTo(desc);
        } else {
          scene.setSystem(desc);
          firstScene = false;
        }
      } catch (e) {
        showError('3D renderer failed (2D views still work): ' + e.message);
      }
    }

    try {
      VV.ui.vizGlue.plot2d.render(model, state);
    } catch (e) {
      showError('2D plots failed: ' + e.message);
    }

    try { VV.ui.infoPanel.render(model, state); }
    catch (e) { showError('info panel failed: ' + e.message); }
    try { VV.ui.fieldPanel.render(model); } catch (e) { /* readouts only */ }
    try { VV.ui.companionPanel.render(model); } catch (e) { /* readouts only */ }

    const el = VV.data.byZ(state.element);
    const orbText = composite
      ? 'a composite of ' + model.components.length + ' orbitals (' +
        (model.keys || []).join(', ') + ')'
      : 'the ' + model.key + ' orbital';
    const cv = $('canvas3d');
    if (cv) {
      cv.setAttribute('aria-label',
        (state.viz.mode === 'iso' ? 'Isosurface' : '3D point cloud') +
        ' of ' + orbText + ' of ' + el.name);
    }
    const host = $('plot2d-host');
    if (host) {
      host.setAttribute('aria-label',
        '2D plots of ' + orbText + ' of ' + el.name);
    }
  }

  // viz-only changes that need new sampler/iso configs but no new physics
  function applyVizToScene(state) {
    if (!scene || !model) return;
    try {
      const desc = VV.ui.vizGlue.buildSceneDesc(model, state);
      if (typeof scene.setIso === 'function' && desc.iso) scene.setIso(desc.iso);
      scene.setSystem(desc);
    } catch (e) {
      showError('3D renderer failed: ' + e.message);
    }
  }

  const debouncedApplyViz = VV.debounce(function () {
    applyVizToScene(VV.store.get());
  }, 150);

  /* ---------- boot ---------- */

  function boot() {
    try {
      assertDeps();
    } catch (e) {
      showError(e.message + '. The page cannot start (a script may have failed to load).');
      return;
    }

    // feature detection
    try { webgl = !!VV.GL.available(); } catch (e) { webgl = false; }
    try { VV.mathml.ensureClass(); } catch (e) { /* fallback text remains */ }

    // mutual exclusion + hybrid availability (store rule, contracts.md §2)
    VV.store.setRule(function (patch, cur) {
      if (patch.field && patch.field.enabled) {
        patch.comp = Object.assign({}, patch.comp, { enabled: false });
      } else if (patch.comp && patch.comp.enabled) {
        patch.field = Object.assign({}, patch.field, { enabled: false });
      }
      // composite is exclusive with the companion mode (field may combine)
      if (patch.multi && patch.multi.enabled) {
        patch.comp = Object.assign({}, patch.comp, { enabled: false });
      } else if (patch.comp && patch.comp.enabled) {
        patch.multi = Object.assign({}, patch.multi, { enabled: false });
      }
      const multiOn = (patch.multi && patch.multi.enabled !== undefined)
        ? patch.multi.enabled : cur.multi.enabled;
      if (multiOn) {
        // state.orbital stays keys[0] while multi is on
        const keys = (patch.multi && patch.multi.keys) ? patch.multi.keys : cur.multi.keys;
        if (keys && keys.length && patch.orbital === undefined && keys[0] !== cur.orbital) {
          patch.orbital = keys[0];
        }
        // 'phase' cannot be entered in composite mode
        const cm = (patch.viz && patch.viz.colorMode !== undefined)
          ? patch.viz.colorMode : cur.viz.colorMode;
        if (cm === 'phase') {
          patch.viz = Object.assign({}, patch.viz, { colorMode: 'sign' });
        }
      }
      const z = patch.element !== undefined ? patch.element : cur.element;
      const comp = Object.assign({}, cur.comp, patch.comp);
      if (comp.enabled && comp.mode === 'hybrid' &&
          !VV.ui.companionPanel.hybridAvailable(z)) {
        patch.comp = Object.assign({}, patch.comp, { mode: 'mo' });
      }
      return patch;
    });

    // initial state: defaults <- URL <- device/preference overrides
    const patch = VV.url.read() || {};
    if (navigator.maxTouchPoints > 0) {
      patch.viz = Object.assign({ quality: 'low' }, patch.viz);
    }
    if (!webgl) {
      patch.viz = Object.assign({}, patch.viz, { tab: '2d' });
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      patch.anim = Object.assign({}, patch.anim, { playing: false });
    }
    VV.store.set(patch, 'boot');

    // mount components
    VV.ui.periodicTable.mount($('ptable'));
    VV.ui.orbitalPicker.mount($('orbital-picker'));
    VV.ui.controls.mount($('group-view'), $('group-anim'));
    VV.ui.fieldPanel.mount($('group-field'));
    VV.ui.companionPanel.mount($('group-comp'));
    VV.ui.infoPanel.mount($('info-panel'));
    VV.ui.vizGlue.plot2d.mount($('plot2d-host'));

    tabsApi = VV.ui.tabs.create($('viz-tabs'), [
      { id: '3d', label: '3D', panel: $('viz-3d') },
      { id: '2d', label: '2D', panel: $('viz-2d') },
    ], function (id) {
      VV.store.set({ viz: { tab: id } }, 'tabs');
      onTabShown(id);
    });

    if (webgl) {
      try {
        scene = VV.Scene.create($('scene-host'));
        scene.onDead(function () {
          // permanent WebGL context loss: mirror the boot-time no-WebGL path
          showError('3D rendering stopped (graphics context lost). 2D views still work.');
          enterNoWebgl();
          VV.store.set({ viz: { tab: '2d' } }, 'app');
        });
        const cv = $('scene-host').querySelector('canvas');
        if (cv && !cv.id) {
          cv.id = 'canvas3d';
          cv.setAttribute('role', 'img');
        }
      } catch (e) {
        showError('3D setup failed, showing 2D views: ' + e.message);
        enterNoWebgl();
      }
    }
    if (!webgl) enterNoWebgl();

    // collapse the periodic table by default on small screens
    if (matchMedia('(max-width: 799px)').matches) {
      $('ptable-wrap').removeAttribute('open');
    }

    wireSubscriptions();

    // initial UI sync
    const st = VV.store.get();
    VV.ui.periodicTable.update(st);
    VV.ui.orbitalPicker.update(st.element, st.orbital, st.multi);
    VV.ui.controls.update(st);
    VV.ui.fieldPanel.update(st);
    VV.ui.companionPanel.update(st);
    tabsApi.select(st.viz.tab);
    updateSpecBanner(st);
    if (scene) {
      try { scene.setMode(st.viz.mode === 'iso' ? 'iso' : 'cloud'); } catch (e) { }
      try { scene.setQuality(st.viz.quality); } catch (e) { }
    }
    VV.Anim.clock.playing = st.anim.playing;
    VV.Anim.clock.speed = st.anim.speed;

    doRecompute();
    startFrameLoop();
    wireGlobalEvents();

    // guided tour: auto-start only on a clean first visit — no deep link,
    // not previously done/skipped (storage throws count as done), and the
    // boot produced no error banner. The Tour button restarts it any time.
    const eb = $('error-banner');
    if (!location.hash && (!eb || eb.hidden) && !VV.ui.tour.isDone()) {
      VV.ui.tour.start();
    }
  }

  function onTabShown(id) {
    if (id === '2d') {
      // panel just became visible; plots need real client sizes
      setTimeout(function () { VV.ui.vizGlue.plot2d.resize(); }, 0);
    } else if (scene && typeof scene.requestRender === 'function') {
      scene.requestRender();
    }
  }

  function wireSubscriptions() {
    const store = VV.store;

    store.subscribe(['element'], function (state, changed, source) {
      VV.ui.periodicTable.update(state);
      VV.ui.companionPanel.update(state); // hybrid availability depends on the element
      // URL-sourced patches always win: a deep link's orbital may equal the
      // previous orbital (so it isn't in `changed`) yet differ from the new
      // element's default; doRecompute still coerces truly invalid keys.
      if (source !== 'url') {
        if (state.multi.enabled) {
          // composite: keep only keys the new element offers ([default] if none)
          const ck = VV.ui.orbitalPicker.coerceKeys(state.element, state.multi.keys);
          store.set({ multi: { keys: ck }, orbital: ck[0] }, 'app');
        } else if (changed.indexOf('orbital') === -1) {
          const dk = VV.ui.orbitalPicker.defaultKey(state.element);
          if (dk && dk !== state.orbital) {
            store.set({ orbital: dk }, 'app');
          }
        }
      }
      const cur = store.get();
      VV.ui.orbitalPicker.update(cur.element, cur.orbital, cur.multi);
      const el = VV.data.byZ(state.element);
      announce(el.name + ' (' + el.sym + '), atomic number ' + el.z + ' selected');
    });

    store.subscribe(['orbital'], function (state) {
      VV.ui.orbitalPicker.update(state.element, state.orbital, state.multi);
    });

    store.subscribe(['multi'], function (state) {
      VV.ui.orbitalPicker.update(state.element, state.orbital, state.multi);
      VV.ui.controls.update(state); // #color-mode lock follows multi
    });

    store.subscribe(['element', 'orbital', 'field', 'comp', 'multi', 'viz.colorMode'],
      function (state, changed, source, meta) {
        scheduleRecompute(meta && meta.transient);
      });

    store.subscribe(['viz'], function (state, changed, source, meta) {
      VV.ui.controls.update(state);
      VV.ui.vizGlue.plot2d.updateState(state);

      if (changed.indexOf('viz.tab') !== -1) {
        tabsApi.select(state.viz.tab);
        if (source !== 'tabs') onTabShown(state.viz.tab);
      }
      if (changed.indexOf('viz.mode') !== -1 && scene) {
        try { scene.setMode(state.viz.mode === 'iso' ? 'iso' : 'cloud'); } catch (e) { }
      }
      if (changed.indexOf('viz.quality') !== -1) {
        if (scene) { try { scene.setQuality(state.viz.quality); } catch (e) { } }
        applyVizToScene(state); // resample only, no new physics
      }
      const light = ['viz.showAxes', 'viz.showNucleus', 'viz.transparent',
        'viz.isoMode', 'viz.isoFrac', 'viz.isoK'];
      const lightChanged = light.filter(function (k) { return changed.indexOf(k) !== -1; });
      if (lightChanged.length) {
        const isoKeys = ['viz.isoMode', 'viz.isoFrac', 'viz.isoK'];
        const isoOnly = lightChanged.every(function (k) { return isoKeys.indexOf(k) !== -1; });
        const transOnly = lightChanged.every(function (k) { return k === 'viz.transparent'; });
        const overlayKeys = ['viz.showAxes', 'viz.showNucleus'];
        const overlayOnly = lightChanged.every(function (k) { return overlayKeys.indexOf(k) !== -1; });
        if (scene && overlayOnly && typeof scene.setOverlay === 'function') {
          try {
            scene.setOverlay({ showAxes: state.viz.showAxes, showNucleus: state.viz.showNucleus });
          } catch (e) { }
        } else if (scene && isoOnly && typeof scene.setIso === 'function') {
          // re-marches the cached grid, no psi re-eval — cheap even mid-drag
          try {
            scene.setIso({ mode: state.viz.isoMode, frac: state.viz.isoFrac, k: state.viz.isoK });
          } catch (e) { }
        } else if (scene && transOnly && typeof scene.setTransparent === 'function') {
          try { scene.setTransparent(state.viz.transparent); } catch (e) { }
        } else if (meta && meta.transient) {
          debouncedApplyViz();
        } else {
          applyVizToScene(state);
        }
      }
      if (['viz.plot2d', 'viz.plane'].some(function (k) { return changed.indexOf(k) !== -1; })) {
        try { VV.ui.vizGlue.plot2d.render(model, state); } catch (e) { }
      }
    });

    store.subscribe(['anim'], function (state) {
      VV.Anim.clock.playing = state.anim.playing;
      VV.Anim.clock.speed = state.anim.speed;
      VV.ui.controls.update(state);
      if (typeof VV.Anim.markDirty === 'function') VV.Anim.markDirty();
    });

    store.subscribe(['field', 'comp'], function (state) {
      updateSpecBanner(state);
      VV.ui.fieldPanel.update(state);
      VV.ui.companionPanel.update(state);
    });

    const writeUrl = VV.debounce(function () {
      VV.url.write(VV.store.get());
    }, 300);
    store.subscribe(['*'], function (state, changed, source) {
      if (source !== 'url' && source !== 'boot') writeUrl();
    });
  }

  function startFrameLoop() {
    const sceneFrame = scene &&
      (scene.frame || scene.render || scene.draw || scene.tick);
    if (scene && typeof sceneFrame === 'function') {
      VV.Anim.start(function (dt, clock) {
        try { sceneFrame.call(scene, dt, clock); } catch (e) { /* keep looping */ }
        VV.ui.vizGlue.plot2d.tick(clock);
      });
    } else if (!scene) {
      // no 3D: Anim still owns the clock; drive the 2D animations
      VV.Anim.start(function (dt, clock) {
        VV.ui.vizGlue.plot2d.tick(clock);
      });
    } else {
      // Scene registered its own frame loop with VV.Anim; run a light
      // rAF ticker for the first-class 2D animations only.
      (function loop() {
        requestAnimationFrame(loop);
        if (document.hidden) return;
        if (VV.Anim.clock.playing) VV.ui.vizGlue.plot2d.tick(VV.Anim.clock);
      })();
    }
  }

  function wireGlobalEvents() {
    const tourBtn = $('start-tour');
    if (tourBtn) {
      tourBtn.addEventListener('click', function () { VV.ui.tour.start(); });
    }

    window.addEventListener('hashchange', function () {
      const p = VV.url.read();
      if (p) {
        // in-session deep links are complete descriptions, not additive
        // overlays: absent b=/c=/h=/k= sections reset field/companion mode,
        // and a '+'-less orbital token resets composite mode
        // (initial-load merge semantics in boot() are unaffected)
        if (!p.field) p.field = { enabled: false };
        if (!p.comp) p.comp = { enabled: false };
        if (!p.multi) p.multi = { enabled: false };
        VV.store.set(p, 'url');
      }
    });

    const onResize = VV.debounce(function () {
      VV.ui.vizGlue.plot2d.resize();
      if (scene && typeof scene.requestRender === 'function') scene.requestRender();
    }, 150);
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(onResize);
      ro.observe($('plot2d-host'));
      ro.observe($('scene-host'));
    } else {
      window.addEventListener('resize', onResize);
    }
  }

  VV.app = { boot: boot };

  try {
    boot();
  } catch (e) {
    showError('boot failed: ' + e.message);
  }
})();
