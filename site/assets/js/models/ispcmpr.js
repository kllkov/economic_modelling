// Трёхуравненная новокейнсианская модель IS–PC–MPR (Galí, гл. 3) в дискретном времени.
// ỹ_t (в коде x) — разрыв выпуска, π_t — инфляция, i_t — номинальная ставка, r_t = i_t − E*_t π_{t+1} — реальная ставка,
// r^n_t — естественная ставка. Модель лог-линеаризована вокруг стационара с нулевой инфляцией (цель ЦБ = 0).
// Все ставки и инфляция — в процентах за период.
//
// Кривая Филлипса: π_t = β E*_t π_{t+1} + κ ỹ_t + u_t; правило: i_t = ρ + φ_π π_t + φ_y ỹ_t + v_t (Galí).
// Ожидания: наивные (E* π = 0 — цели ЦБ, E* ỹ = 0), адаптивные (обучение с коэффициентом γ, лекция 5),
// рациональные (совершенное предвидение после получения информации в t₀ — MIT-шок или объявленный шок).
// В каждом периоде при заданных ожиданиях IS, PC и MPR линейны и решаются явно; при рациональных
// ожиданиях та же формула применяется рекурсивно назад от конечного стационара.

const SHOCK_TARGETS = {
  d:      { label: 'Спрос (естественная ставка) $d_t$', kind: 'exo', unit: 'pp', def: 1, step: 0.25 },
  u:      { label: 'Издержки (cost-push) $u_t$', kind: 'exo', unit: 'pp', def: 1, step: 0.25 },
  v:      { label: 'Денежно-кредитная политика $v_t$', kind: 'exo', unit: 'pp', def: 1, step: 0.25 },
  a:      { label: 'Технология $a_t$', kind: 'exo', unit: '%', def: 1, step: 0.5 },
};

export const meta = { id: 'is-pc-mpr', title: 'IS–PC–MPR', subtitle: 'Three-equation New Keynesian model', ready: true };

export const defaults = {
  time: 'discrete', expectations: 'rational',
  beta: 0.99, sigma: 1, varphi: 1, alpha: 0.33, epsilon: 6, theta: 0.67,
  phiPi: 1.5, phiY: 0.125, gamma: 0.2, pie0: 4,
  shockTarget: 'v', shockSize: 1, shockTiming: 'unexpected', tHat: 5, t0: 2,
  shockPersistence: 'temporary', rhoS: 0.5,
  horizon: 40,
};

const shockTargetsFor = () => Object.entries(SHOCK_TARGETS).map(([v, d]) => ({ v, l: d.label }));

export const controls = [
  { section: 'Модель' },
  { id: 'expectations', label: 'Инфляционные ожидания', type: 'segmented',
    options: [{ v: 'naive', l: 'Наивные' }, { v: 'adaptive', l: 'Адаптивные' }, { v: 'rational', l: 'Рациональные' }] },

  { section: 'Параметры' },
  { id: 'beta', label: '$\\beta$ — дисконт-фактор', type: 'number', min: 0.5, max: 0.999, step: 0.005 },
  { id: 'sigma', label: '$\\sigma$ — неприятие риска', type: 'number', min: 0.1, max: 10, step: 0.1 },
  { id: 'varphi', label: '$\\varphi$ — обратная эластичность Фриша', type: 'number', min: 0, max: 10, step: 0.1 },
  { id: 'alpha', label: '$\\alpha$ — в $Y=AN^{1-\\alpha}$', type: 'number', min: 0, max: 0.9, step: 0.01 },
  { id: 'epsilon', label: '$\\varepsilon$ — эластичность замещения товаров', type: 'number', min: 1.1, max: 50, step: 0.5 },
  { id: 'theta', label: '$\\theta$ — доля фирм без пересмотра цены', type: 'number', min: 0.01, max: 0.99, step: 0.01 },
  { id: 'phiPi', label: '$\\phi_\\pi$ — реакция на инфляцию', type: 'number', min: 0, max: 10, step: 0.05 },
  { id: 'phiY', label: '$\\phi_y$ — реакция на разрыв выпуска', type: 'number', min: 0, max: 5, step: 0.025 },
  { id: 'gamma', label: '$\\gamma$ — коэффициент обучения', type: 'number', min: 0.01, max: 1, step: 0.05,
    show: (s) => s.expectations === 'adaptive' },
  { id: 'pie0', label: '$E^*_0\\pi_1$ — начальные ожидания, %', type: 'number', min: -20, max: 50, step: 0.5,
    show: (s) => s.expectations === 'adaptive' },

  { section: 'Шок' },
  { id: 'shockTarget', label: 'На что шок', type: 'select', rich: true, options: shockTargetsFor,
    groupLabel: () => 'экзогенные процессы' },
  { id: 'shockSize', label: (s) => (SHOCK_TARGETS[s.shockTarget]?.unit === '%' ? 'Величина, $\\Delta$(%)' : 'Величина, $\\Delta$(п.п.)'),
    type: 'number', step: (s) => SHOCK_TARGETS[s.shockTarget]?.step ?? 0.25 },
  { id: 'shockTiming', label: 'Ожидаемость', type: 'segmented',
    options: [{ v: 'unexpected', l: 'Неожиданный (MIT)' }, { v: 'expected', l: 'Ожидаемый' }],
    show: (s) => s.expectations === 'rational' },
  { id: 'tHat', label: 'Момент шока $\\hat t$', type: 'number', min: 0, max: 100, step: 1 },
  { id: 't0', label: 'Объявление $t_0$', type: 'number', min: 0, max: 100, step: 1,
    show: (s) => s.expectations === 'rational' && s.shockTiming === 'expected', hint: 'Должно быть меньше $\\hat t$' },
  { id: 'shockPersistence', label: 'Длительность', type: 'segmented',
    options: [{ v: 'permanent', l: 'Перманентный' }, { v: 'temporary', l: 'Временный' }] },
  { id: 'rhoS', label: 'Персистентность $\\rho_s$', type: 'number', slider: true, min: 0, max: 0.99, step: 0.01,
    show: (s) => s.shockPersistence === 'temporary', hint: 'Отклонение затухает как $\\rho_s^{\\,t-\\hat t}$' },

  { section: 'Отображение' },
  { id: 'horizon', label: 'Горизонт графиков', type: 'number', min: 10, max: 200, step: 5 },
];

