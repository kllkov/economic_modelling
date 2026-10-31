// Модель реальных деловых циклов (RBC): настройки, решатель, формулы.
// Обозначения — как в лекции курса: C_t, N_t (доля времени, отданная работе), K_t, Y_t, I_t, w_t, r_t, A_t;
// u = ln C_t − θN_t^{1+χ}/(1+χ), Y_t = A_t K_t^α N_t^{1−α}, ln A_{t+1} = ρ ln A_t + ε_{t+1}.
// K_t — капитал, с которым производят в периоде t (выбран в t − 1). С трендами: L_t — население,
// E_t — трудосберегающий ТП, тильда — величины на эффективного работника. Множитель (1+n)(1+g)
// записан точно (в лекции — приближение 1 + n + g).
// Лог-отклонения — со шляпкой: X̂_t = ln X_t − ln X^*; ставка — отклонение в уровнях Δr_t (п. п.).
// Два способа решения: лог-линейное (функции политики, как в лекции) и нелинейное (точное, совершенное предвидение).
// В подписях интерфейса фрагменты между $…$ рендерятся KaTeX.

import { halfLife, tc } from '../charts.js';

// ───────────────────────────── Настройки ─────────────────────────────

const SHOCK_TARGETS = {
  tfp: { label: 'Технология $A_t$: шок $\\varepsilon$', unit: '%', def: 1, step: 0.5 },
  k:   { label: 'Капитал $K_t$', unit: '%', def: -10, step: 1 },
};

export const defaults = {
  time: 'discrete', version: 'decentralized', variant: 'base', method: 'linear',
  utility: 'log', production: 'cd',
  alpha: 1 / 3, beta: 0.99, delta: 0.025, theta: 4, chi: 1, rho: 0.95, n: 0.0025, g: 0.0055,
  k0: 7, shockTarget: 'tfp', shockSize: 1, tHat: 0, horizon: 40,
};

const shockTargetsFor = () => Object.entries(SHOCK_TARGETS).map(([v, d]) => ({ v, l: d.label }));

export const controls = [
  { section: 'Модель' },
  { id: 'version', label: 'Вид модели', type: 'segmented',
    options: [{ v: 'centralized', l: 'Централизованная' }, { v: 'decentralized', l: 'Децентрализованная' }] },
  { id: 'variant', label: 'Тренды', type: 'select',
    options: [{ v: 'base', l: 'Без трендов' }, { v: 'tp', l: 'Рост населения и трудосберегающий ТП' }] },
  { id: 'method', label: 'Решение', type: 'segmented',
    options: [{ v: 'linear', l: 'Лог-линейное' }, { v: 'nonlinear', l: 'Нелинейное' }],
    hint: (s) => (s.method === 'linear'
      ? 'Как в лекции: функции политики лог-линеаризованной системы'
      : 'Точное решение нелинейной системы при совершенном предвидении') },

  { section: 'Функции' },
  { id: 'utility', label: 'Полезность домохозяйств', type: 'select', rich: true,
    options: [{ v: 'log', l: '$\\ln C_t-\\theta\\frac{N_t^{1+\\chi}}{1+\\chi}$' }] },
  { id: 'production', label: 'Производственная функция', type: 'select',
    options: [{ v: 'cd', l: 'Кобб-Дуглас' }] },

  { section: 'Параметры' },
  { id: 'alpha', label: '$\\alpha$ — доля капитала', type: 'number', min: 0.01, max: 0.99, step: 0.01 },
  { id: 'beta', label: '$\\beta$ — дисконт-фактор', type: 'number', min: 0.5, max: 0.9999, step: 0.001 },
  { id: 'delta', label: '$\\delta$ — выбытие капитала', type: 'number', min: 0, max: 1, step: 0.005 },
  { id: 'theta', label: '$\\theta$ — тягость труда', type: 'number', min: 0.01, max: 100, step: 0.5 },
  { id: 'chi', label: '$\\chi$ — обратная эластичность Фриша', type: 'number', min: 0.01, max: 20, step: 0.1 },
  { id: 'rho', label: '$\\rho$ — персистентность технологии', type: 'number', slider: true, min: 0, max: 0.999, step: 0.001 },
  { id: 'n', label: '$n$ — темп роста $L_t$', type: 'number', min: -0.05, max: 0.2, step: 0.0005,
    show: (s) => s.variant === 'tp' },
  { id: 'g', label: '$g$ — темп роста $E_t$', type: 'number', min: -0.05, max: 0.2, step: 0.0005,
    show: (s) => s.variant === 'tp' },
  { id: 'k0', label: (s) => (s.variant === 'tp' ? '$\\tilde k_0$ — начальная капиталовооружённость' : '$K_0$ — начальный капитал'),
    type: 'number', min: 0.01, max: 1000, step: 0.5 },

  { section: 'Шок' },
  { id: 'shockTarget', label: 'На что шок', type: 'select', rich: true, options: shockTargetsFor },
  { id: 'shockSize', label: 'Величина, $\\%$', type: 'number', step: (s) => SHOCK_TARGETS[s.shockTarget]?.step ?? 0.5,
    hint: (s) => (s.shockTarget === 'tfp'
      ? 'Неожиданный шок $\\varepsilon$ в $\\hat t$; дальше $\\ln A_t$ затухает с персистентностью $\\rho$'
      : 'Неожиданное разрушение (или прирост) капитала в $\\hat t$') },
  { id: 'tHat', label: 'Момент шока $\\hat t$', type: 'number', min: 0, max: 100, step: 1 },

  { section: 'Отображение' },
  { id: 'horizon', label: 'Горизонт графиков (кварталы)', type: 'number', min: 10, max: 200, step: 5 },
];

