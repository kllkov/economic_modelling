// Сверка формул на сайте с решателями всех моделей.
// Берём ровно те TeX-строки, которые показывает сайт (блоки 1–3: задача, уравнения, стационар),
// подставляем в них параметры и решённые траектории и проверяем, что каждое равенство выполняется.
// Так ловится любое расхождение между тем, что напечатано, и тем, что считается.
import assert from 'node:assert/strict';
import * as ramsey from '../site/assets/js/models/ramsey.js';
import * as solow from '../site/assets/js/models/solow.js';
import * as fisher from '../site/assets/js/models/fisher.js';
import * as ispcmpr from '../site/assets/js/models/ispcmpr.js';
import * as rbc from '../site/assets/js/models/rbc.js';

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
  if (/[A-Za-z\\]/.test(s.replace(/(\d)e(-?\d)/g, '$1$2'))) throw new Error(`не распознано: «${s}» (из «${src}»)`);
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
function equations(tex, hats = false) {
  let s = tex.replace(/\\text\{[^}]*\}/g, ' ').replace(/\\(left|right|big|Big|bigl|bigr)\b/g, '')
    .replace(/\\[,;!]/g, ' ').replace(/\\ /g, ' ').replace(/\\quad\b/g, ' ')
    .replace(/\\(qquad|Rightarrow|Leftrightarrow)\b/g, '¦').replace(/\\equiv/g, '=').replace(/\\%/g, '');
  // запятые верхнего уровня — разделители
  let depth = 0, out = '';
  for (const ch of s) { if ('({['.includes(ch)) depth++; if (')}]'.includes(ch)) depth--; out += ch === ',' && depth === 0 ? '¦' : ch; }
  return out.split('¦').map((x) => x.trim()).filter((x) => x.includes('=') && !(hats ? /\\(max|lim|sum|int)|𝟙|[<>]|\\[gl]eq?\b/ : /\\(max|lim|sum|int|hat)|𝟙|[<>]|\\[gl]eq?\b/).test(x));
}