export function normalize(st, changed) {
  if (!SHOCK_TARGETS[st.shockTarget]) { st.shockTarget = 'v'; changed = 'shockTarget'; }
  if (changed === 'shockTarget') st.shockSize = SHOCK_TARGETS[st.shockTarget].def;
  if (st.expectations !== 'rational') st.shockTiming = 'unexpected';
  st.time = 'discrete';
  return st;
}

// ───────────────────────────── Структурные коэффициенты ─────────────────────────────

export function coefs(st) {
  const { beta: b, sigma: s, varphi: ph, alpha: a, epsilon: e, theta: th } = st;
  const Theta = (1 - a) / (1 - a + a * e);
  const lambda = ((1 - th) * (1 - b * th) / th) * Theta;
  const kappa = lambda * (s + (ph + a) / (1 - a));
  const psi = (1 + ph) / (s * (1 - a) + ph + a);
  const rho = -100 * Math.log(b);               // ρ = −ln β, в процентах
  const det = (1 - b) * st.phiY + kappa * (st.phiPi - 1); // принцип Тейлора: det > 0
  return { Theta, lambda, kappa, psi, rho, det };
}

// ───────────────────────────── Решатель ─────────────────────────────

function prof(st, t) {
  if (t < st.tHat - 1e-9) return 0;
  return st.shockPersistence === 'permanent' ? 1 : Math.pow(st.rhoS, t - st.tHat);
}

// экзогенные величины в период t (scale = 0 — базовый путь)
function exo(st, t, scale = 1) {
  const p = (t === Infinity ? (st.shockPersistence === 'permanent' ? 1 : 0) : prof(st, t)) * scale;
  const tg = st.shockTarget, z = st.shockSize;
  return {
    piStar: 0,
    d: tg === 'd' ? z * p : 0,
    u: tg === 'u' ? z * p : 0,
    v: tg === 'v' ? z * p : 0,
    a: tg === 'a' ? z * p : 0,
  };
}

// Решение IS + PC + MPR в одном периоде при заданных ожиданиях eπ = E*_t π_{t+1}, ex = E*_t x_{t+1}
export function staticSolve(st, C, E, epi, ex, rn) {
  const { sigma: s, beta: b, phiPi: fp, phiY: fy } = st;
  const k = C.kappa;
  const x = (s * ex - C.rho - E.piStar - fp * b * (epi - E.piStar) - fp * E.u - E.v + epi + rn) / (s + fp * k + fy);
  const pi = E.piStar + b * (epi - E.piStar) + k * x + E.u;
  const i = C.rho + E.piStar + fp * (pi - E.piStar) + fy * x + E.v;
  return { x, pi, i, r: i - epi };
}