export function normalize(s, changed) {
  if (!SHOCK_TARGETS[s.shockTarget]) { s.shockTarget = 'tfp'; changed = 'shockTarget'; }
  if (changed === 'shockTarget') s.shockSize = SHOCK_TARGETS[s.shockTarget].def;
  s.tHat = Math.max(0, Math.round(+s.tHat || 0));
  s.horizon = Math.max(10, Math.round(+s.horizon || 40));
  s.time = 'discrete';
  return s;
}

// ───────────────────────────── Стационар ─────────────────────────────

// Стационар (на ТСР — в единицах на эффективного работника) при параметрах s
export function steady(s) {
  const a = s.alpha, tp = s.variant === 'tp';
  const G = tp ? (1 + s.n) * (1 + s.g) : 1;      // темп роста агрегатов на ТСР
  const dep = G - 1 + s.delta;                     // ĩ* = dep·k̃*
  const r = G / s.beta - 1;
  const kap = Math.pow(a / (r + s.delta), 1 / (1 - a));   // k̃*/N*
  const w = (1 - a) * Math.pow(kap, a);
  const cN = Math.pow(kap, a) - dep * kap;                // c̃*/N*
  const N = Math.pow(w / (s.theta * cN), 1 / (1 + s.chi));
  const k = kap * N, y = Math.pow(kap, a) * N, c = cN * N, i = dep * k;
  return { G, dep, r, kap, w, cN, N, k, y, c, i, KY: k / y };
}

function validate(s) {
  const e = [];
  if (!(s.alpha > 0 && s.alpha < 1)) e.push('$\\alpha$ должна лежать в $(0,1)$.');
  if (!(s.beta > 0 && s.beta < 1)) e.push('$\\beta$ должен лежать в $(0,1)$.');
  if (!(s.delta >= 0 && s.delta <= 1)) e.push('$\\delta$ должна лежать в $[0,1]$.');
  if (!(s.theta > 0) || !(s.chi > 0)) e.push('$\\theta$ и $\\chi$ должны быть положительными.');
  if (!(s.rho >= 0 && s.rho < 1)) e.push('Персистентность $\\rho$ должна лежать в $[0,1)$.');
  if (!(s.k0 > 0)) e.push('Начальный капитал должен быть положительным.');
  if (s.shockTarget === 'k' && !(s.shockSize > -100)) e.push('Капитал не может упасть больше чем на 100%.');
  if (e.length) return e;
  const ss = steady(s);
  if (!(ss.r + s.delta > 0)) e.push('Нужно $r^*+\\delta>0$.');
  else if (!(ss.cN > 0)) e.push('Стационара нет: выпуска не хватает на восстановительные инвестиции, $\\tilde c^*\\le 0$.');
  else if (!(ss.N < 1)) e.push(`В стационаре часы упираются в потолок: $N^*=${fmtTex(ss.N, 3)}\\ge 1$. Увеличьте $\\theta$.`);
  return e;
}

// ───────────────────────────── Лог-линейное решение ─────────────────────────────

// Сведение лог-линейной системы: N̂ = (Â + αk̂ − ĉ)/(χ + α), остальные — функции (k̂, Â, ĉ).
// Функции политики ищем методом неопределённых коэффициентов: ĉ = η_CK k̂ + η_CA Â.
export function policy(s, ss = steady(s)) {
  const a = s.alpha, chi = s.chi, G = ss.G, d = s.delta;
  const nk = a / (chi + a), nA = 1 / (chi + a), nc = -1 / (chi + a);
  const yk = a + (1 - a) * nk, yA = 1 + (1 - a) * nA, yc = (1 - a) * nc;
  const ik = (ss.y * yk) / ss.i, iA = (ss.y * yA) / ss.i, ic = (ss.y * yc - ss.c) / ss.i;
  const mk = (ss.dep * ik + 1 - d) / G, mA = (ss.dep * iA) / G, mc = (ss.dep * ic) / G;
  const hk = yk - 1, hA = yA, hc = yc;              // ŷ − k̂
  const phi = (s.beta / G) * (ss.r + d);             // ĉ_{t+1} − ĉ_t = φ(ŷ_{t+1} − k̂_{t+1})
  const A2 = (1 - phi * hc) * mc, A1 = (1 - phi * hc) * mk - phi * hk * mc - 1, A0 = -phi * hk * mk;
  const disc = A1 * A1 - 4 * A2 * A0;
  if (!(disc >= 0)) return null;
  const roots = [(-A1 + Math.sqrt(disc)) / (2 * A2), (-A1 - Math.sqrt(disc)) / (2 * A2)];
  const cK = roots.find((x) => Math.abs(mk + mc * x) < 1);
  if (cK == null) return null;
  const q = cK * (1 - phi * hc) - phi * hk, rho = s.rho;
  const cA = (phi * hA * rho - q * mA) / (q * mc + rho * (1 - phi * hc) - 1);
  return { cK, cA, KK: mk + mc * cK, KA: mA + mc * cA, NK: nk + nc * cK, NA: nA + nc * cA, nk, nA, nc };
}