let checked = 0;
function check(tex, vars, tol, where, hats = false) {
  for (const eq of equations(tex, hats)) {
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
          V = { ...P, r_t: L.r[i] / 100, 'r_{t+1}': L.r[i + 1] / 100, w_t: L.w[i], E_t: L.E[i], E_0: L.E[0], L_0: L.L[0], 'E_{t+1}': L.E[i + 1], L_t: L.L[i], 'L_{t+1}': L.L[i + 1] };
          if (tp) Object.assign(V, { '\\tilde c_{t+1}': E.c[i + 1], '\\tilde c_t': E.c[i], '\\tilde k_{t+1}': E.k[i + 1], '\\tilde k_t': E.k[i],
            '\\tilde w_t': L.w[i] / L.E[i], '\\tilde\\pi_t': 0 });
          else Object.assign(V, { 'c_{t+1}': L.c[i + 1], c_t: L.c[i], 'k_{t+1}': L.k[i + 1], k_t: L.k[i], '\\pi_t': 0 });
          if (utility === 'cara') Object.assign(V, { 'c_{t+1}': L.c[i + 1], c_t: L.c[i] });
        } else {
          // непрерывное время записано с индексом t, как и дискретное
          V = { ...P, r_t: L.r[i] / 100, w_t: L.w[i], E_t: L.E[i], E_0: L.E[0], L_0: L.L[0], L_t: L.L[i], '\\dot L_t': deriv(L.L, i, h), '\\dot E_t': deriv(L.E, i, h) };
          if (tp) Object.assign(V, { '\\dot{\\tilde c}_t': deriv(E.c, i, h), '\\tilde c_t': E.c[i], '\\dot{\\tilde k}_t': deriv(E.k, i, h), '\\tilde k_t': E.k[i],
            '\\tilde w_t': L.w[i] / L.E[i], '\\tilde\\pi_t': 0 });
          else Object.assign(V, { '\\dot c_t': deriv(L.c, i, h), c_t: L.c[i], '\\dot k_t': deriv(L.k, i, h), k_t: L.k[i], '\\pi_t': 0 });
          if (utility === 'cara') Object.assign(V, { '\\dot c_t': deriv(L.c, i, h), c_t: L.c[i] });
        }
        const kv = tp ? E.k[i] : L.k[i];
        Object.assign(V, { [tp ? '\\tilde k_t^D' : 'k_t^D']: kv, [tp ? '\\tilde k_t^S' : 'k_t^S']: kv, 'L_t^D': L.L[i], 'L_t^S': L.L[i] });
        const tol = D ? { abs: 1e-9, rel: 1e-9 } : { abs: 3e-4, rel: 2e-3 };
        const tolN = D ? { abs: 2e-4, rel: 2e-4 } : { abs: 5e-4, rel: 3e-3 };
        for (const g of version === 'centralized' ? F.cen : F.dec) for (const it of g.items) check(it, V, tol, `${where}, блок «${g.agent}», t=${res.t[i]}`);
        for (const r of F.system) { check(r.tex, V, tol, `${where}, «${r.label}», t=${res.t[i]}`); check(r.num, V, tolN, `${where}, «${r.label}» (числа), t=${res.t[i]}`); }
      }
      // стационар
      const S = res.ss0;
      const VS = { ...P, '\\tilde k^*': S.k, 'k^*': S.k, '\\tilde y^*': S.y, 'y^*': S.y, '\\tilde i^*': S.i, 'i^*': S.i, '\\tilde c^*': S.c, 'c^*': S.c,
        'r^*': S.r, 's^*': S.s, '\\tilde w^*': S.w, 'w^*': S.w, 'F^{\\prime}_K': S.r + st.delta, 'F^{\\prime}_L': S.w, '\\tilde F^{\\prime}_L': S.w };
      // таблица ТСР: «величина = формула» и «величина = значение»
      for (const r of ramsey.steadyTable(st, res)) {
        check(`${r.sym}=${r.tex}`, VS, { abs: 1e-10, rel: 1e-10 }, `${where}, таблица ТСР (${r.name})`);
        check(`${r.sym}=${r.value}`, VS, { abs: 1e-12, rel: 1e-12 }, `${where}, таблица ТСР: значение (${r.name})`);
      }
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
        V = { ...P, r_t: L.r[i] / 100, w_t: L.w[i], E_t: L.E[i], E_0: L.E[0], L_0: L.L[0], 'E_{t+1}': L.E[i + 1], L_t: L.L[i], 'L_{t+1}': L.L[i + 1],
          Y_t: A.y[i], K_t: A.k[i], 'K_{t+1}': A.k[i + 1], C_t: A.c[i], I_t: A.i[i] };
        if (tp) Object.assign(V, { '\\tilde k_{t+1}': E.k[i + 1], '\\tilde k_t': E.k[i], '\\tilde b_{t+1}': E.k[i + 1], '\\tilde b_t': E.k[i],
          '\\tilde c_t': E.c[i], '\\tilde y_t': E.y[i], '\\tilde i_t': E.i[i], '\\tilde w_t': L.w[i] / L.E[i] });
        else Object.assign(V, { 'k_{t+1}': L.k[i + 1], k_t: L.k[i], 'b_{t+1}': L.k[i + 1], b_t: L.k[i], c_t: L.c[i], y_t: L.y[i], i_t: L.i[i] });
      } else {
        // непрерывное время записано с индексом t, как и дискретное
        V = { ...P, r_t: L.r[i] / 100, w_t: L.w[i], E_t: L.E[i], E_0: L.E[0], L_0: L.L[0], L_t: L.L[i], '\\dot L_t': deriv(L.L, i, h), '\\dot E_t': deriv(L.E, i, h),
          Y_t: A.y[i], K_t: A.k[i], C_t: A.c[i], I_t: A.i[i] };
        if (tp) Object.assign(V, { '\\dot{\\tilde k}_t': deriv(E.k, i, h), '\\tilde k_t': E.k[i], '\\dot{\\tilde b}_t': deriv(E.k, i, h), '\\tilde b_t': E.k[i],
          '\\tilde c_t': E.c[i], '\\tilde y_t': E.y[i], '\\tilde i_t': E.i[i], '\\tilde w_t': L.w[i] / L.E[i] });
        else Object.assign(V, { '\\dot k_t': deriv(L.k, i, h), k_t: L.k[i], '\\dot b_t': deriv(L.k, i, h), b_t: L.k[i], c_t: L.c[i], y_t: L.y[i], i_t: L.i[i] });
      }
      const tol = D ? { abs: 1e-9, rel: 1e-9 } : { abs: 1e-5, rel: 1e-4 };
      const tolN = D ? { abs: 2e-4, rel: 2e-4 } : { abs: 2e-4, rel: 2e-4 };
      for (const g of version === 'centralized' ? F.cen : F.dec) for (const it of g.items) check(it, V, tol, `${where}, блок «${g.agent}», t=${res.t[i]}`);
      for (const r of F.system) { check(r.tex, V, tol, `${where}, «${r.label}», t=${res.t[i]}`); check(r.num, V, tolN, `${where}, «${r.label}» (числа), t=${res.t[i]}`); }
    }
    const S = res.ss0;
    const VS = { ...P, '\\tilde k^*': S.k, 'k^*': S.k, '\\tilde y^*': S.y, 'y^*': S.y, '\\tilde c^*': S.c, 'c^*': S.c, 'r^*': S.r, '\\tilde w^*': S.w, 'w^*': S.w, 'F^{\\prime}_K': S.r + st.delta, 'F^{\\prime}_L': S.w, '\\tilde F^{\\prime}_L': S.w,
      '\\tilde k_{GR}': S.kGR, 'k_{GR}': S.kGR, 's_{GR}': st.alpha };
    Object.assign(VS, { '\\tilde i^*': S.i, 'i^*': S.i, '\\tilde c_{GR}': S.cGR, 'c_{GR}': S.cGR });
    for (const r of solow.steadyTable(st, res)) if (r.key) {
      check(`${r.sym}=${r.tex}`, VS, { abs: 1e-10, rel: 1e-10 }, `${where}, таблица ТСР (${r.name})`);
      check(`${r.sym}=${r.value}`, VS, { abs: 1e-12, rel: 1e-12 }, `${where}, таблица ТСР: значение (${r.name})`);
    }
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
        : { ...P, '\\dot c_t': deriv(L.c, i, h), c_t: L.c[i], '\\dot b_t': deriv(L.b, i, h), b_t: L.b[i], w_t: L.w[i] };
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