// Стационар при постоянных экзогенных величинах E
export function steady(st, E, C = coefs(st)) {
  const k = C.kappa, b = st.beta;
  const rn = C.rho + E.d;
  let x, ph;
  if (st.expectations === 'naive') {
    // E* π = π*, E* x = 0
    x = (E.d - E.v - st.phiPi * E.u) / (st.sigma + st.phiY + st.phiPi * k);
    ph = k * x + E.u;
  } else {
    // E* π = π, E* x = x
    ph = (st.phiY * E.u + k * (E.d - E.v)) / C.det;
    x = ((1 - b) * (E.d - E.v) - (st.phiPi - 1) * E.u) / C.det;
  }
  const pi = E.piStar + ph;
  const i = C.rho + E.piStar + st.phiPi * ph + st.phiY * x + E.v;
  const epi = st.expectations === 'naive' ? E.piStar : pi;
  return { pi, x, i, r: i - epi, epi, ex: st.expectations === 'naive' ? 0 : x, rn, piStar: E.piStar, a: E.a,
    yn: C.psi * E.a, y: C.psi * E.a + x, u: E.u, v: E.v, d: E.d, kappa: k, det: C.det };
}

function validate(st) {
  const errs = [];
  if (!(st.beta > 0 && st.beta < 1)) errs.push('$\\beta$ должна лежать в $(0,1)$.');
  if (!(st.sigma > 0)) errs.push('$\\sigma$ должна быть положительной.');
  if (!(st.varphi >= 0)) errs.push('$\\varphi$ не может быть отрицательной.');
  if (!(st.alpha >= 0 && st.alpha < 1)) errs.push('$\\alpha$ должна лежать в $[0,1)$.');
  if (!(st.epsilon > 1)) errs.push('$\\varepsilon$ должна быть больше 1.');
  if (!(st.theta > 0 && st.theta < 1)) errs.push('$\\theta$ должна лежать в $(0,1)$.');
  if (!(st.phiPi >= 0) || !(st.phiY >= 0)) errs.push('Коэффициенты правила $\\phi_\\pi$ и $\\phi_y$ не могут быть отрицательными.');
  if (st.expectations === 'adaptive' && !(st.gamma > 0 && st.gamma <= 1)) errs.push('$\\gamma$ должна лежать в $(0,1]$.');
  if (st.expectations === 'rational' && st.shockTiming === 'expected' && !(st.t0 < st.tHat)) errs.push('Момент объявления $t_0$ должен быть раньше $\\hat t$.');
  if (st.shockPersistence === 'temporary' && !(st.rhoS >= 0 && st.rhoS < 1)) errs.push('$\\rho_s$ должна лежать в $[0,1)$.');
  if (!errs.length && st.expectations !== 'naive') {
    const C = coefs(st);
    if (!(C.det > 0))
      errs.push(st.expectations === 'rational'
        ? 'Нарушен принцип Тейлора: $\\kappa(\\phi_\\pi-1)+(1-\\beta)\\phi_y \\le 0$, равновесие при рациональных ожиданиях не единственно.'
        : 'Нарушен принцип Тейлора: $\\kappa(\\phi_\\pi-1)+(1-\\beta)\\phi_y \\le 0$, при адаптивных ожиданиях траектория не сходится к стационару.');
  }
  return errs;
}