// путь из (k̂_0, Â_0) по функциям политики; возвращает уровни (на эфф. работника) на t = 0..T
function linPath(s, ss, pol, T, kh0, ah0) {
  const a = s.alpha, out = mkPath(T);
  let kh = kh0;
  for (let t = 0; t <= T; t++) {
    const ah = ah0 * Math.pow(s.rho, t);
    const ch = pol.cK * kh + pol.cA * ah, nh = pol.NK * kh + pol.NA * ah;
    const yh = ah + a * kh + (1 - a) * nh;
    const ih = (ss.y * yh - ss.c * ch) / ss.i;
    out.k[t] = ss.k * Math.exp(kh); out.c[t] = ss.c * Math.exp(ch); out.N[t] = ss.N * Math.exp(nh);
    out.y[t] = ss.y * Math.exp(yh); out.i[t] = ss.i * Math.exp(ih); out.w[t] = ss.w * Math.exp(yh - nh);
    out.r[t] = ss.r + (ss.r + s.delta) * (yh - kh); out.A[t] = Math.exp(ah);
    kh = pol.KK * kh + pol.KA * ah;
  }
  return out;
}

function mkPath(T) {
  const f = () => new Float64Array(T + 1);
  return { k: f(), c: f(), N: f(), y: f(), i: f(), w: f(), r: f(), A: f() };
}

// ───────────────────────────── Нелинейное решение ─────────────────────────────

// Метод Ньютона по x_t = ln c̃_t (t = 0..T−1); c̃_T — по лог-линейной функции политики (хвост пути).
// Часы — из «труд — досуг» и спроса на труд: N = [(1−α)A k̃^α/(θ c̃)]^{1/(χ+α)}.
function nlPath(s, ss, pol, T, k0, a0) {
  const a = s.alpha, d = s.delta, G = ss.G, ex = 1 / (s.chi + a);
  const lnA = Float64Array.from({ length: T + 1 }, (_, t) => a0 * Math.pow(s.rho, t));
  const P = mkPath(T);
  const run = (x) => {
    P.k[0] = k0;
    for (let t = 0; t <= T; t++) {
      P.c[t] = t < T ? Math.exp(x[t]) : ss.c * Math.exp(pol.cK * Math.log(P.k[T] / ss.k) + pol.cA * lnA[T]);
      const A = Math.exp(lnA[t]), ka = Math.pow(P.k[t], a);
      P.N[t] = Math.pow(((1 - a) * A * ka) / (s.theta * P.c[t]), ex);
      P.y[t] = A * ka * Math.pow(P.N[t], 1 - a);
      if (t < T) { P.k[t + 1] = (P.y[t] + (1 - d) * P.k[t] - P.c[t]) / G; if (!(P.k[t + 1] > 0)) return false; }
    }
    return true;
  };
  const resid = (x, R) => {
    if (!run(x)) return false;
    for (let t = 0; t < T; t++) {
      const gross = 1 + (a * P.y[t + 1]) / P.k[t + 1] - d;
      R[t] = Math.log((G * P.c[t + 1]) / P.c[t]) - Math.log(s.beta * gross);
      if (!Number.isFinite(R[t])) return false;
    }
    return true;
  };
  const lin = linPath(s, ss, pol, T, Math.log(k0 / ss.k), a0);
  let x = Float64Array.from({ length: T }, (_, t) => Math.log(lin.c[t]));
  const R = new Float64Array(T), R1 = new Float64Array(T), J = new Float64Array(T * T);
  if (!resid(x, R)) return null;
  const nrm = (v) => v.reduce((m, z) => Math.max(m, Math.abs(z)), 0);
  for (let it = 0; it < 40 && nrm(R) > 1e-12; it++) {
    const h = 1e-7;
    for (let j = 0; j < T; j++) {
      const xj = x[j]; x[j] = xj + h;
      if (!resid(x, R1)) return null;
      for (let i = 0; i < T; i++) J[i * T + j] = (R1[i] - R[i]) / h;
      x[j] = xj;
    }
    const dx = solveDense(J, R.map((v) => -v), T);
    if (!dx) return null;
    let lam = 1, ok = false;
    const base = nrm(R);
    while (lam > 1e-4) {
      const xn = x.map((v, i) => v + lam * dx[i]);
      if (resid(xn, R1) && nrm(R1) < base) { x = xn; R.set(R1); ok = true; break; }
      lam /= 2;
    }
    if (!ok) return null;
  }
  if (nrm(R) > 1e-9) return null;
  run(x);
  for (let t = 0; t <= T; t++) {
    P.A[t] = Math.exp(lnA[t]); P.i[t] = P.y[t] - P.c[t];
    P.w[t] = ((1 - a) * P.y[t]) / P.N[t]; P.r[t] = (a * P.y[t]) / P.k[t] - d;
  }
  return P;
}

// Гаусс с выбором главного элемента (матрица хранится построчно)
function solveDense(M, b, n) {
  const A = Float64Array.from(M), x = Float64Array.from(b);
  for (let col = 0; col < n; col++) {
    let p = col, best = Math.abs(A[col * n + col]);
    for (let r = col + 1; r < n; r++) { const v = Math.abs(A[r * n + col]); if (v > best) { best = v; p = r; } }
    if (!(best > 1e-300)) return null;
    if (p !== col) {
      for (let j = col; j < n; j++) { const t = A[col * n + j]; A[col * n + j] = A[p * n + j]; A[p * n + j] = t; }
      const t = x[col]; x[col] = x[p]; x[p] = t;
    }
    const piv = A[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r * n + col] / piv;
      if (f === 0) continue;
      for (let j = col; j < n; j++) A[r * n + j] -= f * A[col * n + j];
      x[r] -= f * x[col];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let v = x[r];
    for (let j = r + 1; j < n; j++) v -= A[r * n + j] * x[j];
    x[r] = v / A[r * n + r];
  }
  return x;
}

