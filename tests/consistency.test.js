// Сверка формул на сайте с решателями.
// Берём ровно те TeX-строки, которые показывает сайт (блоки 1–3: задача, уравнения, стационар),
// подставляем в них параметры и решённые траектории и проверяем, что каждое равенство выполняется.
// Так ловится любое расхождение между тем, что напечатано, и тем, что считается.
import assert from 'node:assert/strict';
import * as ramsey from '../site/assets/js/models/ramsey.js';
import * as solow from '../site/assets/js/models/solow.js';
import * as fisher from '../site/assets/js/models/fisher.js';

// ─────────────── мини-вычислитель TeX-выражений ───────────────
function evalTex(src, vars) {
  let s = src.replace(/\\dot\{([A-Za-z])\}/g, '\\dot $1');
  // подстановка переменных (длинные ключи первыми); однобуквенные — только как отдельные символы
  const keys = Object.keys(vars).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const v = `(${vars[k]})`;
    if (/^[A-Za-z]$/.test(k)) s = s.replace(new RegExp(`(?<![a-z\\\\])${k}(?![a-z_])`, 'g'), v);
    else s = s.split(k).join(v);
  }
  s = s.replace(/\\d?frac/g, '§').replace(/\\ln/g, '¤').replace(/\\cdot/g, '*');
  s = s.replace(/(?<![A-Za-z\\])e\^/g, '€^');
  if (/[A-Za-z\\]/.test(s)) throw new Error(`не распознано: «${s}» (из «${src}»)`);
  const toks = s.match(/\d+\.?\d*(?:e-?\d+)?|[-+*/^(){}\[\]§¤€]/g) || [];
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const close = { '(': ')', '{': '}', '[': ']' };
  function primary() {
    const t = next();
    if (t === undefined) throw new Error(`обрыв выражения: ${src}`);
    if (/^\d/.test(t)) return parseFloat(t);
    if (t in close) { const v = expr(); const c = next(); if (c !== close[t]) throw new Error(`скобки: ${src}`); return v; }
    if (t === '§') { const a = primary(); const b = primary(); return a / b; }
    if (t === '¤') return Math.log(factor());
    if (t === '€') return Math.E;
    if (t === '-') return -factor();
    if (t === '+') return factor();
    throw new Error(`токен «${t}» в ${src}`);
  }
  function factor() {
    let v = primary();
    while (peek() === '^') { next(); v = Math.pow(v, primary()); }
    return v;
  }
  function term() {
    let v = factor();
    for (;;) {
      const t = peek();
      if (t === '*') { next(); v *= factor(); } else if (t === '/') { next(); v /= factor(); }
      else if (t !== undefined && (/^\d/.test(t) || t in close || t === '§' || t === '¤' || t === '€')) v *= factor();
      else return v;
    }
  }
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') v = next() === '+' ? v + term() : v - term();
    return v;
  }
  const v = expr();
  if (p !== toks.length) throw new Error(`лишнее в конце: ${src}`);
  return v;
}

// строка с формулой → список проверяемых равенств
function equations(tex) {
  let s = tex.replace(/\\text\{[^}]*\}/g, ' ').replace(/\\(left|right|big|Big|bigl|bigr)\b/g, '')
    .replace(/\\[,;!]/g, ' ').replace(/\\ /g, ' ').replace(/\\quad\b/g, ' ')
    .replace(/\\(qquad|Rightarrow|Leftrightarrow)\b/g, '¦').replace(/\\equiv/g, '=');
  // запятые верхнего уровня — разделители
  let depth = 0, out = '';
  for (const ch of s) { if ('({['.includes(ch)) depth++; if (')}]'.includes(ch)) depth--; out += ch === ',' && depth === 0 ? '¦' : ch; }
  return out.split('¦').map((x) => x.trim()).filter((x) => x.includes('=') && !/\\(max|lim|sum|int|hat)|𝟙|[<>]|\\[gl]eq?\b/.test(x));
}

let checked = 0;
function check(tex, vars, tol, where) {
  for (const eq of equations(tex)) {
    const sides = eq.split('=').map((x) => evalTex(x, vars));
    for (let i = 1; i < sides.length; i++) {
      const a = sides[0], b = sides[i];
      const scale = Math.max(Math.abs(a), Math.abs(b), tol.floor ?? 1e-2);
      assert.ok(Math.abs(a - b) <= tol.abs + tol.rel * scale, `${where}\n  ${eq}\n  ${a} ≠ ${b}`);
      checked++;
    }
  }
}

