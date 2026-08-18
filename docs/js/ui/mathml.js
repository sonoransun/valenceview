/* Valence View — VV.mathml: symbolic AST -> MathML Core DOM, plus support
 * detection. AST vocabulary per contracts.md §8. Every generated <math> gets
 * display="block" and a data-ascii plain-text serialization. */
(function () {
  'use strict';
  const VV = (self.VV = self.VV || {});

  const MML = 'http://www.w3.org/1998/Math/MathML';

  function el(tag, text) {
    const e = document.createElementNS(MML, tag);
    if (text !== undefined) e.appendChild(document.createTextNode(text));
    return e;
  }

  function mo(op) { return el('mo', op); }

  function needsParens(node) {
    return node && (node.t === 'add' || node.t === 'neg');
  }

  function parenthesize(inner) {
    const row = el('mrow');
    row.appendChild(mo('('));
    row.appendChild(inner);
    row.appendChild(mo(')'));
    return row;
  }

  function render(node) {
    if (node == null) return el('mrow');
    switch (node.t) {
      case 'num':
        return el('mn', String(node.v));
      case 'sym':
        return el('mi', String(node.v));
      case 'add': {
        const row = el('mrow');
        const xs = node.xs || [];
        for (let i = 0; i < xs.length; i++) {
          const x = xs[i];
          if (x && x.t === 'neg') {
            row.appendChild(mo('−'));
            row.appendChild(needsParens(x.x) ? parenthesize(render(x.x)) : render(x.x));
          } else {
            if (i > 0) row.appendChild(mo('+'));
            row.appendChild(render(x));
          }
        }
        return row;
      }
      case 'neg': {
        const row = el('mrow');
        row.appendChild(mo('−'));
        row.appendChild(needsParens(node.x) ? parenthesize(render(node.x)) : render(node.x));
        return row;
      }
      case 'mul': {
        const row = el('mrow');
        const xs = node.xs || [];
        for (let i = 0; i < xs.length; i++) {
          if (i > 0) row.appendChild(mo('⁢')); // invisible times
          const x = xs[i];
          row.appendChild(needsParens(x) ? parenthesize(render(x)) : render(x));
        }
        return row;
      }
      case 'frac': {
        const f = el('mfrac');
        f.appendChild(wrapRow(render(node.num)));
        f.appendChild(wrapRow(render(node.den)));
        return f;
      }
      case 'pow': {
        const s = el('msup');
        const base = node.base;
        const b = render(base);
        const wrap = base && (base.t === 'add' || base.t === 'neg' || base.t === 'mul' ||
                              base.t === 'frac' || base.t === 'exp');
        s.appendChild(wrap ? parenthesize(b) : b);
        s.appendChild(wrapRow(render(node.exp)));
        return s;
      }
      case 'sub': {
        const s = el('msub');
        s.appendChild(render(node.base));
        s.appendChild(wrapRow(render(node.sub)));
        return s;
      }
      case 'sqrt': {
        const s = el('msqrt');
        s.appendChild(wrapRow(render(node.x)));
        return s;
      }
      case 'exp': {
        const s = el('msup');
        s.appendChild(el('mi', 'e'));
        s.appendChild(wrapRow(render(node.arg)));
        return s;
      }
      case 'func': {
        const row = el('mrow');
        row.appendChild(el('mi', String(node.name)));
        row.appendChild(mo('⁡')); // function application
        const a = node.arg;
        if (a && (a.t === 'sym' || a.t === 'num' || a.t === 'sub')) {
          row.appendChild(render(a));
        } else {
          row.appendChild(parenthesize(render(a)));
        }
        return row;
      }
      case 'paren':
        return parenthesize(render(node.x));
      case 'row': {
        const row = el('mrow');
        for (const x of (node.xs || [])) row.appendChild(render(x));
        return row;
      }
      default:
        return el('mtext', '?');
    }
  }

  function wrapRow(e) {
    if (e.tagName && e.tagName.toLowerCase() === 'mrow') return e;
    const row = el('mrow');
    row.appendChild(e);
    return row;
  }

  /* ---- ASCII serialization (fallback text for html.no-mathml) ---- */

  const SYM_MAP = {
    'ψ': 'psi', 'Ψ': 'Psi', 'π': 'pi', 'θ': 'theta',
    'φ': 'phi', 'ϕ': 'phi', 'ρ': 'rho', 'α': 'alpha',
    'β': 'beta', 'γ': 'gamma', 'ω': 'omega', 'Ω': 'Omega',
    'Δ': 'Delta', 'μ': 'mu', 'ℓ': 'l', 'ℏ': 'hbar',
    '∞': 'inf', '−': '-', '·': '*', '⋅': '*',
    '×': '*', '⁡': '', '⁢': '*',
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
    '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    '²': '^2', '³': '^3', '⁻': '-', '⁰': '0', '¹': '1',
  };

  function asciiText(s) {
    let out = '';
    for (const ch of String(s)) {
      out += (ch in SYM_MAP) ? SYM_MAP[ch] : ch;
    }
    return out;
  }

  function simple(node) {
    return node && (node.t === 'num' || node.t === 'sym' || node.t === 'sub');
  }

  function ascii(node) {
    if (node == null) return '';
    switch (node.t) {
      case 'num': return asciiText(node.v);
      case 'sym': return asciiText(node.v);
      case 'add': {
        let out = '';
        const xs = node.xs || [];
        for (let i = 0; i < xs.length; i++) {
          const x = xs[i];
          if (x && x.t === 'neg') {
            out += (i > 0 ? ' - ' : '-') + asciiWrap(x.x);
          } else {
            out += (i > 0 ? ' + ' : '') + ascii(x);
          }
        }
        return out;
      }
      case 'neg': return '-' + asciiWrap(node.x);
      case 'mul': {
        return (node.xs || []).map(asciiWrap).join('*');
      }
      case 'frac': {
        const n = simple(node.num) ? ascii(node.num) : '(' + ascii(node.num) + ')';
        const d = simple(node.den) ? ascii(node.den) : '(' + ascii(node.den) + ')';
        return n + '/' + d;
      }
      case 'pow': {
        const b = simple(node.base) ? ascii(node.base) : '(' + ascii(node.base) + ')';
        const e = simple(node.exp) ? ascii(node.exp) : '(' + ascii(node.exp) + ')';
        return b + '^' + e;
      }
      case 'sub': return ascii(node.base) + '_' + ascii(node.sub);
      case 'sqrt': return 'sqrt(' + ascii(node.x) + ')';
      case 'exp': return 'exp(' + ascii(node.arg) + ')';
      case 'func': return asciiText(node.name) + '(' + ascii(node.arg) + ')';
      case 'paren': return '(' + ascii(node.x) + ')';
      case 'row': return (node.xs || []).map(ascii).join(' ');
      default: return '?';
    }
  }

  function asciiWrap(node) {
    return (node && (node.t === 'add' || node.t === 'neg'))
      ? '(' + ascii(node) + ')'
      : ascii(node);
  }

  /* ---- support detection ---- */

  let cachedSupport = null;

  function supported() {
    if (cachedSupport !== null) return cachedSupport;
    if (typeof document === 'undefined' || !document.body) {
      return false; // do not cache: body may not exist yet
    }
    try {
      const host = document.createElement('div');
      host.style.cssText =
        'position:absolute;left:-9999px;top:0;visibility:hidden;font-size:16px;';
      const math = el('math');
      const frac = el('mfrac');
      frac.appendChild(el('mn', '1'));
      frac.appendChild(el('mn', '2'));
      math.appendChild(frac);
      host.appendChild(math);
      const span = document.createElement('span');
      span.textContent = '1';
      host.appendChild(span);
      document.body.appendChild(host);
      const hM = math.getBoundingClientRect().height;
      const hS = span.getBoundingClientRect().height;
      document.body.removeChild(host);
      // a rendered fraction stacks two rows; unsupported engines inline the text
      cachedSupport = hM > hS * 1.4;
    } catch (e) {
      cachedSupport = false;
    }
    return cachedSupport;
  }

  VV.mathml = {
    NS: MML,

    fromAST: function (node) {
      const math = el('math');
      math.setAttribute('display', 'block');
      math.setAttribute('data-ascii', ascii(node));
      math.appendChild(wrapRow(render(node)));
      return math;
    },

    toAscii: ascii,
    supported: supported,

    // Adds html.no-mathml when MathML Core is unavailable; returns support bool.
    ensureClass: function () {
      const ok = supported();
      if (!ok && typeof document !== 'undefined') {
        document.documentElement.classList.add('no-mathml');
      }
      return ok;
    },
  };
})();