// Путь из состояния (k̃_0, ln A_0) выбранным методом; для нелинейного при неудаче — продолжение по k̃_0
const memo = new Map();
function pathFrom(s, k0, a0, T) {
  const key = JSON.stringify([s.variant, s.method, s.alpha, s.beta, s.delta, s.theta, s.chi, s.rho, s.n, s.g, k0, a0, T]);
  if (memo.has(key)) return memo.get(key);
  const ss = steady(s), pol = policy(s, ss);
  let P = null;
  if (pol) {
    if (s.method === 'linear') P = linPath(s, ss, pol, T, Math.log(k0 / ss.k), a0);
    else {
      P = nlPath(s, ss, pol, T, k0, a0);
      if (!P) {
        for (const f of [0.2, 0.4, 0.6, 0.8, 1]) {
          P = nlPath(s, ss, pol, T, ss.k * Math.exp(f * Math.log(k0 / ss.k)), f * a0);
          if (!P) break;
        }
      }
    }
  }
  if (memo.size > 40) memo.clear();
  memo.set(key, P);
  return P;
}

// ───────────────────────────── Решатель ─────────────────────────────

const VARS = ['c', 'k', 'y', 'i', 'w'];

export function solve(s) {
  const errors = validate(s);
  if (errors.length) return { ok: false, errors };
  const ss = steady(s), pol = policy(s, ss);
  if (!pol) return { ok: false, errors: ['Не удалось найти седловую траекторию лог-линейной системы.'] };
  const tp = s.variant === 'tp', H = s.horizon, tH = s.tHat;
  const T = Math.max(H - tH, 0) + 150;
  const k0 = s.shockTarget === 'k' ? ss.k * (1 + s.shockSize / 100) : ss.k;
  const a0 = s.shockTarget === 'tfp' ? s.shockSize / 100 : 0;
  const P = pathFrom(s, k0, a0, T);
  if (!P) return { ok: false, errors: ['Нелинейная система не решилась: шок слишком велик. Попробуйте лог-линейное решение или шок меньше.'] };

  const gE = tp ? 1 + s.g : 1, gL = tp ? 1 + s.n : 1;
  const t = [], irf = {}, levels = {}, baseLevels = {}, eff = {}, baseEff = {}, agg = {}, baseAgg = {};
  for (const v of [...VARS, 'N', 'r', 'A', 'E', 'L']) { irf[v] = []; levels[v] = []; baseLevels[v] = []; }
  for (const v of VARS) { eff[v] = []; baseEff[v] = []; }
  for (const v of ['c', 'k', 'y', 'i']) { agg[v] = []; baseAgg[v] = []; }
  let Nmax = 0;
  for (let j = 0; j <= H; j++) {
    const E = Math.pow(gE, j), L = Math.pow(gL, j);
    const q = j >= tH ? j - tH : -1;   // до шока экономика в стационаре
    const at = (v) => (q < 0 ? (v === 'r' ? ss.r : v === 'A' ? 1 : ss[v]) : P[v][q]);
    t.push(j);
    for (const v of VARS) {
      const x = at(v);
      eff[v].push(x); baseEff[v].push(ss[v]);
      levels[v].push(x * E); baseLevels[v].push(ss[v] * E);
      irf[v].push(100 * Math.log(x / ss[v]));
    }
    for (const v of ['c', 'k', 'y', 'i']) { agg[v].push(at(v) * E * L); baseAgg[v].push(ss[v] * E * L); }
    const N = at('N'); Nmax = Math.max(Nmax, N);
    levels.N.push(N); baseLevels.N.push(ss.N); irf.N.push(100 * Math.log(N / ss.N));
    levels.r.push(100 * at('r')); baseLevels.r.push(100 * ss.r); irf.r.push(100 * (at('r') - ss.r));
    levels.A.push(at('A')); baseLevels.A.push(1); irf.A.push(100 * Math.log(at('A')));
    levels.E.push(E); baseLevels.E.push(E); irf.E.push(0);
    levels.L.push(L); baseLevels.L.push(L); irf.L.push(0);
  }
  if (Nmax >= 1) return { ok: false, errors: [`Часы упираются в потолок $N_t\\le 1$ (максимум $${fmtTex(Nmax, 3)}$): шок слишком велик для этой калибровки.`] };
  return {
    ok: true, t, irf, levels, baseLevels, eff, baseEff, agg, baseAgg, logIrf: true,
    ss0: ss, ssF: ss, permanentChange: false, pol,
    marks: { tHat: tH, tEnd: null, t0: null },
  };
}

// ───────────────────────────── Графики ─────────────────────────────