// ─────────────── модель IS–PC–MPR ───────────────
// Ставки, инфляция и разрывы в коде — в процентах. Строки с числами сверяются в процентах,
// символьные формулы (в них ρ = −ln β) — в долях: модель линейна, поэтому все уровни делятся на 100.
{
  let n = 0;
  for (const expectations of ['naive', 'adaptive', 'rational']) for (const shockTarget of ['d', 'u', 'v', 'a'])
    for (const shockPersistence of ['permanent', 'temporary'])
      for (const shockTiming of expectations === 'rational' ? ['unexpected', 'expected'] : ['unexpected']) {
        const st = { ...ispcmpr.defaults, expectations, shockTarget, shockPersistence, shockTiming, shockSize: 1, tHat: 5, t0: 2, horizon: 40 };
        const res = ispcmpr.solve(st);
        assert.ok(res.ok, JSON.stringify(st) + res.errors);
        const F = ispcmpr.formulas(st), C = res.C, S = res.sim;
        const Ex = expectations === 'rational' ? '\\mathbb E_t' : 'E^*_t';
        const P = { '\\beta': st.beta, '\\sigma': st.sigma, '\\varphi': st.varphi, '\\alpha': st.alpha, '\\varepsilon': st.epsilon,
          '\\theta': st.theta, '\\phi_\\pi': st.phiPi, '\\phi_y': st.phiY, '\\gamma': st.gamma,
          '\\kappa': C.kappa, '\\lambda': C.lambda, '\\psi_{ya}': C.psi };
        const where = `IS–PC–MPR ${expectations} ${shockTarget} ${shockPersistence} ${shockTiming}`;
        const vars = (t, q) => {
          const E = S.E[t], aE = t >= S.t0 ? S.E[t + 1].a : E.a;
          return { ...P, '\\rho': q === 1 ? C.rho : C.rho / 100,
            [`${Ex}\\tilde y_{t+1}`]: S.ex[t] / q, [`${Ex}\\pi_{t+1}`]: S.epi[t] / q, [`${Ex}a_{t+1}`]: aE / q,
            'E^*_{t-1}\\tilde y_t': S.ex[t - 1] / q, 'E^*_{t-1}\\pi_t': S.epi[t - 1] / q,
            '\\tilde y_{t-1}': S.x[t - 1] / q, '\\pi_{t-1}': S.pi[t - 1] / q,
            '\\tilde y_t': S.x[t] / q, '\\pi_t': S.pi[t] / q, i_t: S.i[t] / q, r_t: S.r[t] / q, 'r^n_t': S.rn[t] / q,
            u_t: E.u / q, v_t: E.v / q, d_t: E.d / q, a_t: E.a / q,
            'y^n_t': C.psi * E.a / q, y_t: (C.psi * E.a + S.x[t]) / q };
        };
        const tol = { abs: 1e-10, rel: 1e-10 }, tolN = { abs: 2e-4, rel: 2e-4 };
        const groups = F.problem.filter((g) => g.agent === 'Центральный банк' || g.agent === 'Ожидания');
        for (const t of [1, 2, 4, 5, 6, 10, 39]) {
          const Vf = vars(t, 100), Vp = vars(t, 1);
          for (const g of groups) for (const it of g.items) check(it, Vf, tol, `${where}, блок «${g.agent}», t=${t}`);
          for (const r of F.system) {
            check(r.tex, Vf, tol, `${where}, «${r.label}», t=${t}`);
            if (r.num) check(r.num, Vp, tolN, `${where}, «${r.label}» (числа), t=${t}`);
          }
        }
        // стационар до шока
        const s0 = res.ss0;
        const VS = (q) => ({ ...P, '\\rho': q === 1 ? C.rho : C.rho / 100, '\\pi': s0.pi / q, '\\tilde y': s0.x / q, i: s0.i / q, r: s0.r / q,
          [`${Ex}\\pi_{t+1}`]: s0.epi / q });
        for (const r of F.ss) {
          check(r.tex, VS(100), tol, `${where}, стационар`);
          if (r.num) check(r.num, VS(1), tolN, `${where}, стационар (числа)`);
        }
        n++;
      }
  console.log(`IS–PC–MPR: ${n} конфигураций`);
}