const deriv = (arr, i, h) => (arr[i + 1] - arr[i - 1]) / (2 * h);

// ─────────────── модель Рамсея ───────────────
{
  let n = 0;
  for (const time of ['discrete', 'continuous']) for (const version of ['decentralized', 'centralized'])
    for (const variant of ['base', 'tp']) for (const utility of ['crra', 'log', 'cara']) for (const objective of ['mill', 'bentham']) {
      if (utility === 'cara' && variant === 'tp') continue;
      const st = { ...ramsey.defaults, time, version, variant, utility, objective, n: 0.01, shockTarget: 'k', shockSize: -30, tHat: 0, horizon: 60 };
      const res = ramsey.solve(st);
      assert.ok(res.ok, JSON.stringify(st) + res.errors);
      const F = ramsey.formulas(st);
      const tp = variant === 'tp', D = time === 'discrete', h = res.t[1] - res.t[0];
      const P = { '\\alpha': st.alpha, '\\beta': st.beta, '\\delta': st.delta, '\\sigma': utility === 'log' ? 1 : st.sigma,
        '\\theta': st.theta, '\\rho': st.rho, n: st.n, g: tp ? st.g : 0 };
      const L = res.levels, E = res.eff;
      const where = `Рамсей ${time} ${version} ${variant} ${utility} ${objective}`;
      const pts = D ? [1, 2, 5, 10, 20] : [11, 25, 60, 120, 250];
      for (const i of pts) {
        let V;
        if (D) {
          V = { ...P, r_t: L.r[i] / 100, 'r_{t+1}': L.r[i + 1] / 100, w_t: L.w[i], E_t: L.E[i], 'E_{t+1}': L.E[i + 1], L_t: L.L[i], 'L_{t+1}': L.L[i + 1] };
          if (tp) Object.assign(V, { '\\tilde c_{t+1}': E.c[i + 1], '\\tilde c_t': E.c[i], '\\tilde k_{t+1}': E.k[i + 1], '\\tilde k_t': E.k[i],
            '\\tilde b_{t+1}': E.k[i + 1], '\\tilde b_t': E.k[i], '\\tilde w_t': L.w[i] / L.E[i] });
          else Object.assign(V, { 'c_{t+1}': L.c[i + 1], c_t: L.c[i], 'k_{t+1}': L.k[i + 1], k_t: L.k[i], 'b_{t+1}': L.k[i + 1], b_t: L.k[i] });
          if (utility === 'cara') Object.assign(V, { 'c_{t+1}': L.c[i + 1], c_t: L.c[i] });
        } else {
          V = { ...P, r: L.r[i] / 100, w: L.w[i], E: L.E[i], L: L.L[i], '\\dot L': deriv(L.L, i, h), '\\dot E': deriv(L.E, i, h) };
          if (tp) Object.assign(V, { '\\dot{\\tilde c}': deriv(E.c, i, h), '\\tilde c': E.c[i], '\\dot{\\tilde k}': deriv(E.k, i, h), '\\tilde k': E.k[i],
            '\\dot{\\tilde b}': deriv(E.k, i, h), '\\tilde b': E.k[i], '\\tilde w': L.w[i] / L.E[i],
            '\\tilde b(t)': E.k[i], '\\tilde k(t)': E.k[i] });
          else Object.assign(V, { '\\dot c': deriv(L.c, i, h), c: L.c[i], '\\dot k': deriv(L.k, i, h), k: L.k[i], '\\dot b': deriv(L.k, i, h), b: L.k[i],
            'b(t)': L.k[i], 'k(t)': L.k[i] });
          if (utility === 'cara') Object.assign(V, { '\\dot c': deriv(L.c, i, h), c: L.c[i] });
        }
        const tol = D ? { abs: 1e-9, rel: 1e-9 } : { abs: 3e-4, rel: 2e-3 };
        const tolN = D ? { abs: 2e-4, rel: 2e-4 } : { abs: 5e-4, rel: 3e-3 };
        for (const g of version === 'centralized' ? F.cen : F.dec) for (const it of g.items) check(it, V, tol, `${where}, блок «${g.agent}», t=${res.t[i]}`);
        for (const r of F.system) { check(r.tex, V, tol, `${where}, «${r.label}», t=${res.t[i]}`); check(r.num, V, tolN, `${where}, «${r.label}» (числа), t=${res.t[i]}`); }
      }
      // стационар
      const S = res.ss0;
      const VS = { ...P, '\\tilde k^*': S.k, 'k^*': S.k, '\\tilde c^*': S.c, 'c^*': S.c, 'r^*': S.r, '\\tilde w^*': S.w, 'w^*': S.w, 'F^{\\prime}_K': S.r + st.delta, 'F^{\\prime}_L': S.w, '\\tilde F^{\\prime}_L': S.w };
      for (const r of F.ss) { check(r.tex, VS, { abs: 1e-10, rel: 1e-10 }, `${where}, стационар`); check(r.num, VS, { abs: 1e-4, rel: 1e-4 }, `${where}, стационар (числа)`); }
      n++;
    }
  console.log(`Рамсей: ${n} конфигураций`);
}