export function chartSpecs(s) {
  const tp = s.variant === 'tp', cen = s.version === 'centralized';
  const u = tp ? '% от ТСР' : '% от s.s.', uR = 'п. п.';
  // символ отклика: лог-отклонение со шляпкой (у величин с тильдой — шляпка над тильдой)
  const hat = (L, lo) => (uu) => (uu === 'eff' ? `\\hat{\\tilde ${lo}}_t` : uu === 'agg' || !tp ? `\\hat ${L}_t` : `\\hat ${lo}_t`);
  const v = (id, title, L, lo, extra = {}) => ({ id, title, sym: tp ? `${lo}_t` : `${L}_t`, ...(tp ? { aggSym: `${L}_t` } : {}),
    irfUnit: u, irfLabel: '$\\Delta_{\\ln}\\times100$', irfSym: hat(L, lo), ...extra });
  const specs = [
    ...(tp ? [{ id: 'E', title: 'Трудосберегающий ТП', sym: 'E_t', irfUnit: '% от тренда', noEff: true, levelOnly: true, noIrf: true },
      { id: 'L', title: 'Население', sym: 'L_t', irfUnit: '% от тренда', noEff: true, levelOnly: true, noIrf: true }] : []),
    { id: 'A', title: 'Технология', sym: 'A_t', irfUnit: '%', irfLabel: '$\\hat A_t\\times100$', irfSym: () => '\\hat A_t', noEff: true },
    v('y', 'Выпуск', 'Y', 'y'),
    v('c', 'Потребление', 'C', 'c'),
    v('i', 'Инвестиции', 'I', 'i'),
    { id: 'N', title: 'Часы', sym: 'N_t', irfUnit: u, irfLabel: '$\\hat N_t\\times100$', irfSym: () => '\\hat N_t', noEff: true },
    v('k', 'Капитал', 'K', 'k', tp ? { wTitle: 'Капиталовооружённость' } : {}),
    cen ? { ...v('w', 'Предельный продукт труда', 'W', 'w'), sym: 'A_tF^{\\prime}_N', aggSym: undefined, irfSym: () => '\\hat w_t' }
      : { ...v('w', 'Зарплата', 'W', 'w'), sym: 'w_t', aggSym: undefined, irfSym: (uu) => (uu === 'eff' ? '\\hat{\\tilde w}_t' : '\\hat w_t') },
    { id: 'r', title: cen ? 'Отдача от капитала' : 'Ставка процента', sym: cen ? 'A_tF^{\\prime}_K-\\delta' : 'r_t',
      irfUnit: uR, irfLabel: '$\\Delta r_t$', irfSym: () => '\\Delta r_t', lvlUnit: '%', noEff: true },
  ];
  return specs.map((c) => ({ ...c, effAvailable: tp && !c.noEff }));
}

// ───────────────────────────── Формулы ─────────────────────────────

function fmtTex(x, d = 4) {
  if (!Number.isFinite(x)) return '?';
  let t = x.toFixed(d);
  if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '');
  return t === '-0' ? '0' : t;
}
const fmt = (x, d = 3) => (Number.isFinite(x) ? fmtTex(x, d).replace('-', '−') : '—');
const n4 = (x) => fmtTex(x, 4);
const pm = (x) => (x < 0 ? `-${n4(-x)}` : `+${n4(x)}`);
// множитель и показатель степени: единица не пишется
const co = (x) => (Math.abs(x - 1) < 5e-5 ? '' : n4(x));
const pw = (x) => (Math.abs(x - 1) < 5e-5 ? '' : `^{${n4(x)}}`);
// коэффициент перед переменной: «+0.5\hat K_t», без «1»
const term = (x, v, first = false) => (Math.abs(x) < 5e-5 ? '' : `${x < 0 ? '-' : first ? '' : '+'}${n4(Math.abs(x))}${v}`);

// обозначения: без трендов — агрегаты (население 1), с трендами — тильда (на эффективного работника)
function names(s) {
  const tp = s.variant === 'tp';
  const X = (L, lo) => (tp ? `\\tilde ${lo}` : L);
  return { tp, C: X('C', 'c'), K: X('K', 'k'), Y: X('Y', 'y'), I: X('I', 'i'), W: tp ? '\\tilde w' : 'w', Pi: tp ? '\\tilde\\Pi' : '\\Pi',
    H: (L, lo) => (tp ? `\\hat{\\tilde ${lo}}` : `\\hat ${L}`),
    G: tp ? '(1+n)(1+g)' : '', dep: tp ? '\\big[(1+n)(1+g)-1+\\delta\\big]' : '\\delta ' };
}

