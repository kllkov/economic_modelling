// Модель реальных деловых циклов (RBC): настройки, решатель, формулы.
// Обозначения — как в лекции курса: C_t, N_t (доля времени, отданная работе), K_t, Y_t, I_t, w_t, r_t, A_t;
// u = ln C_t − θN_t^{1+χ}/(1+χ), Y_t = A_t K_t^α N_t^{1−α}, ln A_{t+1} = ρ ln A_t + ε_{t+1}.
// K_t — капитал, с которым производят в периоде t (выбран в t − 1).
// Тренды: L_t — население (темп n), E_t — трудосберегающий ТП (темп g). Без трендов — агрегаты (население 1),
// только с ростом населения — величины на душу (k_t = K_t/L_t), с ТП — тильда (на эффективного работника).
// Множитель (1+n)(1+g) записан точно (в лекции — приближение 1 + n + g).
// Лог-отклонения — со шляпкой: X̂_t = ln X_t − ln X^*; ставка — отклонение в уровнях Δr_t (п. п.).
// Два способа решения: лог-линейное (как в лекции) и нелинейное (точное, совершенное предвидение).
// В подписях интерфейса фрагменты между $…$ рендерятся KaTeX.

import { halfLife, tc } from '../charts.js';
import { newtonTridiagonal } from '../solver.js';

// ───────────────────────────── Настройки ─────────────────────────────

const SHOCK_TARGETS = {
  tfp:   { label: 'TFP $A_t$', kind: 'exo', unit: '%', def: 1, step: 0.5 },
  k:     { label: 'Капитал $K_t$', kind: 'exo', unit: '%', def: -10, step: 1 },
  beta:  { label: 'Дисконт-фактор $\\beta$ (шок предпочтений)', kind: 'param', sym: '\\beta', unit: 'Δ', def: 0.002, step: 0.001 },
  theta: { label: 'Тягость труда $\\theta$', kind: 'param', sym: '\\theta', unit: 'Δ', def: 0.4, step: 0.1 },
  chi:   { label: 'Обратная эластичность Фриша $\\chi$', kind: 'param', sym: '\\chi', unit: 'Δ', def: 0.5, step: 0.1 },
  delta: { label: 'Выбытие капитала $\\delta$', kind: 'param', sym: '\\delta', unit: 'Δ', def: 0.005, step: 0.001 },
};
const PAR_TITLE = { beta: 'Дисконт-фактор', theta: 'Тягость труда', chi: 'Обратная эластичность Фриша', delta: 'Выбытие капитала' };
const isPar = (s) => SHOCK_TARGETS[s.shockTarget]?.kind === 'param';

export const defaults = {
  time: 'discrete', version: 'decentralized', variant: 'base', method: 'linear',
  utility: 'log', production: 'cd',
  alpha: 1 / 3, beta: 0.99, delta: 0.025, theta: 4, chi: 1, rho: 0.95, n: 0.0025, g: 0.0055,
  k0: 7, shockTarget: 'tfp', shockSize: 1, tHat: 0, horizon: 40,
  shockPersistence: 'temporary', tempMode: 'ar', rhoS: 0.9, shockDur: 8,
};

// тренды: hasN — рост населения, hasG — трудосберегающий ТП
const trends = (s) => ({ hasN: s.variant === 'n' || s.variant === 'both', hasG: s.variant === 'tp' || s.variant === 'both' });

const shockTargetsFor = () => Object.entries(SHOCK_TARGETS).map(([v, d]) => ({ v, l: d.label }));