// ─────────────── модель Солоу ───────────────
{
  let n = 0;
  for (const time of ['discrete', 'continuous']) for (const version of ['decentralized', 'centralized']) for (const variant of ['base', 'tp']) {
    const st = { ...solow.defaults, time, version, variant, shockTarget: 'k', shockSize: -40, tHat: 0, horizon: 60 };
    const res = solow.solve(st);
    assert.ok(res.ok);
    const F = solow.formulas(st);
    const tp = variant === 'tp', D = time === 'discrete', h = res.t[1] - res.t[0];
    const P = { '\\alpha': st.alpha, '\\delta': st.delta, n: st.n, g: tp ? st.g : 0, s: st.s };
    const L = res.levels, E = res.eff, A = res.agg;
    const where = `Солоу ${time} ${version} ${variant}`;
    const pts = D ? [1, 2, 5, 10, 20] : [11, 25, 60, 120, 250];
    for (const i of pts) {
      let V;
      if (D) {
        V = { ...P, r_t: L.r[i] / 100, w_t: L.w[i], E_t: L.E[i], 'E_{t+1}': L.E[i + 1], L_t: L.L[i], 'L_{t+1}': L.L[i + 1],
          Y_t: A.y[i], K_t: A.k[i], 'K_{t+1}': A.k[i + 1], C_t: A.c[i], I_t: A.i[i] };
        if (tp) Object.assign(V, { '\\tilde k_{t+1}': E.k[i + 1], '\\tilde k_t': E.k[i], '\\tilde b_{t+1}': E.k[i + 1], '\\tilde b_t': E.k[i],
          '\\tilde c_t': E.c[i], '\\tilde y_t': E.y[i], '\\tilde \\imath_t': E.i[i], '\\tilde w_t': L.w[i] / L.E[i] });
        else Object.assign(V, { 'k_{t+1}': L.k[i + 1], k_t: L.k[i], 'b_{t+1}': L.k[i + 1], b_t: L.k[i], c_t: L.c[i], y_t: L.y[i], i_t: L.i[i] });
      } else {
        V = { ...P, r: L.r[i] / 100, w: L.w[i], E: L.E[i], L: L.L[i], '\\dot L': deriv(L.L, i, h), '\\dot E': deriv(L.E, i, h),
          Y: A.y[i], K: A.k[i], '\\dot K': deriv(A.k, i, h), C: A.c[i], I: A.i[i] };
        if (tp) Object.assign(V, { '\\dot{\\tilde k}': deriv(E.k, i, h), '\\tilde k': E.k[i], '\\dot{\\tilde b}': deriv(E.k, i, h), '\\tilde b': E.k[i],
          '\\tilde c': E.c[i], '\\tilde y': E.y[i], '\\tilde \\imath': E.i[i], '\\tilde w': L.w[i] / L.E[i] });
        else Object.assign(V, { '\\dot k': deriv(L.k, i, h), k: L.k[i], '\\dot b': deriv(L.k, i, h), b: L.k[i], c: L.c[i], y: L.y[i], i: L.i[i] });
      }
      const tol = D ? { abs: 1e-9, rel: 1e-9 } : { abs: 1e-5, rel: 1e-4 };
      const tolN = D ? { abs: 2e-4, rel: 2e-4 } : { abs: 2e-4, rel: 2e-4 };
      for (const g of version === 'centralized' ? F.cen : F.dec) for (const it of g.items) check(it, V, tol, `${where}, блок «${g.agent}», t=${res.t[i]}`);
      for (const r of F.system) { check(r.tex, V, tol, `${where}, «${r.label}», t=${res.t[i]}`); check(r.num, V, tolN, `${where}, «${r.label}» (числа), t=${res.t[i]}`); }
    }
    const S = res.ss0;
    const VS = { ...P, '\\tilde k^*': S.k, 'k^*': S.k, '\\tilde y^*': S.y, 'y^*': S.y, '\\tilde c^*': S.c, 'c^*': S.c, 'r^*': S.r, '\\tilde w^*': S.w, 'w^*': S.w, 'F^{\\prime}_K': S.r + st.delta, 'F^{\\prime}_L': S.w, '\\tilde F^{\\prime}_L': S.w,
      '\\tilde k_{GR}': S.kGR, 'k_{GR}': S.kGR, 's_{GR}': st.alpha };
    for (const r of F.ss) { check(r.tex, VS, { abs: 1e-10, rel: 1e-10 }, `${where}, стационар`); check(r.num, VS, { abs: 1e-4, rel: 1e-4 }, `${where}, стационар (числа)`); }
    n++;
  }
  console.log(`Солоу: ${n} конфигураций`);
}