// Траектория на t = 0..N. scale = 0 — базовый путь; init — начальные ожидания для адаптивного случая.
export function simulate(st, N, scale = 1, init = null) {
  const C = coefs(st);
  const E = []; for (let t = 0; t <= N + 1; t++) E.push(exo(st, t, scale));
  const ex = st.expectations;
  const t0 = ex === 'rational' && st.shockTiming === 'expected' && scale ? Math.min(st.t0, st.tHat) : st.tHat;
  // естественная ставка: r^n_t = ρ + σψ(E_t a_{t+1} − a_t) + d_t, будущая технология известна с t₀
  const rnAt = (t) => C.rho + st.sigma * C.psi * ((t >= t0 ? E[t + 1].a : E[t].a) - E[t].a) + E[t].d;
  const out = { pi: [], x: [], i: [], r: [], epi: [], ex: [], rn: [], E, t0, C };
  const ss0 = steady(st, exo(st, 0, 0), C);
  const put = (t, s, epi, exx, rn) => {
    out.pi[t] = s.pi; out.x[t] = s.x; out.i[t] = s.i; out.r[t] = s.r; out.epi[t] = epi; out.ex[t] = exx; out.rn[t] = rn;
  };

  if (ex === 'naive') {
    for (let t = 0; t <= N; t++) { const rn = rnAt(t); put(t, staticSolve(st, C, E[t], E[t].piStar, 0, rn), E[t].piStar, 0, rn); }
  } else if (ex === 'adaptive') {
    let epi = init ?? ss0.epi, exx = 0;
    for (let t = 0; t <= N; t++) {
      if (t > 0) { epi += st.gamma * (out.pi[t - 1] - epi); exx += st.gamma * (out.x[t - 1] - exx); }
      const rn = rnAt(t);
      const s = staticSolve(st, C, E[t], epi, exx, rn);
      if (![s.x, s.pi, s.i].every((v) => Number.isFinite(v) && Math.abs(v) < 1e6)) return null;
      put(t, s, epi, exx, rn);
    }
  } else {
    // рациональные ожидания: до t₀ экономика в исходном стационаре; с t₀ — совершенное предвидение,
    // рекурсия назад от конечного стационара (устойчива при выполнении принципа Тейлора)
    const T = N + 600;
    const Ef = exo(st, Infinity, scale);
    const fin = steady(st, Ef, C);
    let pn = fin.pi, xn = fin.x;
    const tmp = [];
    for (let t = T; t >= t0; t--) {
      const Et = t <= N + 1 ? E[t] : exo(st, t, scale);
      const Et1 = t + 1 <= N + 1 ? E[t + 1] : exo(st, t + 1, scale);
      const rn = C.rho + st.sigma * C.psi * (Et1.a - Et.a) + Et.d;
      const s = staticSolve(st, C, Et, pn, xn, rn);
      if (t <= N) tmp[t] = { s, epi: pn, exx: xn, rn };
      pn = s.pi; xn = s.x;
    }
    for (let t = 0; t <= N; t++) {
      if (t < t0) put(t, ss0, ss0.epi, 0, ss0.rn);
      else put(t, tmp[t].s, tmp[t].epi, tmp[t].exx, tmp[t].rn);
    }
  }
  return out;
}

export function solve(st) {
  const errors = validate(st);
  if (errors.length) return { ok: false, errors };
  const N = Math.round(Math.max(st.horizon, st.tHat + 1));
  const sim = simulate(st, N, 1);
  if (!sim) return { ok: false, errors: ['Траектория разошлась: ожидания не сходятся к стационару при текущих параметрах.'] };
  const C = sim.C;
  const ss0 = steady(st, exo(st, 0, 0), C);
  const ssF = steady(st, exo(st, Infinity, 1), C);

  const keys = ['pi', 'x', 'i', 'r', 'epi', 'rn', 'u', 'v', 'a', 'yn', 'y'];
  const irf = {}, lvl = {}, base = {};
  keys.forEach((k) => { irf[k] = []; lvl[k] = []; base[k] = []; });
  const t = [];
  const b0 = { pi: ss0.pi, x: 0, i: ss0.i, r: ss0.r, epi: ss0.epi, rn: ss0.rn, u: 0, v: 0, a: 0, yn: 0, y: 0 };
  for (let j = 0; j <= st.horizon; j++) {
    const E = sim.E[j];
    const L = { pi: sim.pi[j], x: sim.x[j], i: sim.i[j], r: sim.r[j], epi: sim.epi[j], rn: sim.rn[j],
      u: E.u, v: E.v, a: E.a, yn: C.psi * E.a, y: C.psi * E.a + sim.x[j] };
    t.push(j);
    for (const k of keys) { lvl[k].push(L[k]); base[k].push(b0[k]); irf[k].push(L[k] - b0[k]); }
  }
  const moved = ['pi', 'x', 'i', 'r', 'epi'].some((k) => Math.abs(ssF[k] - ss0[k]) > 1e-10);
  return {
    ok: true, h: 1, t, irf, levels: lvl, baseLevels: base, eff: {}, baseEff: {}, agg: {}, baseAgg: {},
    ss0, ssF, sim, C, permanentChange: moved,
    marks: { tHat: st.tHat, t0: st.expectations === 'rational' && st.shockTiming === 'expected' ? st.t0 : null },
  };
}

// ───────────────────────────── Графики ─────────────────────────────