export function formulas(s) {
  const tp = s.variant === 'tp', cen = s.version === 'centralized';
  const { C, K, Y, I, W, Pi, G } = names(s);
  const a = s.alpha, d = s.delta, Gv = tp ? (1 + s.n) * (1 + s.g) : 1;
  const fs = { dec: [], cen: [], system: [], shock: [], problemTitle: 'Модель', systemTitle: 'Уравнения динамики',
    ssTitle: tp ? 'Траектория сбалансированного роста' : 'Стационарное состояние' };
  const t = (v, i = 't') => `${v}_{${i}}`;

  // ── оптимизационные задачи
  const u = tp ? `\\ln(\\tilde c_tE_t)-\\theta\\dfrac{N_t^{1+\\chi}}{1+\\chi}` : `\\ln C_t-\\theta\\dfrac{N_t^{1+\\chi}}{1+\\chi}`;
  const maxH = `\\max_{\\{${C}_t,\\,N_t,\\,${K}_{t+1}\\}_{t=0}^{\\infty}}\\; \\sum_{t=0}^{\\infty}\\beta^t\\left(${u}\\right)`;
  const tvc = `\\text{TVC:}\\quad \\lim_{t\\to\\infty}\\beta^t\\lambda_t${K}_{t+1}=0`;
  const bounds = `0\\le N_t\\le 1,\\qquad ${K}_0\\ \\text{задано}`;
  const lhsK = tp ? `${G}${K}_{t+1}` : `${K}_{t+1}`;
  fs.dec.push({ agent: 'Домохозяйства', system: true, items: [maxH,
    `\\text{s.t.}\\quad ${C}_t+${lhsK}=${W}_tN_t+(1+r_t)${K}_t+${Pi}_t`, bounds, tvc] });
  fs.dec.push({ agent: 'Фирмы', items: [tp
    ? '\\max_{K_t,\\,N_t}\\; \\Pi_t=A_tK_t^{\\alpha}(E_tL_tN_t)^{1-\\alpha}-w_tL_tN_t-(r_t+\\delta)K_t'
    : '\\max_{K_t,\\,N_t}\\; \\Pi_t=A_tK_t^{\\alpha}N_t^{1-\\alpha}-w_tN_t-(r_t+\\delta)K_t'] });
  fs.dec.push({ agent: 'Рынки', items: [
    'K_t\\ \\text{(спрос фирм)}=K_t\\ \\text{(предложение домохозяйств)}',
    `${tp ? 'L_tN_t' : 'N_t'}\\ \\text{(спрос фирм)}=${tp ? 'L_tN_t' : 'N_t'}\\ \\text{(предложение домохозяйств)}`,
    'Y_t=C_t+I_t'] });
  const exo = [`\\ln A_{t+1}=\\rho\\ln A_t+\\varepsilon_{t+1},\\qquad A^*=1`,
    tp ? 'L_{t+1}=(1+n)L_t,\\qquad E_{t+1}=(1+g)E_t,\\qquad L_0=E_0=1' : 'L_t=1'];
  fs.dec.push({ agent: 'Экзогенные процессы', items: exo });
  fs.cen.push({ agent: 'Центральный планировщик', system: true, items: [maxH,
    `\\text{s.t.}\\quad ${C}_t+${lhsK}=A_t${K}_t^{\\alpha}N_t^{1-\\alpha}+(1-\\delta)${K}_t`, bounds, tvc] });
  fs.cen.push({ agent: 'Экзогенные процессы', items: exo });

  // ── уравнения динамики (как в лекции) и они же в числах
  const Gn = tp ? `${n4(Gv)}` : '';
  const row = (label, tex, num) => fs.system.push({ label, tex, num });
  if (cen) {
    row('Уравнение Эйлера', `${G}${t(C, 't+1')}=\\beta\\left(1+\\alpha A_{t+1}${t(K, 't+1')}^{\\alpha-1}N_{t+1}^{1-\\alpha}-\\delta\\right)${C}_t`,
      `${Gn}${t(C, 't+1')}=${n4(s.beta)}\\left(${n4(1 - d)}+${n4(a)}A_{t+1}${t(K, 't+1')}^{${n4(a - 1)}}N_{t+1}^{${n4(1 - a)}}\\right)${C}_t`);
    row('«Труд — досуг»', `\\theta N_t^{\\chi}${C}_t=(1-\\alpha)A_t${K}_t^{\\alpha}N_t^{-\\alpha}`,
      `${co(s.theta)}N_t${pw(s.chi)}${C}_t=${n4(1 - a)}A_t${K}_t^{${n4(a)}}N_t^{${n4(-a)}}`);
  } else {
    row('Уравнение Эйлера', `${G}${t(C, 't+1')}=\\beta(1+r_{t+1})${C}_t`, `${Gn}${t(C, 't+1')}=${n4(s.beta)}(1+r_{t+1})${C}_t`);
    row('«Труд — досуг»', `\\theta N_t^{\\chi}=${W}_t/${C}_t`, `${co(s.theta)}N_t${pw(s.chi)}=${W}_t/${C}_t`);
    row('Спрос на труд', `${W}_t=(1-\\alpha)${Y}_t/N_t`, `${W}_t=${n4(1 - a)}${Y}_t/N_t`);
    row('Спрос на капитал', `r_t+\\delta=\\alpha ${Y}_t/${K}_t`, `r_t${pm(d)}=${n4(a)}${Y}_t/${K}_t`);
  }
  row('Производство', `${Y}_t=A_t${K}_t^{\\alpha}N_t^{1-\\alpha}`, `${Y}_t=A_t${K}_t^{${n4(a)}}N_t^{${n4(1 - a)}}`);
  row('Ресурсы', `${Y}_t=${C}_t+${I}_t`, `${Y}_t=${C}_t+${I}_t`);
  row('Накопление капитала', `${lhsK}=${I}_t+(1-\\delta)${K}_t`, `${Gn}${K}_{t+1}=${I}_t+${n4(1 - d)}${K}_t`);
  row('Технология', '\\ln A_{t+1}=\\rho\\ln A_t', `\\ln A_{t+1}=${n4(s.rho)}\\ln A_t`);

  // ── шок
  if (s.shockTarget === 'tfp') fs.shock.push({
    tex: '\\ln A_{\\hat t}=\\rho\\ln A_{\\hat t-1}+\\varepsilon,\\qquad \\varepsilon_t=0\\ \\text{при}\\ t\\ne\\hat t',
    num: `\\varepsilon=${n4(s.shockSize / 100)},\\qquad \\hat t=${s.tHat}` });
  else fs.shock.push({ tex: `${K}^{\\prime}_{\\hat t}=(1+\\varphi_k)${K}_{\\hat t}`, num: `\\varphi_k=${n4(s.shockSize / 100)},\\qquad \\hat t=${s.tHat}` });
  return fs;
}