// ─────────────── модель Фишера ───────────────
{
  let n = 0;
  for (const time of ['discrete', 'continuous']) for (const variant of ['const', 'growing']) for (const utility of ['crra', 'log', 'cara']) {
    const st = { ...fisher.defaults, time, variant, utility, b0: 2, shockTarget: 'r', shockSize: 0, tHat: 0, horizon: 60 };
    const res = fisher.solve(st);
    assert.ok(res.ok);
    const F = fisher.formulas(st);
    const D = time === 'discrete', h = res.t[1] - res.t[0], L = res.levels;
    const P = { '\\beta': st.beta, '\\rho': st.rho, '\\sigma': utility === 'log' ? 1 : st.sigma, '\\theta': st.theta,
      r: st.r, w: st.w, w_0: st.w, b_0: st.b0, g_w: variant === 'growing' ? st.gw : 0, W_0: res.summary.before.W };
    const where = `Фишер ${time} ${variant} ${utility}`;
    const pts = D ? [0, 1, 5, 20] : [11, 60, 200];
    for (const i of pts) {
      const V = D ? { ...P, 'c_{t+1}': L.c[i + 1], c_t: L.c[i], 'b_{t+1}': L.b[i + 1], b_t: L.b[i], w_t: L.w[i] }
        : { ...P, '\\dot c': deriv(L.c, i, h), c: L.c[i], '\\dot b': deriv(L.b, i, h), b: L.b[i], 'w(t)': L.w[i], 'c(t)': L.c[i] };
      const tol = D ? { abs: 1e-9, rel: 1e-9 } : { abs: 5e-4, rel: 3e-3 };
      for (const g of F.problem) for (const it of g.items) check(it, V, tol, `${where}, задача, t=${res.t[i]}`);
      for (const r of F.system) { check(r.tex, V, tol, `${where}, «${r.label}», t=${res.t[i]}`); check(r.num, V, D ? { abs: 2e-4, rel: 2e-4 } : tol, `${where}, «${r.label}» (числа)`); }
    }
    const sm = res.summary.before;
    const gamma = Math.pow(st.beta * (1 + st.r), 1 / (utility === 'log' ? 1 : st.sigma));
    const Dl = D ? Math.log(st.beta * (1 + st.r)) / st.theta : (st.r - st.rho) / st.theta;
    const VS = { ...P, W_0: sm.W, c_0: L.c[0], '\\gamma': gamma, '\\Delta': Dl };
    for (const r of F.ss) { check(r.tex, VS, D ? { abs: 1e-9, rel: 1e-9 } : { abs: 1e-4, rel: 5e-4 }, `${where}, оптимальное потребление`); check(r.num, VS, D ? { abs: 1e-4, rel: 1e-4 } : { abs: 1e-4, rel: 5e-4 }, `${where}, оптимальное потребление (числа)`); }
    n++;
  }
  console.log(`Фишер: ${n} конфигураций`);
}

console.log(`Проверено равенств: ${checked}. Формулы на сайте совпадают с решателями.`);