// ─────────────── модель RBC ───────────────
{
  let n = 0;
  const SH = { tfp: 1, k: -10, beta: 0.002, theta: 0.4, chi: 0.5, delta: 0.005 };
  for (const version of ['decentralized', 'centralized']) for (const variant of ['base', 'n', 'tp', 'both'])
    for (const shockTarget of Object.keys(SH)) for (const shockPersistence of ['temporary', 'permanent']) {
      const isPar = !['tfp', 'k'].includes(shockTarget);
      if (!isPar && shockPersistence === 'permanent') continue;
      const where = `RBC ${version} ${variant} ${shockTarget} ${shockPersistence}`;
      const hasN = variant === 'n' || variant === 'both', hasG = variant === 'tp' || variant === 'both';
      const mode = hasG ? 'eff' : hasN ? 'pc' : 'agg';
      const base = { ...rbc.defaults, version, variant, shockTarget, shockSize: SH[shockTarget], shockPersistence, tHat: 3, horizon: 40 };
      const P = { '\\alpha': base.alpha, '\\beta': base.beta, '\\delta': base.delta, '\\theta': base.theta, '\\chi': base.chi, '\\rho': base.rho,
        n: hasN ? base.n : 0, g: hasG ? base.g : 0 };
      const X = (L0, lo) => (mode === 'eff' ? `\\tilde ${lo}` : mode === 'pc' ? lo : L0);
      // нелинейное решение: точные уравнения (блоки 1–2) и таблица стационара
      {
        const st = { ...base, method: 'nonlinear' };
        const res = rbc.solve(st);
        assert.ok(res.ok, where + res.errors);
        const F = rbc.formulas(st), L = res.levels, E = res.eff, A = res.agg;
        for (const i of [4, 5, 10, 20]) {
          const V = { ...P, r_t: L.r[i] / 100, 'r_{t+1}': L.r[i + 1] / 100, N_t: L.N[i], 'N_{t+1}': L.N[i + 1], A_t: L.A[i], 'A_{t+1}': L.A[i + 1],
            'A^*': 1, '\\varepsilon_{t+1}': 0, '\\Pi_t': 0, '\\pi_t': 0, '\\tilde\\pi_t': 0, w_t: L.w[i], L_t: L.L[i], 'L_{t+1}': L.L[i + 1], E_t: L.E[i], 'E_{t+1}': L.E[i + 1],
            E_0: 1, L_0: 1, K_t: A.k[i], Y_t: A.y[i], C_t: A.c[i], I_t: A.i[i], 'K_t^D': A.k[i], 'K_t^S': A.k[i], 'N_t^D': L.N[i], 'N_t^S': L.N[i],
            [`${X('C', 'c')}_{t+1}`]: E.c[i + 1], [`${X('C', 'c')}_t`]: E.c[i], [`${X('K', 'k')}_{t+1}`]: E.k[i + 1], [`${X('K', 'k')}_t`]: E.k[i],
            [`${X('Y', 'y')}_t`]: E.y[i], [`${X('I', 'i')}_t`]: E.i[i], [hasG ? '\\tilde w_t' : 'w_t']: E.w[i] };
          if (isPar) { const sym = { beta: '\\beta', theta: '\\theta', chi: '\\chi', delta: '\\delta' }[shockTarget]; V[`${sym}_t`] = L.par[i]; V[`${sym}_{t+1}`] = L.par[i + 1]; }
          const tol = { abs: 1e-9, rel: 1e-9 }, tolN = { abs: 2e-4, rel: 2e-4 };
          for (const g of version === 'centralized' ? F.cen : F.dec) for (const it of g.items) check(it, V, tol, `${where}, блок «${g.agent}», t=${i}`);
          for (const r of F.system) { check(r.tex, V, tol, `${where}, «${r.label}», t=${i}`); check(r.num, V, tolN, `${where}, «${r.label}» (числа), t=${i}`); }
        }
        const S = res.ss0, Y = (L0, lo) => (mode === 'eff' ? `\\tilde ${lo}^*` : mode === 'pc' ? `${lo}^*` : `${L0}^*`);
        const VS = { ...P, 'r^*': S.r, 'N^*': S.N, [Y('K', 'k')]: S.k, [Y('Y', 'y')]: S.y, [Y('C', 'c')]: S.c, [Y('I', 'i')]: S.i, [hasG ? '\\tilde w^*' : 'w^*']: S.w };
        for (const r of rbc.steadyTable(st, res)) {
          check(`${r.sym}=${r.tex}`, VS, { abs: 1e-10, rel: 1e-10 }, `${where}, таблица стационара (${r.name})`);
          check(`${r.sym}=${r.value}`, VS, { abs: 1e-12, rel: 1e-12 }, `${where}, таблица стационара: значение (${r.name})`);
        }
      }
      // лог-линейное решение: лог-линейная система и функции политики (блок 3)
      {
        const st = { ...base, method: 'linear' };
        const res = rbc.solve(st);
        assert.ok(res.ok, where);
        const [B] = rbc.systemBlocks(st), I = res.irf, S = res.ss0, pol = res.pol, Lv = res.levels;
        const h = (L0, lo) => (mode === 'eff' ? `\\hat{\\tilde ${lo}}` : mode === 'pc' ? `\\hat ${lo}` : `\\hat ${L0}`);
        const Y = (L0, lo) => (mode === 'eff' ? `\\tilde ${lo}^*` : mode === 'pc' ? `${lo}^*` : `${L0}^*`);
        for (const i of [3, 4, 10, 25]) {
          const V = { ...P, 'r^*': S.r, 'N^*': S.N, '\\Delta r_t': I.r[i] / 100, '\\Delta r_{t+1}': I.r[i + 1] / 100, '\\hat N_t': I.N[i] / 100, '\\hat A_t': I.A[i] / 100, '\\hat A_{t+1}': I.A[i + 1] / 100,
            [`${h('C', 'c')}_t`]: I.c[i] / 100, [`${h('C', 'c')}_{t+1}`]: I.c[i + 1] / 100, [`${h('K', 'k')}_t`]: I.k[i] / 100, [`${h('K', 'k')}_{t+1}`]: I.k[i + 1] / 100,
            [`${h('Y', 'y')}_t`]: I.y[i] / 100, [`${h('I', 'i')}_t`]: I.i[i] / 100, [`${hasG ? '\\hat{\\tilde w}' : '\\hat w'}_t`]: I.w[i] / 100,
            [Y('Y', 'y')]: S.y, [Y('C', 'c')]: S.c, [Y('I', 'i')]: S.i,
            '\\eta_{CK}': pol.cK, '\\eta_{CA}': pol.cA, '\\eta_{KK}': pol.KK, '\\eta_{KA}': pol.KA, '\\eta_{NK}': pol.NK, '\\eta_{NA}': pol.NA };
          if (isPar) {
            const p = Lv.par[i], p0 = st[shockTarget];
            Object.assign(V, { '\\hat\\beta_t': Math.log(p / p0), '\\hat\\theta_t': Math.log(p / p0), '\\Delta\\chi_t': p - p0, '\\Delta\\delta_t': p - p0,
              '\\beta_t': p, '\\theta_t': p, '\\chi_t': p, '\\delta_t': p });
          }
          const rows = B.groups.flatMap((G) => G.rows);
          // функции политики (K̂, Â) верны только без шока параметров; шок параметров — вне состояния (k̂, Â)
          for (const r of isPar ? B.groups[0].rows : rows) {
            check(r.tex, V, { abs: 1e-10, rel: 1e-10 }, `${where}, лог-лин. «${r.label}», t=${i}`, true);
            if (r.num) check(r.num, V, { abs: 2e-4, rel: 2e-4, floor: 1e-1 }, `${where}, лог-лин. «${r.label}» (числа), t=${i}`, true);
          }
        }
      }
      n++;
    }
  console.log(`RBC: ${n} конфигураций`);
}

console.log(`Проверено равенств: ${checked}. Формулы на сайте совпадают с решателями.`);