// Блок сразу за уравнениями динамики: лог-линейная система, сведение и функции политики
export function systemBlocks(s) {
  if (validate(s).length) return [];
  const ss = steady(s), pol = policy(s, ss);
  const { tp, H, G, dep } = names(s);
  const a = s.alpha, d = s.delta;
  const [c, k, y, i, w] = [H('C', 'c'), H('K', 'k'), H('Y', 'y'), H('I', 'i'), tp ? '\\hat{\\tilde w}' : '\\hat w'];
  const st = (v) => (tp ? `\\tilde ${v}^*` : `${v.toUpperCase()}^*`);
  const bG = tp ? `\\dfrac{\\beta}{${G}}` : '\\beta';
  const rows = [
    { label: 'Уравнение Эйлера', tex: `${c}_{t+1}-${c}_t=${bG}\\Delta r_{t+1}`, num: `${c}_{t+1}-${c}_t=${n4(s.beta / ss.G)}\\Delta r_{t+1}` },
    { label: '«Труд — досуг»', tex: `\\chi\\hat N_t=${w}_t-${c}_t`, num: `${co(s.chi)}\\hat N_t=${w}_t-${c}_t` },
    { label: 'Спрос на труд', tex: `${w}_t=${y}_t-\\hat N_t`, num: `${w}_t=${y}_t-\\hat N_t` },
    { label: 'Спрос на капитал', tex: `\\Delta r_t=(r^*+\\delta)(${y}_t-${k}_t)`, num: `\\Delta r_t=${n4(ss.r + d)}(${y}_t-${k}_t)` },
    { label: 'Производство', tex: `${y}_t=\\hat A_t+\\alpha${k}_t+(1-\\alpha)\\hat N_t`, num: `${y}_t=\\hat A_t+${n4(a)}${k}_t+${n4(1 - a)}\\hat N_t` },
    { label: 'Ресурсы', tex: `${st('y')}${y}_t=${st('c')}${c}_t+${st('i')}${i}_t`,
      num: `${n4(ss.y)}${y}_t=${n4(ss.c)}${c}_t+${n4(ss.i)}${i}_t` },
    { label: 'Накопление капитала', tex: `${tp ? G : ''}${k}_{t+1}=${dep}${i}_t+(1-\\delta)${k}_t`,
      num: `${tp ? n4(ss.G) : ''}${k}_{t+1}=${n4(ss.dep)}${i}_t+${n4(1 - d)}${k}_t` },
    { label: 'Технология', tex: '\\hat A_{t+1}=\\rho\\hat A_t', num: `\\hat A_{t+1}=${n4(s.rho)}\\hat A_t` },
  ];
  const groups = [{ rows }];
  if (pol) {
    const rowsP = [
      { label: `Исключаем $${w}_t$ и $${y}_t$`, tex: `\\hat N_t=\\dfrac{\\hat A_t+\\alpha${k}_t-${c}_t}{\\chi+\\alpha}`,
        num: `\\hat N_t=${term(pol.nA, '\\hat A_t', true)}${term(pol.nk, `${k}_t`)}${term(pol.nc, `${c}_t`)}` },
      { label: 'Потребление', tex: `${c}_t=\\eta_{CK}${k}_t+\\eta_{CA}\\hat A_t`, num: `${c}_t=${term(pol.cK, `${k}_t`, true)}${term(pol.cA, '\\hat A_t')}` },
      { label: 'Капитал', tex: `${k}_{t+1}=\\eta_{KK}${k}_t+\\eta_{KA}\\hat A_t`, num: `${k}_{t+1}=${term(pol.KK, `${k}_t`, true)}${term(pol.KA, '\\hat A_t')}` },
      { label: 'Часы', tex: `\\hat N_t=\\eta_{NK}${k}_t+\\eta_{NA}\\hat A_t`, num: `\\hat N_t=${term(pol.NK, `${k}_t`, true)}${term(pol.NA, '\\hat A_t')}` },
    ];
    groups.push({ subtitle: 'Функции политики', text: `Состояние — ${tp ? '$\\hat{\\tilde k}_t$' : '$\\hat K_t$'} и $\\hat A_t$, выбор — ${tp ? '$\\hat{\\tilde c}_t$' : '$\\hat C_t$'}. Коэффициенты — устойчивый корень системы (метод неопределённых коэффициентов).`, rows: rowsP });
  }
  return [{ title: 'Лог-линеаризованная система',
    note: tp ? 'лог-отклонения от ТСР, ставка — в п. п.' : 'лог-отклонения от стационара, ставка — в п. п.', groups }];
}

// ───────────────────────────── Стационар / ТСР ─────────────────────────────

