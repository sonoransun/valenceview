/* Valence View — verify.html driver. Pulls the static suite from
 * VV.verify.list(), appends per-orbital checks for a "#<Sym>-<key>" deep
 * link, and executes everything cooperatively through VV.sched (one
 * synchronous check per step call) so the page never freezes. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});
  VV.ui = VV.ui || {};

  const OWNER = 'verify-page';

  let run = null; // { checks, idx, pass, fail, info, total, handle }

  function $(id) { return document.getElementById(id); }

  // Accepts "#Fe-3d_z2" and tolerates the app's extended grammar after the
  // orbital key ("#Fe-3d_z2;b=1.5") by matching only the leading fragment.
  function parseDeepLink() {
    const m = /^#([A-Z][a-z]{0,2})-([1-9][spdf](?:_[a-z0-9]+)?)(?:;|$)/.exec(location.hash || '');
    if (!m || !VV.data || !VV.data.bySym) return null;
    const el = VV.data.bySym(m[1]);
    return el ? { z: el.z, sym: m[1], key: m[2] } : null;
  }

  function collectChecks() {
    const checks = VV.verify.list().slice();
    const deep = parseDeepLink();
    if (deep && typeof VV.verify.forOrbital === 'function') {
      try {
        const extra = VV.verify.forOrbital(deep.z, deep.key);
        for (const c of extra) checks.push(c);
      } catch (e) {
        // Unknown orbital key in the hash: run the static suite only.
      }
    }
    return checks;
  }

  function fmtVal(v) {
    if (typeof v === 'number') return VV.fmt.sci(v, 6);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (v == null) return '—';
    return String(v);
  }

  function fmtTol(check) {
    if (check.kind === 'info') return '—';
    if (check.kind === 'bool') return 'exact';
    if (check.tol == null) return '—';
    return VV.fmt.sci(check.tol, 2) + ' ' + check.kind;
  }

  function setStatus(text, cls) {
    const el = $('verify-status');
    el.textContent = text;
    el.className = cls || '';
  }

  function appendRow(check, res, ms) {
    const tr = document.createElement('tr');
    const isInfo = check.kind === 'info';
    const failed = !isInfo && !res.pass;
    if (isInfo) tr.className = 'row-info';
    else if (failed) tr.className = 'row-fail';
    tr.title = (check.group || 'general') + ' · ' + VV.fmt.num(ms, 3) + ' ms';

    const cells = [
      { text: check.name },
      { text: check.subject || '', cls: 'subject' },
      { text: fmtVal(res.computed), cls: 'num' },
      { text: fmtVal(res.expected), cls: 'num' },
      { text: typeof res.error === 'number' ? VV.fmt.sci(res.error, 3) : '—', cls: 'num' },
      { text: fmtTol(check), cls: 'num' },
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c.text;
      if (c.cls) td.className = c.cls;
      tr.appendChild(td);
    }
    const tdRes = document.createElement('td');
    const badge = document.createElement('span');
    if (isInfo) {
      badge.className = 'badge info';
      badge.textContent = 'INFO';
    } else if (res.pass) {
      badge.className = 'badge pass';
      badge.textContent = 'PASS';
    } else {
      badge.className = 'badge fail';
      badge.textContent = 'FAIL';
    }
    tdRes.appendChild(badge);
    tr.appendChild(tdRes);
    $('verify-tbody').appendChild(tr);
  }

  function runOne(check) {
    const t0 = VV.now();
    let res;
    try {
      res = check.run();
    } catch (e) {
      res = { computed: 'threw: ' + (e && e.message ? e.message : String(e)),
              expected: null, error: null, pass: false };
    }
    const ms = VV.now() - t0;
    appendRow(check, res, ms);
    if (check.kind === 'info') run.info++;
    else if (res.pass) run.pass++;
    else run.fail++;
  }

  function finish() {
    const graded = run.pass + run.fail;
    const infoNote = run.info ? ' · ' + run.info + ' informational' : '';
    if (run.fail === 0) {
      setStatus(run.pass + ' / ' + graded + ' checks passed' + infoNote, 'status-pass');
    } else {
      setStatus(run.pass + ' / ' + graded + ' checks passed — ' +
                run.fail + ' FAILED' + infoNote, 'status-fail');
    }
    $('verify-run').textContent = 'Run again';
    run.handle = null;
  }

  function step() {
    if (!run || run.idx >= run.total) return true;
    const check = run.checks[run.idx++];
    runOne(check);
    $('verify-progress').value = run.idx;
    if (run.idx === run.total || run.idx % 5 === 0) {
      setStatus('Running… ' + run.idx + ' / ' + run.total +
                (run.fail ? ' (' + run.fail + ' failed so far)' : ''), 'status-running');
    }
    if (run.idx >= run.total) {
      finish();
      return true;
    }
    return false;
  }

  function start() {
    VV.sched.cancelOwner(OWNER);
    $('verify-tbody').textContent = '';
    const checks = collectChecks(); // re-reads the hash on every (re)run
    run = { checks: checks, idx: 0, pass: 0, fail: 0, info: 0,
            total: checks.length, handle: null };
    const progress = $('verify-progress');
    progress.max = Math.max(run.total, 1);
    progress.value = 0;
    if (!run.total) {
      setStatus('No checks registered.', 'status-fail');
      return;
    }
    setStatus('Running… 0 / ' + run.total, 'status-running');
    run.handle = VV.sched.submit(step, { owner: OWNER });
  }

  VV.ui.verifyPage = {
    init: function () {
      if (!VV.verify || typeof VV.verify.list !== 'function') {
        setStatus('Verification suite failed to load — a script is missing or errored.',
                  'status-fail');
        $('verify-run').disabled = true;
        return;
      }
      $('verify-run').addEventListener('click', start);
      start();
    },
    run: start,
  };

  if (typeof document !== 'undefined' && document.getElementById('verify-table')) {
    VV.ui.verifyPage.init();
  }
})();