export const controls = [
  { section: 'Модель' },
  { id: 'version', label: 'Вид модели', type: 'segmented',
    options: [{ v: 'centralized', l: 'Централизованная' }, { v: 'decentralized', l: 'Децентрализованная' }] },
  { id: 'variant', label: 'Тренды', type: 'select',
    options: [{ v: 'base', l: 'Без трендов' }, { v: 'n', l: 'Рост населения' }, { v: 'tp', l: 'Трудосберегающий ТП' },
      { v: 'both', l: 'Рост населения и трудосберегающий ТП' }] },
  { id: 'method', label: 'Решение', type: 'segmented',
    options: [{ v: 'linear', l: 'Лог-линейное' }, { v: 'nonlinear', l: 'Нелинейное' }],
    hint: (s) => (s.method === 'linear'
      ? 'Как в лекции: решение лог-линеаризованной системы'
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
  { id: 'n', label: '$n$ — темп роста $L_t$', type: 'number', min: -0.05, max: 0.2, step: 0.0005, show: (s) => trends(s).hasN },
  { id: 'g', label: '$g$ — темп роста $E_t$', type: 'number', min: -0.05, max: 0.2, step: 0.0005, show: (s) => trends(s).hasG },
  { id: 'k0', label: (s) => (trends(s).hasG ? '$\\tilde k_0$ — начальная капиталовооружённость'
    : trends(s).hasN ? '$k_0$ — начальная капиталовооружённость' : '$K_0$ — начальный капитал'),
    type: 'number', min: 0.01, max: 1000, step: 0.5 },

  { section: 'Шок' },
  { id: 'shockTarget', label: 'На что шок', type: 'select', rich: true, options: shockTargetsFor,
    groupLabel: (v) => (SHOCK_TARGETS[v]?.kind === 'param' ? 'параметры' : 'технология и капитал') },
  { id: 'shockSize', label: (s) => (SHOCK_TARGETS[s.shockTarget]?.unit === '%' ? 'Величина, $\\Delta_{\\%}$' : 'Величина, $\\Delta$'),
    type: 'number', step: (s) => SHOCK_TARGETS[s.shockTarget]?.step ?? 0.5,
    hint: (s) => (s.shockTarget === 'tfp' ? 'Неожиданный шок $\\varepsilon$ в $\\hat t$; дальше $\\ln A_t$ затухает с персистентностью $\\rho$'
      : s.shockTarget === 'k' ? 'Неожиданное разрушение (или прирост) капитала в $\\hat t$' : 'Неожиданное изменение параметра в $\\hat t$') },
  { id: 'tHat', label: 'Момент шока $\\hat t$', type: 'number', min: 0, max: 100, step: 1 },
  { id: 'shockPersistence', label: 'Длительность', type: 'segmented',
    options: [{ v: 'permanent', l: 'Перманентный' }, { v: 'temporary', l: 'Временный' }], show: isPar },
  { id: 'tempMode', label: 'Временный шок', type: 'segmented',
    options: [{ v: 'ar', l: 'Персистентность' }, { v: 'fixed', l: 'Число периодов' }],
    show: (s) => isPar(s) && s.shockPersistence === 'temporary' },
  { id: 'rhoS', label: 'Персистентность $\\rho_s$', type: 'number', slider: true, min: 0, max: 0.99, step: 0.01,
    show: (s) => isPar(s) && s.shockPersistence === 'temporary' && s.tempMode !== 'fixed',
    hint: 'Отклонение затухает как $\\rho_s^{\\,t-\\hat t}$' },
  { id: 'shockDur', label: 'Число периодов $N$', type: 'number', min: 1, max: 200, step: 1,
    show: (s) => isPar(s) && s.shockPersistence === 'temporary' && s.tempMode === 'fixed',
    hint: 'Шок действует в $t=\\hat t,\\dots,\\hat t+N-1$, затем сразу исчезает' },

  { section: 'Отображение' },
  { id: 'horizon', label: 'Горизонт графиков (кварталы)', type: 'number', min: 10, max: 200, step: 5 },
];

export function normalize(s, changed) {
  if (!SHOCK_TARGETS[s.shockTarget]) { s.shockTarget = 'tfp'; changed = 'shockTarget'; }
  if (!['base', 'n', 'tp', 'both'].includes(s.variant)) s.variant = 'base';
  if (changed === 'shockTarget') s.shockSize = SHOCK_TARGETS[s.shockTarget].def;
  s.tHat = Math.max(0, Math.round(+s.tHat || 0));
  s.horizon = Math.max(10, Math.round(+s.horizon || 40));
  s.shockDur = Math.max(1, Math.round(+s.shockDur || 1));
  s.time = 'discrete';
  return s;
}

// ───────────────────────────── Параметры во времени ─────────────────────────────

const baseParams = (s) => ({ beta: s.beta, theta: s.theta, chi: s.chi, delta: s.delta });
// профиль шока параметра через q периодов после t̂ (q ≥ 0)
function prof(s, q) {
  if (!isPar(s) || q < 0) return 0;
  if (s.shockPersistence === 'permanent') return 1;
  if (s.tempMode === 'fixed') return q < s.shockDur ? 1 : 0;
  return Math.pow(s.rhoS, q);
}
const parAt = (s, q) => { const p = baseParams(s), tg = s.shockTarget; if (isPar(s)) p[tg] += s.shockSize * prof(s, q); return p; };

// ───────────────────────────── Стационар ─────────────────────────────

// Стационар при параметрах par (на ТСР — в единицах на эффективного работника или на душу)
export function steady(s, par = baseParams(s)) {
  const a = s.alpha, { hasN, hasG } = trends(s);
  const G = (hasN ? 1 + s.n : 1) * (hasG ? 1 + s.g : 1);   // темп роста агрегатов на ТСР
  const dep = G - 1 + par.delta;                              // i* = dep·k*
  const r = G / par.beta - 1;
  const kap = Math.pow(a / (r + par.delta), 1 / (1 - a));   // k*/N*
  const w = (1 - a) * Math.pow(kap, a);
  const cN = Math.pow(kap, a) - dep * kap;                   // c*/N*
  const N = Math.pow(w / (par.theta * cN), 1 / (1 + par.chi));
  const k = kap * N, y = Math.pow(kap, a) * N, c = cN * N, i = dep * k;
  return { G, dep, r, kap, w, cN, N, k, y, c, i, KY: k / y };
}

function checkParams(p, e, tag = '') {
  if (!(p.beta > 0 && p.beta < 1)) e.push(`$\\beta$ должен лежать в $(0,1)$${tag}.`);
  if (!(p.delta >= 0 && p.delta <= 1)) e.push(`$\\delta$ должна лежать в $[0,1]$${tag}.`);
  if (!(p.theta > 0) || !(p.chi > 0)) e.push(`$\\theta$ и $\\chi$ должны быть положительными${tag}.`);
}
function checkSteady(s, p, e, tag = '') {
  const ss = steady(s, p);
  if (!(ss.r + p.delta > 0)) e.push(`Нужно $r^*+\\delta>0$${tag}.`);
  else if (!(ss.cN > 0)) e.push(`Стационара нет${tag}: выпуска не хватает на восстановительные инвестиции.`);
  else if (!(ss.N < 1)) e.push(`В стационаре${tag} часы упираются в потолок: $N^*=${fmtTex(ss.N, 3)}\\ge 1$. Увеличьте $\\theta$.`);
}

function validate(s) {
  const e = [];
  if (!(s.alpha > 0 && s.alpha < 1)) e.push('$\\alpha$ должна лежать в $(0,1)$.');
  checkParams(baseParams(s), e);
  if (!(s.rho >= 0 && s.rho < 1)) e.push('Персистентность $\\rho$ должна лежать в $[0,1)$.');
  if (!(s.k0 > 0)) e.push('Начальный капитал должен быть положительным.');
  if (s.shockTarget === 'k' && !(s.shockSize > -100)) e.push('Капитал не может упасть больше чем на 100%.');
  if (isPar(s)) checkParams(parAt(s, 0), e, ' (в том числе после шока)');
  if (e.length) return e;
  checkSteady(s, baseParams(s), e);
  if (!e.length && isPar(s) && s.shockPersistence === 'permanent') checkSteady(s, parAt(s, 0), e, ' после шока');
  return e;
}

// ───────────────────────────── Лог-линейное решение ─────────────────────────────

// Сведение лог-линейной системы: N̂ = (Â + αk̂ − ĉ)/(χ + α), остальные — функции (k̂, Â, ĉ).
// Функции политики ищем методом неопределённых коэффициентов: ĉ = η_CK k̂ + η_CA Â.
export function policy(s, ss = steady(s), par = baseParams(s)) {
  const a = s.alpha, chi = par.chi, G = ss.G, d = par.delta;
  const nk = a / (chi + a), nA = 1 / (chi + a), nc = -1 / (chi + a);
  const yk = a + (1 - a) * nk, yA = 1 + (1 - a) * nA, yc = (1 - a) * nc;
  const ik = (ss.y * yk) / ss.i, iA = (ss.y * yA) / ss.i, ic = (ss.y * yc - ss.c) / ss.i;
  const mk = (ss.dep * ik + 1 - d) / G, mA = (ss.dep * iA) / G, mc = (ss.dep * ic) / G;
  const hk = yk - 1, hA = yA, hc = yc;              // ŷ − k̂
  const phi = (par.beta / G) * (ss.r + d);           // ĉ_{t+1} − ĉ_t = φ(ŷ_{t+1} − k̂_{t+1})
  const A2 = (1 - phi * hc) * mc, A1 = (1 - phi * hc) * mk - phi * hk * mc - 1, A0 = -phi * hk * mk;
  const disc = A1 * A1 - 4 * A2 * A0;
  if (!(disc >= 0)) return null;
  const roots = [(-A1 + Math.sqrt(disc)) / (2 * A2), (-A1 - Math.sqrt(disc)) / (2 * A2)];
  const cK = roots.find((x) => Math.abs(mk + mc * x) < 1);
  if (cK == null) return null;
  const q = cK * (1 - phi * hc) - phi * hk, rho = s.rho;
  const cA = (phi * hA * rho - q * mA) / (q * mc + rho * (1 - phi * hc) - 1);
  return { cK, cA, KK: mk + mc * cK, KA: mA + mc * cA, NK: nk + nc * cK, NA: nA + nc * cA };
}

function mkPath(T) {
  const f = () => new Float64Array(T + 1);
  return { k: f(), c: f(), N: f(), y: f(), i: f(), w: f(), r: f(), A: f() };
}

// отклонения параметров для лог-линейной системы: β̂ = ln β_t − ln β, θ̂ = ln θ_t − ln θ, Δχ, Δδ
const devOf = (b, p) => ({ bh: Math.log(p.beta / b.beta), th: Math.log(p.theta / b.theta), dchi: p.chi - b.chi, dd: p.delta - b.delta });

// Лог-линейная система с отклонениями параметров: один шаг по времени
function linStep(s, ss, kh, ah, ch, dv) {
  const a = s.alpha, chi = s.chi, lnN = Math.log(ss.N);
  const nh = (ah + a * kh - ch - dv.th - dv.dchi * lnN) / (chi + a);
  const yh = ah + a * kh + (1 - a) * nh;
  const ih = (ss.y * yh - ss.c * ch) / ss.i;
  const dr = (ss.r + s.delta) * (yh - kh) - dv.dd;
  const kh1 = (ss.dep * ih + (1 - s.delta) * kh - dv.dd) / ss.G;
  return { nh, yh, ih, dr, kh1 };
}

// Стационар лог-линейной системы при постоянных отклонениях параметров (k̂*, ĉ*)
function linSteady(s, ss, dv) {
  const a = s.alpha, chi = s.chi, lnN = Math.log(ss.N);
  const z = (-(ss.G * dv.bh) / s.beta + dv.dd) / (ss.r + s.delta);       // ŷ − k̂
  const kh = (-(chi + a) * z / (1 - a) - (ss.y * z - (ss.i * dv.dd) / ss.dep) / ss.c - dv.th - dv.dchi * lnN) / (chi + 1);
  const ch = (ss.y * (kh + z) - ss.i * (kh + dv.dd / ss.dep)) / ss.c;
  return { kh, ch };
}

function fillLin(s, ss, out, t, kh, ah, ch, st) {
  out.k[t] = ss.k * Math.exp(kh); out.c[t] = ss.c * Math.exp(ch); out.N[t] = ss.N * Math.exp(st.nh);
  out.y[t] = ss.y * Math.exp(st.yh); out.i[t] = ss.i * Math.exp(st.ih); out.w[t] = ss.w * Math.exp(st.yh - st.nh);
  out.r[t] = ss.r + st.dr; out.A[t] = Math.exp(ah);
}

// путь из (k̂_0, Â_0) по функциям политики (без шоков параметров); уровни на t = 0..T
function linPath(s, ss, pol, T, kh0, ah0) {
  const out = mkPath(T), z = { bh: 0, th: 0, dchi: 0, dd: 0 };
  let kh = kh0;
  for (let t = 0; t <= T; t++) {
    const ah = ah0 * Math.pow(s.rho, t), ch = pol.cK * kh + pol.cA * ah;
    const st = linStep(s, ss, kh, ah, ch, z);
    fillLin(s, ss, out, t, kh, ah, ch, st);
    kh = st.kh1;
  }
  return out;
}

// Лог-линейная система при известном пути параметров. Неизвестные — k̂_1..k̂_T; по (k̂_t, k̂_{t+1}) ĉ_t находится
// из накопления, ресурсов и «труд — досуг» (система линейна, якобиан трёхдиагональный); невязки — уравнения Эйлера.
// Хвост k̂_{T+1} — по функции политики около стационара лог-линейной системы при параметрах периода T.
function linPF(s, ss, pol, T, kh0, ah0, pars) {
  const a = s.alpha, chi = s.chi, lnN = Math.log(ss.N), b = baseParams(s), dv = pars.map((p) => devOf(b, p));
  const ah = Float64Array.from({ length: T + 1 }, (_, t) => ah0 * Math.pow(s.rho, t));
  const fin = linSteady(s, ss, dv[T]);
  const K = new Float64Array(T + 2), Cc = new Float64Array(T + 1), DR = new Float64Array(T + 1);
  const cOf = (t) => {
    const e = dv[t].th + dv[t].dchi * lnN;
    const B = ah[t] + a * K[t] + ((1 - a) * (ah[t] + a * K[t] - e)) / (chi + a);
    const Q = ss.G * K[t + 1] - (1 - s.delta) * K[t] + dv[t].dd;
    return (ss.y * B - ss.k * Q) / ((ss.y * (1 - a)) / (chi + a) + ss.c);
  };
  const run = (x) => {
    K[0] = kh0;
    for (let t = 0; t < T; t++) K[t + 1] = x[t];
    K[T + 1] = fin.kh + pol.KK * (K[T] - fin.kh) + pol.KA * ah[T];
    for (let t = 0; t <= T; t++) { Cc[t] = cOf(t); DR[t] = linStep(s, ss, K[t], ah[t], Cc[t], dv[t]).dr; }
  };
  const residual = (x) => {
    run(x);
    const R = new Float64Array(T);
    for (let t = 0; t < T; t++) R[t] = Cc[t + 1] - Cc[t] - (s.beta / ss.G) * DR[t + 1] - dv[t].bh;
    return R;
  };
  const guess = linPath(s, ss, pol, T, kh0, ah0);
  const sol = newtonTridiagonal(residual, Float64Array.from({ length: T }, (_, t) => Math.log(guess.k[t + 1] / ss.k)), { tol: 1e-13, maxIter: 5 });
  if (!(sol.err < 1e-10)) return null;
  run(sol.x);
  const out = mkPath(T);
  for (let t = 0; t <= T; t++) fillLin(s, ss, out, t, K[t], ah[t], Cc[t], linStep(s, ss, K[t], ah[t], Cc[t], dv[t]));
  return out;
}

// ───────────────────────────── Нелинейное решение ─────────────────────────────

// Неизвестные — x_t = ln k_{t+1} (t = 0..T−1), невязки — уравнения Эйлера: невязка t зависит от k_t, k_{t+1}, k_{t+2},
// поэтому якобиан трёхдиагональный и хорошо обусловлен на длинном горизонте. По (k_t, k_{t+1}) потребление и часы —
// из ресурсов и «труд — досуг»: θN^{χ}c = (1−α)A k^α N^{−α}, c = A k^α N^{1−α} + (1−δ)k − G k_{t+1}.
// Хвост: k_{T+1} — по лог-линейной функции политики около стационара при параметрах периода T.
// В уравнении Эйлера между t и t+1 — β_t и δ_{t+1}.
function nlPath(s, T, k0, a0, pars, guess) {
  const a = s.alpha, ssT = steady(s, pars[T]), polT = policy(s, ssT, pars[T]), G = ssT.G;
  if (!polT) return null;
  const lnA = Float64Array.from({ length: T + 1 }, (_, t) => a0 * Math.pow(s.rho, t));
  const P = mkPath(T);
  // часы и потребление периода t по k_t и k_{t+1}
  const period = (t, k, k1) => {
    const p = pars[t], Aka = Math.exp(lnA[t]) * Math.pow(k, a), rest = (1 - p.delta) * k - G * k1;
    const g = (u) => { const N = Math.exp(u), c = Aka * Math.pow(N, 1 - a) + rest; return c > 0 ? Math.log((1 - a) * Aka) - Math.log(p.theta) - (p.chi + a) * u - Math.log(c) : Infinity; };
    let lo = rest >= 0 ? -40 : Math.log(Math.pow(-rest / Aka, 1 / (1 - a))) + 1e-12, hi = 6;
    if (!(g(hi) < 0)) return null;
    for (let it = 0; it < 200 && hi - lo > 1e-14; it++) { const m = 0.5 * (lo + hi); if (g(m) > 0) lo = m; else hi = m; }
    const N = Math.exp(0.5 * (lo + hi)), y = Aka * Math.pow(N, 1 - a);
    return { N, y, c: y + rest };
  };
  const run = (x) => {
    P.k[0] = k0;
    for (let t = 0; t < T; t++) P.k[t + 1] = Math.exp(x[t]);
    const kT1 = ssT.k * Math.exp(polT.KK * Math.log(P.k[T] / ssT.k) + polT.KA * lnA[T]);
    for (let t = 0; t <= T; t++) {
      const q = period(t, P.k[t], t < T ? P.k[t + 1] : kT1);
      if (!q) return false;
      P.N[t] = q.N; P.y[t] = q.y; P.c[t] = q.c;
    }
    return true;
  };
  const residual = (x) => {
    if (!run(x)) return null;
    const R = new Float64Array(T);
    for (let t = 0; t < T; t++) {
      const gross = 1 + (a * P.y[t + 1]) / P.k[t + 1] - pars[t + 1].delta;
      R[t] = Math.log((G * P.c[t + 1]) / P.c[t]) - Math.log(pars[t].beta * gross);
      if (!Number.isFinite(R[t])) return null;
    }
    return R;
  };
  const sol = newtonTridiagonal(residual, Float64Array.from({ length: T }, (_, t) => Math.log(guess.k[t + 1])), { tol: 1e-12, maxIter: 60 });
  if (!sol.ok || sol.err > 1e-9) return null;
  run(sol.x);
  for (let t = 0; t <= T; t++) {
    P.A[t] = Math.exp(lnA[t]); P.i[t] = P.y[t] - P.c[t];
    P.w[t] = ((1 - a) * P.y[t]) / P.N[t]; P.r[t] = (a * P.y[t]) / P.k[t] - pars[t].delta;
  }
  return P;
}

// Путь из состояния (k_0, ln A_0) при пути параметров pars (null — параметры постоянны) выбранным методом.
// Для нелинейного при неудаче — продолжение по величине отклонения.
const memo = new Map();
function pathFrom(s, k0, a0, T, pars = null) {
  const key = JSON.stringify([s.variant, s.method, s.alpha, s.beta, s.delta, s.theta, s.chi, s.rho, s.n, s.g, k0, a0, T,
    pars && [s.shockTarget, s.shockSize, s.shockPersistence, s.tempMode, s.rhoS, s.shockDur]]);
  if (memo.has(key)) return memo.get(key);
  const b = baseParams(s), ss = steady(s), pol = policy(s, ss);
  let P = null;
  if (pol) {
    const kh0 = Math.log(k0 / ss.k);
    const lin = pars ? linPF(s, ss, pol, T, kh0, a0, pars) : linPath(s, ss, pol, T, kh0, a0);
    if (s.method === 'linear') P = lin;
    else if (lin) {
      const pp = pars || Array.from({ length: T + 1 }, () => b);
      // начальное приближение: при перманентном шоке параметра — лог-линейный путь около нового стационара
      const pT = pp[T], ssT = steady(s, pT), polT = pars ? policy(s, ssT, pT) : null;
      const sT = { ...s, ...pT };
      const guess = pars && polT && s.shockPersistence === 'permanent' ? linPath(sT, ssT, polT, T, Math.log(k0 / ssT.k), a0) : lin;
      P = nlPath(s, T, k0, a0, pp, guess);
      if (!P) {
        // продолжение: доля f от отклонения состояния, шока технологии и шока параметра
        let guess = linPath(s, ss, pol, T, 0, 0);
        for (const f of [0.2, 0.4, 0.6, 0.8, 1]) {
          const pf = pp.map((p) => Object.fromEntries(Object.keys(b).map((q) => [q, b[q] + f * (p[q] - b[q])])));
          P = nlPath(s, T, ss.k * Math.exp(f * kh0), f * a0, pf, guess);
          if (!P) break;
          guess = P;
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
  const { hasN, hasG } = trends(s), H = s.horizon, tH = s.tHat, par = isPar(s), tg = s.shockTarget;
  const T = Math.max(H - tH, 0) + 150;
  const k0 = tg === 'k' ? ss.k * (1 + s.shockSize / 100) : ss.k;
  const a0 = tg === 'tfp' ? s.shockSize / 100 : 0;
  const pars = par ? Array.from({ length: T + 1 }, (_, q) => parAt(s, q)) : null;
  const P = pathFrom(s, k0, a0, T, pars);
  if (!P) return { ok: false, errors: ['Нелинейная система не решилась: шок слишком велик. Попробуйте лог-линейное решение или шок меньше.'] };

  const gE = hasG ? 1 + s.g : 1, gL = hasN ? 1 + s.n : 1;
  const t = [], irf = {}, levels = {}, baseLevels = {}, eff = {}, baseEff = {}, agg = {}, baseAgg = {};
  for (const v of [...VARS, 'N', 'r', 'A', 'E', 'L', 'par']) { irf[v] = []; levels[v] = []; baseLevels[v] = []; }
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
    if (par) { const p = parAt(s, q)[tg], p0 = s[tg]; levels.par.push(p); baseLevels.par.push(p0); irf.par.push(p - p0); }
  }
  if (Nmax >= 1) return { ok: false, errors: [`Часы упираются в потолок $N_t\\le 1$ (максимум $${fmtTex(Nmax, 3)}$): шок слишком велик для этой калибровки.`] };
  const permanent = par && s.shockPersistence === 'permanent';
  const ssF = permanent ? steady(s, parAt(s, 0)) : ss;
  return {
    ok: true, t, irf, levels, baseLevels, eff, baseEff, agg, baseAgg, logIrf: true,
    ss0: ss, ssF, permanentChange: permanent, pol,
    marks: { tHat: tH, tEnd: par && s.shockPersistence === 'temporary' && s.tempMode === 'fixed' ? tH + s.shockDur : null, t0: null },
  };
}

// ───────────────────────────── Обозначения ─────────────────────────────

// без трендов — агрегаты (C_t), с ростом населения — на душу (c_t), с ТП — на эффективного работника (c̃_t)
function names(s) {
  const { hasN, hasG } = trends(s);
  const mode = hasG ? 'eff' : hasN ? 'pc' : 'agg';
  const X = (L, lo) => (mode === 'eff' ? `\\tilde ${lo}` : mode === 'pc' ? lo : L);
  const G = hasN && hasG ? '(1+n)(1+g)' : hasN ? '(1+n)' : hasG ? '(1+g)' : '';
  return { hasN, hasG, mode, C: X('C', 'c'), K: X('K', 'k'), Y: X('Y', 'y'), I: X('I', 'i'),
    W: hasG ? '\\tilde w' : 'w', Pi: mode === 'eff' ? '\\tilde\\pi' : mode === 'pc' ? '\\pi' : '\\Pi',
    H: (L, lo) => (mode === 'eff' ? `\\hat{\\tilde ${lo}}` : mode === 'pc' ? `\\hat ${lo}` : `\\hat ${L}`),
    S: (L, lo) => (mode === 'eff' ? `\\tilde ${lo}^*` : mode === 'pc' ? `${lo}^*` : `${L}^*`),
    G, dep: G ? `\\big[${G}-1+\\delta\\big]` : '\\delta ' };
}

// ───────────────────────────── Графики ─────────────────────────────

export function chartSpecs(s) {
  const { hasN, hasG, mode } = names(s), cen = s.version === 'centralized';
  const u = mode === 'agg' ? '% от s.s.' : '% от ТСР', uR = 'п. п.';
  // символ отклика: лог-отклонение со шляпкой (у величин с тильдой — шляпка над тильдой)
  const hat = (L, lo) => (uu) => (uu === 'eff' ? `\\hat{\\tilde ${lo}}_t` : uu === 'agg' || mode === 'agg' ? `\\hat ${L}_t` : `\\hat ${lo}_t`);
  const v = (id, title, L, lo, extra = {}) => ({ id, title, sym: mode === 'agg' ? `${L}_t` : `${lo}_t`, ...(mode !== 'agg' ? { aggSym: `${L}_t` } : {}),
    irfUnit: u, irfLabel: '$\\Delta_{\\ln}\\times100$', irfSym: hat(L, lo), ...extra });
  const specs = [
    ...(hasG ? [{ id: 'E', title: 'Трудосберегающий ТП', sym: 'E_t', irfUnit: '% от тренда', noEff: true, levelOnly: true, noIrf: true }] : []),
    ...(hasN ? [{ id: 'L', title: 'Население', sym: 'L_t', irfUnit: '% от тренда', noEff: true, levelOnly: true, noIrf: true }] : []),
    { id: 'A', title: 'TFP', sym: 'A_t', irfUnit: '%', irfLabel: '$\\hat A_t\\times100$', irfSym: () => '\\hat A_t', noEff: true },
    v('y', 'Выпуск', 'Y', 'y'),
    v('c', 'Потребление', 'C', 'c'),
    v('i', 'Инвестиции', 'I', 'i'),
    { id: 'N', title: 'Часы', sym: 'N_t', irfUnit: u, irfLabel: '$\\hat N_t\\times100$', irfSym: () => '\\hat N_t', noEff: true },
    v('k', 'Капитал', 'K', 'k', mode !== 'agg' ? { wTitle: 'Капиталовооружённость' } : {}),
    cen ? { ...v('w', 'Предельный продукт труда', 'W', 'w'), sym: 'A_tF^{\\prime}_N', aggSym: undefined, irfSym: () => '\\hat w_t' }
      : { ...v('w', 'Зарплата', 'W', 'w'), sym: 'w_t', aggSym: undefined, irfSym: (uu) => (uu === 'eff' ? '\\hat{\\tilde w}_t' : '\\hat w_t') },
    { id: 'r', title: cen ? 'Отдача от капитала' : 'Ставка процента', sym: cen ? 'A_tF^{\\prime}_K-\\delta' : 'r_t',
      irfUnit: uR, irfLabel: '$\\Delta r_t$', irfSym: () => '\\Delta r_t', lvlUnit: '%', noEff: true },
  ];
  if (isPar(s)) {
    const sym = SHOCK_TARGETS[s.shockTarget].sym;
    specs.unshift({ id: 'par', title: PAR_TITLE[s.shockTarget], sym: `${sym}_t`, irfUnit: '$\\Delta$ от s.s.', irfLabel: '$\\Delta$',
      irfSym: () => `\\Delta ${sym}_t`, noEff: true, noLog: true });
  }
  return specs.map((c) => ({ ...c, effAvailable: hasG && !c.noEff }));
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

export function formulas(s) {
  const { hasN, hasG, mode, C, K, Y, I, W, Pi, G } = names(s);
  const cen = s.version === 'centralized', tg = s.shockTarget;
  const a = s.alpha, d = s.delta, Gv = steady(s).G;
  const fs = { dec: [], cen: [], system: [], shock: [], problemTitle: 'Модель', systemTitle: 'Уравнения динамики',
    ssTitle: mode === 'agg' ? 'Стационарное состояние' : 'Траектория сбалансированного роста' };
  const t = (v, i = 't') => `${v}_{${i}}`;

  // параметр, на который пришёлся шок, меняется во времени: β_t, θ_t, χ_t, δ_t
  const ps = (key, sym, i = 't') => (tg === key ? (i === 't' ? `${sym}_t` : `${sym}_{${i}}`) : `${sym} `);
  // ── оптимизационные задачи
  const cArg = mode === 'eff' ? '(\\tilde c_tE_t)' : `${C}_t`;
  const u = `\\ln${mode === 'eff' ? '' : ' '}${cArg}-\\theta\\dfrac{N_t^{1+\\chi}}{1+\\chi}`;
  const maxH = `\\max_{\\{${C}_t,\\,N_t,\\,${K}_{t+1}\\}_{t=0}^{\\infty}}\\; \\sum_{t=0}^{\\infty}\\beta^t\\left(${u}\\right)`;
  const tvc = `\\text{TVC:}\\quad \\lim_{t\\to\\infty}\\beta^t\\lambda_t${K}_{t+1}=0`;
  const bounds = `0\\le N_t\\le 1,\\qquad ${K}_0\\ \\text{задано}`;
  const lhsK = `${G}${K}_{t+1}`;
  fs.dec.push({ agent: 'Домохозяйства', system: true, items: [maxH,
    `\\text{s.t.}\\quad ${C}_t+${lhsK}=${W}_tN_t+(1+r_t)${K}_t+${Pi}_t`, bounds, tvc] });
  const lab = `${hasG ? 'E_t' : ''}${hasN ? 'L_t' : ''}N_t`;
  const labPow = hasN || hasG ? `(${lab})^{1-\\alpha}` : 'N_t^{1-\\alpha}';
  fs.dec.push({ agent: 'Фирмы', items: [`\\max_{K_t,\\,N_t}\\; \\Pi_t=A_tK_t^{\\alpha}${labPow}-w_t${hasN ? 'L_t' : ''}N_t-(r_t+${ps('delta', '\\delta')})K_t`] });
  fs.dec.push({ agent: 'Рынки', items: ['K_t^D=K_t^S', 'N_t^D=N_t^S', 'Y_t=C_t+I_t'] });
  const lawN = 'L_{t+1}=(1+n)L_t', lawG = 'E_{t+1}=(1+g)E_t';
  const trendLine = hasN && hasG ? `${lawN},\\qquad ${lawG},\\qquad L_0=E_0=1` : hasN ? `${lawN},\\qquad L_0=1`
    : hasG ? `${lawG},\\qquad E_0=1,\\qquad L_t=1` : 'L_t=1';
  const exo = ['\\ln A_{t+1}=\\rho\\ln A_t+\\varepsilon_{t+1},\\qquad A^*=1', trendLine];
  fs.dec.push({ agent: 'Экзогенные процессы', items: exo });
  fs.cen.push({ agent: 'Центральный планировщик', system: true, items: [maxH,
    `\\text{s.t.}\\quad ${C}_t+${lhsK}=A_t${K}_t^{\\alpha}N_t^{1-\\alpha}+(1-${ps('delta', '\\delta')})${K}_t`, bounds, tvc] });
  fs.cen.push({ agent: 'Экзогенные процессы', items: exo });

  // ── уравнения динамики (как в лекции) и они же в числах; у шокированного параметра — индекс времени
  const Gn = G ? n4(Gv) : '';
  const bN = tg === 'beta' ? '\\beta_t' : n4(s.beta);
  const thN = tg === 'theta' ? '\\theta_t' : co(s.theta);
  const chT = ps('chi', '\\chi'), chN = tg === 'chi' ? '^{\\chi_t}' : pw(s.chi);
  const row = (label, tex, num) => fs.system.push({ label, tex, num });
  if (cen) {
    const gross = tg === 'delta' ? `1+${n4(a)}A_{t+1}${t(K, 't+1')}^{${n4(a - 1)}}N_{t+1}^{${n4(1 - a)}}-\\delta_{t+1}`
      : `${n4(1 - d)}+${n4(a)}A_{t+1}${t(K, 't+1')}^{${n4(a - 1)}}N_{t+1}^{${n4(1 - a)}}`;
    row('Уравнение Эйлера', `${G}${t(C, 't+1')}=${ps('beta', '\\beta')}\\left(1+\\alpha A_{t+1}${t(K, 't+1')}^{\\alpha-1}N_{t+1}^{1-\\alpha}-${ps('delta', '\\delta', 't+1')}\\right)${C}_t`,
      `${Gn}${t(C, 't+1')}=${bN}\\left(${gross}\\right)${C}_t`);
    row('«Труд — досуг»', `${ps('theta', '\\theta')}N_t^{${chT}}${C}_t=(1-\\alpha)A_t${K}_t^{\\alpha}N_t^{-\\alpha}`,
      `${thN}N_t${chN}${C}_t=${n4(1 - a)}A_t${K}_t^{${n4(a)}}N_t^{${n4(-a)}}`);
  } else {
    row('Уравнение Эйлера', `${G}${t(C, 't+1')}=${ps('beta', '\\beta')}(1+r_{t+1})${C}_t`, `${Gn}${t(C, 't+1')}=${bN}(1+r_{t+1})${C}_t`);
    row('«Труд — досуг»', `${ps('theta', '\\theta')}N_t^{${chT}}=${W}_t/${C}_t`, `${thN}N_t${chN}=${W}_t/${C}_t`);
    row('Спрос на труд', `${W}_t=(1-\\alpha)${Y}_t/N_t`, `${W}_t=${n4(1 - a)}${Y}_t/N_t`);
    row('Спрос на капитал', `r_t+${ps('delta', '\\delta')}=\\alpha ${Y}_t/${K}_t`, `r_t${tg === 'delta' ? '+\\delta_t' : pm(d)}=${n4(a)}${Y}_t/${K}_t`);
  }
  row('Производство', `${Y}_t=A_t${K}_t^{\\alpha}N_t^{1-\\alpha}`, `${Y}_t=A_t${K}_t^{${n4(a)}}N_t^{${n4(1 - a)}}`);
  row('Ресурсы', `${Y}_t=${C}_t+${I}_t`, `${Y}_t=${C}_t+${I}_t`);
  row('Накопление капитала', `${lhsK}=${I}_t+(1-${ps('delta', '\\delta')})${K}_t`,
    `${Gn}${K}_{t+1}=${I}_t+${tg === 'delta' ? '(1-\\delta_t)' : n4(1 - d)}${K}_t`);
  row('Технология', '\\ln A_{t+1}=\\rho\\ln A_t', `\\ln A_{t+1}=${n4(s.rho)}\\ln A_t`);

  // ── шок
  const hat = `\\hat t=${s.tHat}`;
  if (tg === 'tfp') fs.shock.push({
    tex: '\\ln A_{\\hat t}=\\rho\\ln A_{\\hat t-1}+\\varepsilon,\\qquad \\varepsilon_t=0\\ \\text{при}\\ t\\ne\\hat t',
    num: `\\varepsilon=${n4(s.shockSize / 100)},\\qquad ${hat}` });
  else if (tg === 'k') fs.shock.push({ tex: `${K}^{\\prime}_{\\hat t}=(1+\\varphi_k)${K}_{\\hat t}`, num: `\\varphi_k=${n4(s.shockSize / 100)},\\qquad ${hat}` });
  else {
    const sym = SHOCK_TARGETS[tg].sym, perm = s.shockPersistence === 'permanent', fixed = !perm && s.tempMode === 'fixed';
    const pr = perm ? '\\text{𝟙}\\{t\\ge\\hat t\\}' : fixed ? '\\text{𝟙}\\{\\hat t\\le t<\\hat t+N\\}' : '\\rho_s^{\\,t-\\hat t}\\,\\text{𝟙}\\{t\\ge\\hat t\\}';
    fs.shock.push({ tex: `${sym}_t=${sym}+\\Delta ${sym}\\cdot ${pr}`,
      num: `\\Delta ${sym}=${n4(s.shockSize)},\\qquad ${hat}${perm ? '' : fixed ? `,\\qquad N=${s.shockDur}` : `,\\qquad \\rho_s=${n4(s.rhoS)}`}` });
  }
  return fs;
}

// Блок сразу за уравнениями динамики: лог-линейная система и функции политики
export function systemBlocks(s) {
  if (validate(s).length) return [];
  const ss = steady(s), pol = policy(s, ss), tg = s.shockTarget;
  const { mode, hasG, H, S, G, dep } = names(s);
  const a = s.alpha, d = s.delta;
  const [c, k, y, i, w] = [H('C', 'c'), H('K', 'k'), H('Y', 'y'), H('I', 'i'), hasG ? '\\hat{\\tilde w}' : '\\hat w'];
  const bG = G ? `\\dfrac{\\beta}{${G}}` : '\\beta';
  // слагаемые шока параметра: β̂_t = ln β_t − ln β, θ̂_t = ln θ_t − ln θ, Δχ_t = χ_t − χ, Δδ_t = δ_t − δ
  const sB = tg === 'beta' ? '+\\hat\\beta_t' : '', sTh = tg === 'theta' ? '-\\hat\\theta_t' : '';
  const sCh = tg === 'chi' ? '+\\ln N^*\\,\\Delta\\chi_t' : '', sChN = tg === 'chi' ? `${pm(Math.log(ss.N))}\\Delta\\chi_t` : '';
  const sD = tg === 'delta' ? '-\\Delta\\delta_t' : '';
  const rows = [
    { label: 'Уравнение Эйлера', tex: `${c}_{t+1}-${c}_t=${bG}\\Delta r_{t+1}${sB}`, num: `${c}_{t+1}-${c}_t=${n4(s.beta / ss.G)}\\Delta r_{t+1}${sB}` },
    { label: '«Труд — досуг»', tex: `\\chi\\hat N_t${sCh}=${w}_t-${c}_t${sTh}`, num: `${co(s.chi)}\\hat N_t${sChN}=${w}_t-${c}_t${sTh}` },
    { label: 'Спрос на труд', tex: `${w}_t=${y}_t-\\hat N_t`, num: `${w}_t=${y}_t-\\hat N_t` },
    { label: 'Спрос на капитал', tex: `\\Delta r_t=(r^*+\\delta)(${y}_t-${k}_t)${sD}`, num: `\\Delta r_t=${n4(ss.r + d)}(${y}_t-${k}_t)${sD}` },
    { label: 'Производство', tex: `${y}_t=\\hat A_t+\\alpha${k}_t+(1-\\alpha)\\hat N_t`, num: `${y}_t=\\hat A_t+${n4(a)}${k}_t+${n4(1 - a)}\\hat N_t` },
    { label: 'Ресурсы', tex: `${S('Y', 'y')}${y}_t=${S('C', 'c')}${c}_t+${S('I', 'i')}${i}_t`,
      num: `${n4(ss.y)}${y}_t=${n4(ss.c)}${c}_t+${n4(ss.i)}${i}_t` },
    { label: 'Накопление капитала', tex: `${G}${k}_{t+1}=${dep}${i}_t+(1-\\delta)${k}_t${sD}`,
      num: `${G ? n4(ss.G) : ''}${k}_{t+1}=${n4(ss.dep)}${i}_t+${n4(1 - d)}${k}_t${sD}` },
    { label: 'Технология', tex: '\\hat A_{t+1}=\\rho\\hat A_t', num: `\\hat A_{t+1}=${n4(s.rho)}\\hat A_t` },
  ];
  if (isPar(s)) {
    const def = { beta: '\\hat\\beta_t=\\ln\\beta_t-\\ln\\beta', theta: '\\hat\\theta_t=\\ln\\theta_t-\\ln\\theta',
      chi: '\\Delta\\chi_t=\\chi_t-\\chi', delta: '\\Delta\\delta_t=\\delta_t-\\delta' }[tg];
    rows.push({ label: 'Шок параметра', tex: def });
  }
  const groups = [{ rows }];
  if (pol) groups.push({ rows: [
    { label: 'Потребление', tex: `${c}_t=\\eta_{CK}${k}_t+\\eta_{CA}\\hat A_t`, num: `${c}_t=${term(pol.cK, `${k}_t`, true)}${term(pol.cA, '\\hat A_t')}` },
    { label: 'Капитал', tex: `${k}_{t+1}=\\eta_{KK}${k}_t+\\eta_{KA}\\hat A_t`, num: `${k}_{t+1}=${term(pol.KK, `${k}_t`, true)}${term(pol.KA, '\\hat A_t')}` },
    { label: 'Часы', tex: `\\hat N_t=\\eta_{NK}${k}_t+\\eta_{NA}\\hat A_t`, num: `\\hat N_t=${term(pol.NK, `${k}_t`, true)}${term(pol.NA, '\\hat A_t')}` },
  ] });
  return [{ title: 'Лог-линеаризованная система',
    note: mode === 'agg' ? 'лог-отклонения от стационара, ставка — в п. п.' : 'лог-отклонения от ТСР, ставка — в п. п.', groups }];
}

// ───────────────────────────── Стационар / ТСР ─────────────────────────────

export function steadyTable(s, res) {
  const { mode, hasG, S, G, dep } = names(s);
  const ss0 = res?.ss0 || steady(s), ssF = res?.ssF || ss0;
  const [kS, yS, cS, iS] = [S('K', 'k'), S('Y', 'y'), S('C', 'c'), S('I', 'i')];
  const wS = hasG ? '\\tilde w^*' : 'w^*';
  const kap = `\\dfrac{${kS}}{N^*}`, cN = `\\dfrac{${cS}}{N^*}`;
  const e = mode === 'eff' ? ' на эфф. работника' : mode === 'pc' ? ' на душу' : '';
  const rows = [
    { sym: 'r^*', name: 'ставка процента', key: 'r', pct: true, tex: G ? `\\dfrac{${G}}{\\beta}-1` : '\\dfrac{1}{\\beta}-1' },
    { sym: kap, name: 'капитал на единицу труда', key: 'kap', tex: '\\left(\\dfrac{\\alpha}{r^*+\\delta}\\right)^{\\frac{1}{1-\\alpha}}' },
    { sym: wS, name: `зарплата${hasG ? ' на эфф. единицу труда' : ''}`, key: 'w', tex: `(1-\\alpha)\\left(${kap}\\right)^{\\alpha}` },
    { sym: cN, name: 'потребление на единицу труда', key: 'cN', tex: `\\left(${kap}\\right)^{\\alpha}-${dep}${kap}` },
    { sym: 'N^*', name: 'часы', key: 'N', tex: `\\left(\\dfrac{${wS}}{\\theta\\cdot ${cS}/N^*}\\right)^{\\frac{1}{1+\\chi}}` },
    { sym: kS, name: mode === 'eff' ? 'капиталовооружённость на эфф. работника' : mode === 'pc' ? 'капиталовооружённость' : 'капитал', key: 'k', tex: `${kap}N^*` },
    { sym: yS, name: `выпуск${e}`, key: 'y', tex: `\\left(${kap}\\right)^{\\alpha}N^*` },
    { sym: cS, name: `потребление${e}`, key: 'c', tex: `${cN}N^*` },
    { sym: iS, name: `инвестиции${e}`, key: 'i', tex: `${dep}${kS}` },
    { sym: `\\dfrac{${kS}}{${yS}}`, name: 'капиталоёмкость выпуска (кварталов)', key: 'KY', tex: `\\left(${kap}\\right)^{1-\\alpha}` },
  ];
  const v = (ss, r) => (r.pct ? `${(100 * ss[r.key]).toFixed(2)}%` : fmt(ss[r.key], 3));
  return rows.map((r) => ({ ...r, before: v(ss0, r), after: v(ssF, r), value: ss0[r.key] }));
}

// ───────────────────────────── Сходимость и ТСР ─────────────────────────────

export function extraBlocks(s) {
  return [{ ...convergenceBlock(s), beforeSS: true }];
}

function convergenceBlock(s) {
  const { mode, C, K, Y, I } = names(s), ss = steady(s), H = s.horizon;
  const P = validate(s).length ? null : pathFrom(s, s.k0, 0, H + 150);
  const color = tc('#3d8acb'), HL = tc('#7c62d8');
  const pick = (v, f = (x) => x) => (P ? Array.from({ length: H + 1 }, (_, j) => [j, f(P[v][j])]) : []);
  const mk = (title, sym, data, hl, unit) => {
    const hh = data.length ? halfLife(data, hl, true) : null;
    return { title, sym, unit, series: [{ label: `$${sym}$`, data, color, width: 2.6 }],
      opts: { xLabel: 't', xmin: 0, xmax: H, discrete: true, hlines: [{ y: hl, color: tc('#7d7ca5') }], marksOnAxis: true,
        vlines: hh ? [{ x: hh.x, yTo: hh.y, color: HL, dots: true, label: `t_{1/2}=${fmtTex(hh.x, 0)}` }] : [] } };
  };
  const e = mode === 'eff' ? ' на эфф. работника' : mode === 'pc' ? ' на душу' : '';
  return {
    title: 'Сходимость к стационару',
    legend: [{ label: `траектория из $${K}_0 = ${fmtTex(s.k0, 3)}$`, color }, { label: 'стационарное значение', color: tc('#7d7ca5'), dash: true },
      { label: 'период полусходимости', color: HL, dots: true }],
    charts: [
      mk(mode === 'eff' ? 'Капиталовооружённость на эфф. работника' : mode === 'pc' ? 'Капиталовооружённость' : 'Капитал', `${K}_t`, pick('k'), ss.k, ''),
      mk(`Выпуск${e}`, `${Y}_t`, pick('y'), ss.y, ''),
      mk(`Потребление${e}`, `${C}_t`, pick('c'), ss.c, ''),
      mk(`Инвестиции${e}`, `${I}_t`, pick('i'), ss.i, ''),
      mk('Часы', 'N_t', pick('N'), ss.N, ''),
      mk(s.version === 'centralized' ? 'Отдача от капитала' : 'Ставка процента', 'r_t', pick('r', (x) => 100 * x), 100 * ss.r, '%'),
    ],
  };
}

// Графики под таблицей ТСР: с ТП — величины на работника, только с ростом населения — агрегаты
export function ssCharts(s, res, scale = 'log') {
  const { mode, hasG, K } = names(s);
  if (mode === 'agg' || validate(s).length) return null;
  const ss = steady(s), H = s.horizon;
  const P = pathFrom(s, s.k0, 0, H + 150);
  const tr = (j) => (hasG ? Math.pow(1 + s.g, j) : Math.pow(1 + s.n, j));   // с ТП — тренд E_t, иначе — L_t
  const color = tc('#3d8acb'), BG = tc('#7d7ca5');
  const cen = s.version === 'centralized';
  const mk = (title, sym, key) => ({ title, sym, unit: '',
    series: [{ label: 'ТСР', data: Array.from({ length: H + 1 }, (_, j) => [j, ss[key] * tr(j)]), color: BG, width: 2, dash: [6, 4] },
      { label: `$${sym}$`, data: P ? Array.from({ length: H + 1 }, (_, j) => [j, P[key][j] * tr(j)]) : [], color, width: 2.6 }],
    opts: { xLabel: 't', xmin: 0, xmax: H, ymin: scale === 'log' ? undefined : 0, log: scale === 'log', discrete: true, marksOnAxis: true } });
  const charts = hasG
    ? [mk('Капиталовооружённость', 'k_t', 'k'), mk('Выпуск на работника', 'y_t', 'y'), mk('Потребление на работника', 'c_t', 'c'),
      mk(cen ? 'Предельный продукт труда' : 'Зарплата', cen ? 'A_tF^{\\prime}_N' : 'w_t', 'w')]
    : [mk('Капитал', 'K_t', 'k'), mk('Выпуск', 'Y_t', 'y'), mk('Потребление', 'C_t', 'c'), mk('Инвестиции', 'I_t', 'i')];
  return {
    subtitle: 'Сходимость к траектории сбалансированного роста',
    scaleToggle: true,
    legend: [{ label: 'ТСР', color: BG, dash: true }, { label: `путь из $${K}_0$`, color }],
    charts,
  };
}