export function steadyTable(s, res) {
  const tp = s.variant === 'tp';
  const ss = res?.ss0 || steady(s);
  const [kS, yS, cS, iS, wS] = tp ? ['\\tilde k^*', '\\tilde y^*', '\\tilde c^*', '\\tilde i^*', '\\tilde w^*'] : ['K^*', 'Y^*', 'C^*', 'I^*', 'w^*'];
  const kap = `\\dfrac{${kS}}{N^*}`, cN = `\\dfrac{${cS}}{N^*}`;
  const e = tp ? ' на эфф. работника' : '';
  const dep = tp ? '\\big[(1+n)(1+g)-1+\\delta\\big]' : '\\delta ';
  const rows = [
    { sym: 'r^*', name: 'ставка процента', key: 'r', pct: true, tex: tp ? '\\dfrac{(1+n)(1+g)}{\\beta}-1' : '\\dfrac{1}{\\beta}-1' },
    { sym: kap, name: 'капитал на единицу труда', key: 'kap', tex: '\\left(\\dfrac{\\alpha}{r^*+\\delta}\\right)^{\\frac{1}{1-\\alpha}}' },
    { sym: wS, name: `зарплата${tp ? ' на эфф. единицу труда' : ''}`, key: 'w', tex: `(1-\\alpha)\\left(${kap}\\right)^{\\alpha}` },
    { sym: cN, name: 'потребление на единицу труда', key: 'cN', tex: `\\left(${kap}\\right)^{\\alpha}-${dep}${kap}` },
    { sym: 'N^*', name: 'часы', key: 'N', tex: `\\left(\\dfrac{${wS}}{\\theta\\cdot ${cS}/N^*}\\right)^{\\frac{1}{1+\\chi}}` },
    { sym: kS, name: tp ? 'капиталовооружённость на эфф. работника' : 'капитал', key: 'k', tex: `${kap}N^*` },
    { sym: yS, name: `выпуск${e}`, key: 'y', tex: `\\left(${kap}\\right)^{\\alpha}N^*` },
    { sym: cS, name: `потребление${e}`, key: 'c', tex: `${cN}N^*` },
    { sym: iS, name: `инвестиции${e}`, key: 'i', tex: `${dep}${kS}` },
    { sym: `\\dfrac{${kS}}{${yS}}`, name: 'капиталоёмкость выпуска (кварталов)', key: 'KY', tex: `\\left(${kap}\\right)^{1-\\alpha}` },
  ];
  const v = (r) => (r.pct ? `${(100 * ss[r.key]).toFixed(2)}%` : fmt(ss[r.key], 3));
  return rows.map((r) => ({ ...r, before: v(r), after: v(r), value: ss[r.key] }));
}

// ───────────────────────────── Сходимость и ТСР ─────────────────────────────

export function extraBlocks(s) {
  return [{ ...convergenceBlock(s), beforeSS: true }];
}

function convergenceBlock(s) {
  const tp = s.variant === 'tp', ss = steady(s), H = s.horizon;
  const P = pathFrom(s, s.k0, 0, H + 150);
  const color = tc('#3d8acb'), HL = tc('#7c62d8');
  const pick = (v, f = (x) => x) => (P ? Array.from({ length: H + 1 }, (_, j) => [j, f(P[v][j])]) : []);
  const mk = (title, sym, data, hl, unit) => {
    const hh = data.length ? halfLife(data, hl, true) : null;
    return { title, sym, unit, series: [{ label: `$${sym}$`, data, color, width: 2.6 }],
      opts: { xLabel: 't', xmin: 0, xmax: H, discrete: true, hlines: [{ y: hl, color: tc('#7d7ca5') }], marksOnAxis: true,
        vlines: hh ? [{ x: hh.x, yTo: hh.y, color: HL, dots: true, label: `t_{1/2}=${fmtTex(hh.x, 0)}` }] : [] } };
  };
  const { C, K, Y, I } = names(s);
  const e = tp ? ' на эфф. работника' : '';
  const k0 = `${K}_0`;
  return {
    title: 'Сходимость к стационару',
    legend: [{ label: `траектория из $${k0} = ${fmtTex(s.k0, 3)}$`, color }, { label: 'стационарное значение', color: tc('#7d7ca5'), dash: true },
      { label: 'период полусходимости', color: HL, dots: true }],
    charts: [
      mk(tp ? 'Капиталовооружённость на эфф. работника' : 'Капитал', `${K}_t`, pick('k'), ss.k, ''),
      mk(`Выпуск${e}`, `${Y}_t`, pick('y'), ss.y, ''),
      mk(`Потребление${e}`, `${C}_t`, pick('c'), ss.c, ''),
      mk(`Инвестиции${e}`, `${I}_t`, pick('i'), ss.i, ''),
      mk('Часы', 'N_t', pick('N'), ss.N, ''),
      mk(s.version === 'centralized' ? 'Отдача от капитала' : 'Ставка процента', 'r_t', pick('r', (x) => 100 * x), 100 * ss.r, '%'),
    ],
  };
}

// Графики под таблицей ТСР (только с трендами): величины на работника — ТСР и путь из k̃_0 к ней
export function ssCharts(s, res, scale = 'log') {
  if (s.variant !== 'tp') return null;
  const ss = steady(s), H = s.horizon, gE = 1 + s.g;
  const P = pathFrom(s, s.k0, 0, H + 150);
  const color = tc('#3d8acb'), BG = tc('#7d7ca5');
  const cen = s.version === 'centralized';
  const mk = (title, sym, key) => ({ title, sym, unit: '',
    series: [{ label: 'ТСР', data: Array.from({ length: H + 1 }, (_, j) => [j, ss[key] * Math.pow(gE, j)]), color: BG, width: 2, dash: [6, 4] },
      { label: `$${sym}$`, data: P ? Array.from({ length: H + 1 }, (_, j) => [j, P[key][j] * Math.pow(gE, j)]) : [], color, width: 2.6 }],
    opts: { xLabel: 't', xmin: 0, xmax: H, ymin: scale === 'log' ? undefined : 0, log: scale === 'log', discrete: true, marksOnAxis: true } });
  return {
    subtitle: 'Сходимость к траектории сбалансированного роста',
    scaleToggle: true,
    legend: [{ label: 'ТСР', color: BG, dash: true }, { label: 'путь из $\\tilde k_0$', color }],
    charts: [mk('Капиталовооружённость', 'k_t', 'k'), mk('Выпуск на работника', 'y_t', 'y'), mk('Потребление на работника', 'c_t', 'c'),
      mk(cen ? 'Предельный продукт труда' : 'Зарплата', cen ? 'A_tF^{\\prime}_N' : 'w_t', 'w')],
  };
}