export function chartSpecs(st) {
  const Ex = st.expectations === 'rational' ? '\\mathbb E_t' : 'E^*_t';
  const pp = '$\\Delta$(п.п.) от s.s.';
  const tg = st.shockTarget;
  const specs = [
    { id: 'pi', title: 'Инфляция', sym: '\\pi_t', irfUnit: pp, lvlUnit: '%' },
    { id: 'x', title: 'Разрыв выпуска', sym: '\\tilde y_t', irfUnit: pp, lvlUnit: '%' },
    { id: 'i', title: 'Номинальная ставка', sym: 'i_t', irfUnit: pp, lvlUnit: '%' },
    { id: 'r', title: 'Реальная ставка', sym: 'r_t', irfUnit: pp, lvlUnit: '%' },
    { id: 'epi', title: 'Инфляционные ожидания', sym: `${Ex}\\pi_{t+1}`, irfUnit: pp, lvlUnit: '%' },
  ];
  if (tg === 'd' || tg === 'a') specs.push({ id: 'rn', title: 'Естественная ставка', sym: 'r^n_t', irfUnit: pp, lvlUnit: '%' });
  if (tg === 'u') specs.push({ id: 'u', title: 'Шок издержек', sym: 'u_t', irfUnit: pp, lvlUnit: 'п.п.' });
  if (tg === 'v') specs.push({ id: 'v', title: 'Монетарный шок', sym: 'v_t', irfUnit: pp, lvlUnit: 'п.п.' });
  if (tg === 'a') specs.push(
    { id: 'a', title: 'Технология', sym: 'a_t', irfUnit: '$\\Delta$(%) от s.s.', lvlUnit: '%' },
    { id: 'yn', title: 'Естественный выпуск', sym: 'y^n_t', irfUnit: '$\\Delta$(%) от s.s.', lvlUnit: '%' },
    { id: 'y', title: 'Выпуск', sym: 'y_t', irfUnit: '$\\Delta$(%) от s.s.', lvlUnit: '%' });
  return specs.map((c) => ({ ...c, effAvailable: false }));
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

export function formulas(st) {
  const C = coefs(st);
  const rat = st.expectations === 'rational';
  const Ex = rat ? '\\mathbb E_t' : 'E^*_t';
  const fs = { problem: [], system: [], shock: [], ss: [] };
  fs.problemTitle = 'Модель';
  fs.systemTitle = 'Уравнения динамики';
  fs.ssTitle = 'Стационарное состояние';

  // ── 1. постановка
  fs.problem.push({ agent: 'Домохозяйства', items: [
    '\\max_{C_t,\\,N_t,\\,\\frac{M_t}{P_t},\\,B_t}\\ \\mathbb E_0\\Big\\{\\sum_{t=0}^{\\infty}\\beta^t u\\Big(C_t,N_t,\\dfrac{M_t}{P_t}\\Big)\\Big\\}',
    '\\text{s.t.}\\ \\int_0^1 P_{it}C_{it}\\,di+M_t+Q_tB_t\\le M_{t-1}+B_{t-1}+W_tN_t+D_t',
    'u\\Big(C_t,N_t,\\dfrac{M_t}{P_t}\\Big)=\\begin{cases}\\dfrac{C_t^{1-\\sigma}-1}{1-\\sigma}-\\dfrac{N_t^{1+\\varphi}}{1+\\varphi}+\\dfrac{\\left(M_t/P_t\\right)^{1-\\nu}-1}{1-\\nu}, & \\sigma\\ne1\\\\[8pt] \\ln C_t-\\dfrac{N_t^{1+\\varphi}}{1+\\varphi}+\\dfrac{\\left(M_t/P_t\\right)^{1-\\nu}}{1-\\nu}, & \\sigma=1\\end{cases}',
  ] });
  fs.problem.push({ agent: 'Фирмы', items: [
    'Y_{it}=A_tN_{it}^{1-\\alpha},\\qquad \\Pr\\{\\text{цена не пересматривается}\\}=\\theta',
    '\\max_{P_t^*}\\ \\sum_{k=0}^{\\infty}\\theta^k\\,\\mathbb E_t\\Big\\{\\Lambda_{t,t+k}\\big(P_t^*Y_{i,t+k|t}-TC_{i,t+k|t}(Y_{i,t+k|t})\\big)\\Big\\}',
    '\\text{s.t.}\\ Y_{i,t+k|t}=\\Big(\\dfrac{P_t^*}{P_{t+k}}\\Big)^{-\\varepsilon}C_{t+k}',
  ] });
  fs.problem.push({ agent: 'Центральный банк', items: [
    'i_t=\\rho+\\phi_\\pi\\pi_t+\\phi_y\\,\\tilde y_t+v_t',
  ] });
  const expItems = {
    naive: ['E^*_t\\pi_{t+1}=0,\\qquad E^*_t\\tilde y_{t+1}=0'],
    adaptive: [
      'E^*_t\\pi_{t+1}=E^*_{t-1}\\pi_t+\\gamma\\,\\big(\\pi_{t-1}-E^*_{t-1}\\pi_t\\big)',
      'E^*_t\\tilde y_{t+1}=E^*_{t-1}\\tilde y_t+\\gamma\\,\\big(\\tilde y_{t-1}-E^*_{t-1}\\tilde y_t\\big)',
    ],
    rational: ['\\mathbb E_t\\pi_{t+1},\\ \\mathbb E_t\\tilde y_{t+1}\\ \\text{— рациональные ожидания}'],
  }[st.expectations];
  fs.problem.push({ agent: 'Ожидания', items: expItems });

  // ── 2. уравнения динамики
  const s = st.sigma, b = st.beta;
  fs.system.push({ label: 'Dynamic IS',
    tex: `\\tilde y_t=${Ex}\\tilde y_{t+1}-\\dfrac{1}{\\sigma}\\big(i_t-${Ex}\\pi_{t+1}-r^n_t\\big)`,
    num: `\\tilde y_t=${Ex}\\tilde y_{t+1}-${n4(1 / s)}\\big(i_t-${Ex}\\pi_{t+1}-r^n_t\\big)` });
  fs.system.push({ label: 'Кривая Филлипса',
    tex: `\\pi_t=\\beta\\,${Ex}\\pi_{t+1}+\\kappa\\,\\tilde y_t+u_t`,
    num: `\\pi_t=${n4(b)}\\,${Ex}\\pi_{t+1}+${n4(C.kappa)}\\,\\tilde y_t+u_t` });
  fs.system.push({ label: 'Наклон кривой Филлипса',
    tex: '\\kappa=\\lambda\\Big(\\sigma+\\dfrac{\\varphi+\\alpha}{1-\\alpha}\\Big),\\qquad \\lambda=\\dfrac{(1-\\theta)(1-\\beta\\theta)}{\\theta}\\cdot\\dfrac{1-\\alpha}{1-\\alpha+\\alpha\\varepsilon}',
    num: `\\kappa=${n4(C.kappa)},\\qquad \\lambda=${n4(C.lambda)}` });
  fs.system.push({ label: 'Правило ДКП (MPR)',
    tex: 'i_t=\\rho+\\phi_\\pi\\pi_t+\\phi_y\\,\\tilde y_t+v_t',
    num: `i_t=${n4(C.rho)}+${n4(st.phiPi)}\\,\\pi_t+${n4(st.phiY)}\\,\\tilde y_t+v_t` });
  fs.system.push({ label: 'Реальная ставка',
    tex: `r_t=i_t-${Ex}\\pi_{t+1}` });
  fs.system.push({ label: 'Естественная ставка',
    tex: `r^n_t=\\rho+\\sigma\\psi_{ya}\\big(${Ex}a_{t+1}-a_t\\big)+d_t,\\qquad \\rho=-\\ln\\beta`,
    num: `r^n_t=${n4(C.rho)}+${n4(s * C.psi)}\\big(${Ex}a_{t+1}-a_t\\big)+d_t,\\qquad \\rho=${n4(C.rho)}\\%` });
  fs.system.push({ label: 'Выпуск',
    tex: 'y_t=y^n_t+\\tilde y_t,\\qquad y^n_t=\\psi_{ya}\\,a_t,\\qquad \\psi_{ya}=\\dfrac{1+\\varphi}{\\sigma(1-\\alpha)+\\varphi+\\alpha}',
    num: `\\psi_{ya}=${n4(C.psi)}` });
  if (st.expectations === 'naive')
    fs.system.push({ label: 'Ожидания', tex: 'E^*_t\\pi_{t+1}=0,\\qquad E^*_t\\tilde y_{t+1}=0' });
  else if (st.expectations === 'adaptive')
    fs.system.push(
      { label: 'Ожидания инфляции', tex: 'E^*_t\\pi_{t+1}=E^*_{t-1}\\pi_t+\\gamma\\,\\big(\\pi_{t-1}-E^*_{t-1}\\pi_t\\big)', num: `\\gamma=${n4(st.gamma)}` },
      { label: 'Ожидания разрыва выпуска', tex: 'E^*_t\\tilde y_{t+1}=E^*_{t-1}\\tilde y_t+\\gamma\\,\\big(\\tilde y_{t-1}-E^*_{t-1}\\tilde y_t\\big)' });

  // ── шок
  const tg = st.shockTarget;
  const temp = st.shockPersistence === 'temporary';
  const prf = temp ? '\\rho_s^{\\,t-\\hat t}\\,\\text{𝟙}\\{t\\ge\\hat t\\}' : '\\text{𝟙}\\{t\\ge\\hat t\\}';
  const sym = { d: 'd', u: 'u', v: 'v', a: 'a' }[tg];
  let shockTex, shockNum;
  { shockTex = `${sym}_t=\\Delta ${sym}\\cdot ${prf}`; shockNum = `\\Delta ${sym}=${n4(st.shockSize)}`; }
  shockNum += `,\\qquad \\hat t=${st.tHat}`;
  if (rat && st.shockTiming === 'expected') shockNum += `,\\qquad t_0=${st.t0}`;
  if (temp) shockNum += `,\\qquad \\rho_s=${n4(st.rhoS)}`;
  fs.shock.push({ tex: shockTex, num: shockNum });
  fs.flatNote = 'Шок не выводит экономику из стационара при текущих параметрах.';

  // ── 3. стационар
  fs.ss = [
    { tex: '\\pi=0,\\qquad \\tilde y=0' },
    { tex: 'i=r=\\rho=-\\ln\\beta', num: `i=r=${n4(C.rho)}` },
    { tex: `${Ex}\\pi_{t+1}=0` },
  ];
  if (st.expectations !== 'naive') {
    fs.ss.push({ tex: '\\kappa(\\phi_\\pi-1)+(1-\\beta)\\,\\phi_y>0', num: `${n4(C.det)}\\ ${C.det > 0 ? '>' : '\\le'}\\ 0` });
  }
  fs.ssNote = (changed) => (changed ? 'Перманентный шок сдвигает стационар' : 'Шок не меняет стационар');
  return fs;
}

export function steadyTable(st, res) {
  const Ex = st.expectations === 'rational' ? '\\mathbb E\\pi' : 'E^*\\pi';
  const rows = [
    { sym: '\\pi', name: 'инфляция', key: 'pi', pct: true },
    { sym: '\\tilde y', name: 'разрыв выпуска', key: 'x', pct: true },
    { sym: 'i', name: 'номинальная ставка', key: 'i', pct: true },
    { sym: 'r', name: 'реальная ставка', key: 'r', pct: true },
    { sym: Ex, name: 'инфляционные ожидания', key: 'epi', pct: true },
    { sym: 'r^n', name: 'естественная ставка', key: 'rn', pct: true },
  ];
  const v = (ss, r) => (r.pct ? `${fmt(ss[r.key], 3)}%` : fmt(ss[r.key], 3));
  const out = rows.map((r) => ({ ...r, before: v(res.ss0, r), after: v(res.ssF, r) }));
  out.push({ sym: '\\kappa', name: 'наклон кривой Филлипса', before: fmt(res.C.kappa, 4), after: fmt(res.C.kappa, 4) });
  if (st.expectations !== 'naive') {
    const ok = res.C.det > 0 ? 'выполнен' : 'нарушен';
    out.push({ sym: '\\kappa(\\phi_\\pi-1)+(1-\\beta)\\phi_y>0', name: 'принцип Тейлора', before: ok, after: ok });
  }
  return out;
}

// ───────────── Дополнительные блоки: основная диаграмма и сходимость ─────────────

const DC = { pc0: '#3d8acb', pc1: '#86c2f0', ad0: '#7c62d8', ad1: '#c2b2f7', ss: '#7d7ca5', path: '#23214a' };

export function extraBlocks(st, res) {
  const out = [];
  if (st.expectations === 'adaptive') out.push({ ...convergenceBlock(st), beforeSS: true });
  out.push(diagramBlock(st, res));
  return out;
}

// линии диаграммы при заданных ожиданиях и экзогенных величинах периода
function lines(st, C, E, epi, ex, rn) {
  const { sigma: s, beta: b, phiPi: fp, phiY: fy } = st;
  return {
    pc: (x) => E.piStar + b * (epi - E.piStar) + C.kappa * x + E.u,
    ad: (x) => fp < 1e-9 ? NaN : E.piStar + (s * ex - C.rho - E.piStar - E.v + epi + rn - (s + fy) * x) / fp,
    is: (x) => rn + s * (ex - x),
    mpr: (x) => C.rho + E.piStar + fp * (b * (epi - E.piStar) + C.kappa * x + E.u) + fy * x + E.v - epi,
  };
}

function diagramBlock(st, res) {
  const { sim, C, ss0 } = res;
  const j1 = Math.min(st.tHat, sim.pi.length - 1);
  const jS = res.marks.t0 != null ? Math.min(res.marks.t0, j1) : j1;
  const L0 = lines(st, C, exo(st, 0, 0), ss0.epi, 0, ss0.rn);
  const L1 = lines(st, C, sim.E[j1], sim.epi[j1], sim.ex[j1], sim.rn[j1]);
  const pathPi = [], pathR = [];
  const xs = [0];
  for (let j = jS; j <= st.horizon && j < sim.pi.length; j++) {
    pathPi.push([sim.x[j], sim.pi[j]]); pathR.push([sim.x[j], sim.r[j]]); xs.push(sim.x[j]);
  }
  let lo = Math.min(...xs), hi = Math.max(...xs);
  const pad = Math.max(0.3 * (hi - lo), 0.5);
  lo -= pad; hi += pad;
  const grid = (fn) => { const p = []; for (let i = 0; i <= 120; i++) { const x = lo + ((hi - lo) * i) / 120; p.push([x, fn(x)]); } return p; };
  const same = (f, g) => [lo, hi].every((x) => Math.abs(f(x) - g(x)) < 1e-9);

  const panel = (title, A, B, nameA, nameB, path, yLabel) => {
    const series = [
      { label: `${nameA}`, data: grid(L0[A]), color: DC.pc0, width: 2.4, curveLabel: nameA },
      ...(same(L0[A], L1[A]) ? [] : [{ label: `${nameA}′ (в момент шока)`, data: grid(L1[A]), color: DC.pc1, width: 2.4, dash: [7, 4], curveLabel: `${nameA}′` }]),
      { label: `${nameB}`, data: grid(L0[B]), color: DC.ad0, width: 2.2, curveLabel: nameB },
      ...(same(L0[B], L1[B]) ? [] : [{ label: `${nameB}′ (в момент шока)`, data: grid(L1[B]), color: DC.ad1, width: 2.2, dash: [7, 4], curveLabel: `${nameB}′` }]),
      { label: 'путь экономики', data: path, color: DC.path, points: true, pointRadius: 3 },
    ];
    const pts = path.map((p) => p[1]).concat([L0[A](0)]);
    const ylo = Math.min(...pts), yhi = Math.max(...pts), yp = Math.max(0.35 * (yhi - ylo), 0.5);
    return { title, sym: yLabel, series: series.filter((x) => x.data.every((p) => Number.isFinite(p[1]))),
      opts: { xLabel: 'ỹ', xmin: lo, xmax: hi, ymin: ylo - yp, ymax: yhi + yp, vlines: [{ x: 0, color: DC.ss, label: 'ỹ = 0' }] } };
  };
  const p1 = panel('Плоскость', 'pc', 'ad', 'PC', 'AD', pathPi, '(\\tilde y,\\ \\pi)');
  const p2 = panel('Плоскость', 'is', 'mpr', 'DIS', 'MPR', pathR, '(\\tilde y,\\ r)');
  const legend = [
    { label: 'PC, DIS — до шока', color: DC.pc0 }, { label: 'AD (DIS + MPR), MPR (с учётом PC) — до шока', color: DC.ad0 },
    { label: 'PC′, DIS′ — в момент шока', color: DC.pc1, dash: true },
    { label: 'AD′, MPR′ — в момент шока', color: DC.ad1, dash: true },
    { label: 'путь экономики (по периодам)', color: DC.path, point: true },
  ];
  return { title: 'Основная диаграмма модели', diagram: true, legend, charts: [p1, p2] };
}

function convergenceBlock(st) {
  const N = st.horizon;
  const C = coefs(st);
  const ss = steady(st, exo(st, 0, 0), C);
  const sim = simulate({ ...st, shockSize: 0 }, N, 0, st.pie0);
  const lbl = `E*₀π₁ = ${fmt(st.pie0, 2)}%`;
  const mk = (title, sym, key, hl) => ({
    title, sym, unit: '%',
    series: [{ label: lbl, data: sim ? sim[key].map((v, j) => [j, v]) : [], color: '#3d8acb', width: 2.6 }],
    opts: { xLabel: 't', xmin: 0, xmax: N, discrete: true, hlines: [{ y: hl, color: '#7d7ca5' }] },
  });
  return {
    title: 'Сходимость к стационару',
    legend: [{ label: `траектория из ${lbl}`, color: '#3d8acb' }, { label: 'стационарное значение', color: '#7d7ca5', dash: true }],
    charts: [
      mk('Инфляция', '\\pi_t', 'pi', ss.pi),
      mk('Разрыв выпуска', '\\tilde y_t', 'x', 0),
      mk('Номинальная ставка', 'i_t', 'i', ss.i),
      mk('Инфляционные ожидания', 'E^*_t\\pi_{t+1}', 'epi', ss.epi),
    ],
  };
}
