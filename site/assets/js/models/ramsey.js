// Модель Рамсея (Ramsey–Cass–Koopmans) с ростом населения: настройки, решатель, формулы.
// Обозначения следуют материалам курса: b_t — активы на душу, r_t — ставка процента,
// w_t — зарплата, k_t — капитал на работника, f(k) = k^α, L_t — население (= занятые),
// L_{t+1} = (1+n)L_t, E_t — эффективность труда, тильда — величины на эффективного работника.
// Законы движения записаны в точной форме: (1+n)(1+g)k̃_{t+1} = (1−δ)k̃_t + f(k̃_t) − c̃_t.
// В подписях интерфейса фрагменты между $…$ рендерятся KaTeX.

import { newtonTridiagonal } from '../solver.js';

// ───────────────────────────── Настройки ─────────────────────────────

const MIT_NOTE = 'Только неожиданный перманентный: при смене функции полезности во времени сравнение $u\'(c_t)$ и $u\'(c_{t+1})$ зависело бы от единиц измерения $c$';

const SHOCK_TARGETS = {
  tfp:   { label: 'Уровень технологии $E_t$', kind: 'param', group: 'state', unit: '%', def: 10, step: 1, variant: 'tp' },
  k:     { label: 'Капитал $k_t$', kind: 'state', unit: '%', def: -20, step: 1 },
  n:     { label: 'Темп роста населения $n$', kind: 'param', unit: 'Δ', def: 0.01, step: 0.005 },
  beta:  { label: 'Дисконт-фактор $\\beta$', kind: 'param', unit: 'Δ', def: 0.01, step: 0.005, time: 'discrete' },
  rho:   { label: 'Ставка дисконтирования $\\rho$', kind: 'param', unit: 'Δ', def: -0.01, step: 0.005, time: 'continuous' },
  sigma: { label: 'Неприятие риска $\\sigma$', kind: 'param', unit: 'Δ', def: 1, step: 0.25, utility: 'crra', onlyMIT: true,
           note: MIT_NOTE },
  theta: { label: 'Неприятие риска $\\theta$', kind: 'param', unit: 'Δ', def: 0.5, step: 0.1, utility: 'cara', onlyMIT: true,
           note: MIT_NOTE },
  delta: { label: 'Норма амортизации $\\delta$', kind: 'param', unit: 'Δ', def: 0.02, step: 0.005 },
};

export const meta = {
  id: 'ramsey',
  title: 'Модель Рамсея',
  subtitle: 'Ramsey–Cass–Koopmans model',
  ready: true,
};

export const defaults = {
  time: 'discrete', version: 'decentralized', variant: 'base', objective: 'mill',
  utility: 'crra', production: 'cd',
  alpha: 0.3, beta: 0.96, rho: 0.04, delta: 0.1, sigma: 2, theta: 1, g: 0.02, n: 0.01,
  shockTarget: 'k', shockSize: -20, shockTiming: 'unexpected', tHat: 15, t0: 5,
  shockPersistence: 'permanent', rhoS: 0.8,
  horizon: 60,
};

function shockTargetsFor(s) {
  return Object.entries(SHOCK_TARGETS)
    .filter(([, d]) => (!d.time || d.time === s.time) && (!d.utility || d.utility === s.utility)
      && (!d.variant || d.variant === s.variant))
    .sort(([, a], [, b]) => ((a.group ?? a.kind) === 'state' ? 0 : 1) - ((b.group ?? b.kind) === 'state' ? 0 : 1))
    .map(([v, d]) => ({ v, l: d.label }));
}

// Описание панели настроек (рендерится общим кодом UI)
export const controls = [
  { section: 'Модель' },
  { id: 'time', label: 'Время', type: 'segmented',
    options: [{ v: 'discrete', l: 'Дискретное' }, { v: 'continuous', l: 'Непрерывное' }] },
  { id: 'version', label: 'Вид модели', type: 'segmented',
    options: [{ v: 'decentralized', l: 'Децентрализованная' }, { v: 'centralized', l: 'Централизованная' }] },
  { id: 'variant', label: 'Вариация', type: 'select',
    options: [
      { v: 'base', l: 'Без технологического прогресса' },
      { v: 'tp', l: 'С трудосберегающим ТП' },
    ] },
  { id: 'objective', label: 'Целевая функция', type: 'segmented',
    options: (s) => (s.time === 'discrete'
      ? [{ v: 'mill', l: '$\\sum\\beta^t u(c_t)$' }, { v: 'bentham', l: '$\\sum\\beta^t L_t\\, u(c_t)$' }]
      : [{ v: 'mill', l: '$\\int e^{-\\rho t}u(c)\\,dt$' }, { v: 'bentham', l: '$\\int e^{-\\rho t}L\\,u(c)\\,dt$' }]),
    hint: (s) => (s.objective === 'mill'
      ? 'Милль: максимизируется полезность на душу населения'
      : 'Бентам: максимизируется сумма полезностей всех членов домохозяйства') },

  { section: 'Функции' },
  { id: 'utility', label: 'Полезность домохозяйств', type: 'select',
    options: [
      { v: 'crra', l: 'CRRA' },
      { v: 'log', l: 'Логарифмическая' },
      { v: 'cara', l: 'CARA' },
    ] },
  { id: 'production', label: 'Производственная функция', type: 'select',
    options: [{ v: 'cd', l: 'Кобба–Дугласа' }] },

  { section: 'Параметры' },
  { id: 'alpha', label: '$\\alpha$ — доля капитала', type: 'number', min: 0.05, max: 0.95, step: 0.01 },
  { id: 'beta', label: '$\\beta$ — дисконт-фактор', type: 'number', min: 0.5, max: 0.999, step: 0.005,
    show: (s) => s.time === 'discrete' },
  { id: 'rho', label: '$\\rho$ — ставка дисконтирования', type: 'number', min: 0.001, max: 0.5, step: 0.005,
    show: (s) => s.time === 'continuous' },
  { id: 'delta', label: '$\\delta$ — амортизация', type: 'number', min: 0, max: 0.5, step: 0.01 },
  { id: 'n', label: '$n$ — темп роста населения', type: 'number', min: -0.05, max: 0.1, step: 0.005 },
  { id: 'sigma', label: '$\\sigma$ — неприятие риска', type: 'number', min: 0.1, max: 10, step: 0.1,
    show: (s) => s.utility === 'crra' },
  { id: 'theta', label: '$\\theta$ — неприятие риска', type: 'number', min: 0.05, max: 10, step: 0.05,
    show: (s) => s.utility === 'cara' },
  { id: 'g', label: '$g$ — темп роста $E_t$', type: 'number', min: 0, max: 0.1, step: 0.005,
    show: (s) => s.variant === 'tp' },

  { section: 'Шок' },
  { id: 'shockTarget', label: 'На что шок', type: 'select', rich: true, options: shockTargetsFor,
    groupLabel: (v) => ((SHOCK_TARGETS[v]?.group ?? SHOCK_TARGETS[v]?.kind) === 'state' ? 'state-переменные' : 'параметры') },
  { id: 'shockSize', label: (s) => (SHOCK_TARGETS[s.shockTarget]?.unit === '%' ? 'Величина, $\\Delta$(%)' : 'Величина, $\\Delta$(уровни)'),
    type: 'number', step: (s) => SHOCK_TARGETS[s.shockTarget]?.step ?? 0.01,
    hint: (s) => SHOCK_TARGETS[s.shockTarget]?.note },
  { id: 'shockTiming', label: 'Ожидаемость', type: 'segmented',
    options: [{ v: 'unexpected', l: 'Неожиданный (MIT)' }, { v: 'expected', l: 'Ожидаемый' }],
    show: (s) => !SHOCK_TARGETS[s.shockTarget]?.onlyMIT },
  { id: 'tHat', label: (s) => 'Момент шока $\\hat t$',
    type: 'number', min: 0, max: 100, step: 1 },
  { id: 't0', label: 'Объявление $t_0$', type: 'number', min: 0, max: 100, step: 1,
    show: (s) => s.shockTiming === 'expected', hint: 'Должно быть меньше $\\hat t$' },
  { id: 'shockPersistence', label: 'Длительность', type: 'segmented',
    options: [{ v: 'permanent', l: 'Перманентный' }, { v: 'temporary', l: 'Временный' }],
    show: (s) => SHOCK_TARGETS[s.shockTarget]?.kind !== 'state' && !SHOCK_TARGETS[s.shockTarget]?.onlyMIT },
  { id: 'rhoS', label: 'Персистентность $\\rho_s$', type: 'number', slider: true, min: 0, max: 0.99, step: 0.01,
    show: (s) => SHOCK_TARGETS[s.shockTarget]?.kind !== 'state' && !SHOCK_TARGETS[s.shockTarget]?.onlyMIT && s.shockPersistence === 'temporary',
    hint: 'Отклонение затухает как $\\rho_s^{\\,t-\\hat t}$' },

  { section: 'Отображение' },
  { id: 'horizon', label: 'Горизонт графиков', type: 'number', min: 20, max: 200, step: 5 },
];

// Согласование настроек при изменении (вызывается UI после каждого изменения)
export function normalize(s, changed) {
  if (!s.objective) s.objective = 'mill';
  const allowed = shockTargetsFor(s).map((o) => o.v);
  if (!allowed.includes(s.shockTarget)) {
    // соответствие β ↔ ρ при смене времени
    if (s.shockTarget === 'beta' && allowed.includes('rho')) s.shockTarget = 'rho';
    else if (s.shockTarget === 'rho' && allowed.includes('beta')) s.shockTarget = 'beta';
    else s.shockTarget = 'k';
    changed = 'shockTarget';
  }
  if (changed === 'shockTarget') s.shockSize = SHOCK_TARGETS[s.shockTarget].def;
  if (SHOCK_TARGETS[s.shockTarget].onlyMIT) { s.shockTiming = 'unexpected'; s.shockPersistence = 'permanent'; }
  if (changed === 'time') {
    if (s.time === 'continuous') s.rho = +(-Math.log(s.beta)).toFixed(4);
    else s.beta = +Math.exp(-s.rho).toFixed(4);
  }
  return s;
}

// ───────────────────────────── Решатель ─────────────────────────────

function shockProfile(s, t) {
  if (t < s.tHat - 1e-9) return 0;
  if (s.shockPersistence === 'permanent') return 1;
  return Math.pow(s.rhoS, t - s.tHat);
}

function buildPaths(s, N, h, scale) {
  const P = {
    beta: new Float64Array(N + 2), rho: new Float64Array(N + 2), delta: new Float64Array(N + 2),
    sigma: new Float64Array(N + 2), theta: new Float64Array(N + 2), Z: new Float64Array(N + 2),
    n: new Float64Array(N + 2), D: new Float64Array(N + 2),
  };
  const target = s.shockTarget;
  const size = s.shockSize * scale;
  const jHat = Math.round(s.tHat / h);
  for (let j = 0; j <= N + 1; j++) {
    const t = j * h;
    const prof = SHOCK_TARGETS[target].kind === 'state' ? 0 : shockProfile(s, t);
    P.beta[j] = s.beta + (target === 'beta' ? size * prof : 0);
    P.rho[j] = s.rho + (target === 'rho' ? size * prof : 0);
    P.delta[j] = s.delta + (target === 'delta' ? size * prof : 0);
    P.sigma[j] = s.utility === 'log' ? 1 : s.sigma + (target === 'sigma' ? size * prof : 0);
    P.theta[j] = s.theta + (target === 'theta' ? size * prof : 0);
    P.n[j] = s.n + (target === 'n' ? size * prof : 0);
    P.Z[j] = 1 + (target === 'tfp' ? (size / 100) * prof : 0);
    P.D[j] = target === 'k' && j === jHat ? 1 + size / 100 : 1;
  }
  return P;
}

// Стационар в единицах «на работника, детрендированные по (1+g)^t» для сетки с шагом h
// (h = 1 — дискретное время; exact = true — точные формулы непрерывного времени).
function steady(s, P, j, h, g, exact = false) {
  const a = s.alpha, d = P.delta[j], Z = P.Z[j], n = P.n[j];
  const mill = s.objective !== 'bentham';
  const sig = s.utility === 'cara' ? 0 : P.sigma[j];
  let r, dep; // dep — инвестиции, нужные для поддержания k̃ (на единицу k̃)
  if (s.time === 'discrete') {
    r = (Math.pow(1 + g, sig) * (mill ? 1 + n : 1)) / P.beta[j] - 1;
    dep = (1 + n) * (1 + g) - 1 + d;
  } else if (exact) {
    r = P.rho[j] + sig * g + (mill ? n : 0);
    dep = n + g + d;
  } else {
    r = (Math.exp(P.rho[j] * h + sig * Math.log(1 + g * h) + (mill ? Math.log(1 + n * h) : 0)) - 1) / h;
    dep = ((1 + n * h) * (1 + g * h) - 1) / h + d;
  }
  const k = Z * Math.pow(a / (r + d), 1 / (1 - a));
  const y = Math.pow(k, a) * Math.pow(Z, 1 - a);
  const c = y - dep * k;
  return { r, k, y, c, i: dep * k, w: (1 - a) * y, s: (dep * k) / y, dep };
}

function validate(s) {
  const errors = [];
  const g = s.variant === 'tp' ? s.g : 0;
  const mill = s.objective !== 'bentham';
  if (s.utility === 'cara' && s.variant === 'tp' && s.g > 0)
    errors.push('CARA несовместима со сбалансированным ростом: при $g > 0$ нет стационара в эффективных единицах. Выберите CRRA, логарифмическую полезность или вариант без ТП.');
  if (s.time === 'discrete' && !(s.beta > 0 && s.beta < 1)) errors.push('$\\beta$ должен лежать в $(0,1)$.');
  if (s.time === 'continuous' && !(s.rho > 0)) errors.push('$\\rho$ должна быть положительной.');
  if (!(s.alpha > 0 && s.alpha < 1)) errors.push('$\\alpha$ должна лежать в $(0,1)$.');
  if (!(s.n > -0.5)) errors.push('$n$ должен быть больше $-0.5$.');
  if (s.utility === 'crra' && !(s.sigma > 0)) errors.push('$\\sigma$ должна быть положительной.');
  if (s.utility === 'cara' && !(s.theta > 0)) errors.push('$\\theta$ должна быть положительной.');
  const sig = s.utility === 'log' ? 1 : s.utility === 'cara' ? 1 : s.sigma;
  if (s.time === 'discrete') {
    const lhs = s.beta * (mill ? 1 : 1 + s.n) * Math.pow(1 + g, 1 - sig);
    if (lhs >= 1) errors.push(mill
      ? 'Нарушено условие ограниченности полезности: нужно $\\beta(1+g)^{1-\\sigma} < 1$.'
      : 'Нарушено условие ограниченности полезности: нужно $\\beta(1+n)(1+g)^{1-\\sigma} < 1$.');
  } else {
    const lhs = s.rho - (mill ? 0 : s.n) - (1 - sig) * g;
    if (lhs <= 0) errors.push(mill
      ? 'Нарушено условие ограниченности полезности: нужно $\\rho > (1-\\sigma)g$.'
      : 'Нарушено условие ограниченности полезности: нужно $\\rho - n > (1-\\sigma)g$.');
  }
  if (SHOCK_TARGETS[s.shockTarget]?.onlyMIT && (s.shockTiming === 'expected' || s.shockPersistence === 'temporary'))
    errors.push('Шок параметра неприятия риска допускается только неожиданным и перманентным.');
  if (s.shockTiming === 'expected' && !(s.t0 < s.tHat))
    errors.push('Для ожидаемого шока момент объявления $t_0$ должен быть раньше $\\hat t$.');
  if (s.shockTarget === 'tfp' && s.variant !== 'tp') errors.push('Шок технологии доступен только в вариации с технологическим прогрессом.');
  if (s.shockTarget === 'k' && s.shockSize <= -100) errors.push('Капитал не может упасть больше чем на 100%.');
  if (s.shockTarget === 'tfp' && s.shockSize <= -100) errors.push('Уровень $E_t$ не может упасть больше чем на 100%.');
  return errors;
}

function solvePath(s, h, N, scale, guess) {
  const g = s.variant === 'tp' ? s.g : 0;
  const a = s.alpha;
  const mill = s.objective !== 'bentham';
  const P = buildPaths(s, N, h, scale);
  const base = buildPaths({ ...s, shockSize: 0 }, N, h, 0);
  const ss0 = steady(s, base, 0, h, g);
  const ssF = steady(s, P, N + 1, h, g);
  if (!(ssF.c > 0) || !(ssF.k > 0)) return { ok: false, reason: 'Новый стационар не существует при этих параметрах.' };
  if (!(ssF.r > ssF.dep - P.delta[N + 1])) return { ok: false, reason: 'После шока нарушается условие трансверсальности: ставка процента не превышает темп роста экономики.' };

  const jHat = Math.round(s.tHat / h);
  const expected = s.shockTiming === 'expected' && s.t0 < s.tHat;
  const jStart = Math.min(expected ? Math.round(s.t0 / h) : jHat, N - 5);
  const lnG1 = Math.log(1 + g * h);
  const util = s.utility;

  const k = new Float64Array(N + 2);
  for (let j = 0; j <= jStart; j++) k[j] = ss0.k;
  k[jStart] = ss0.k * (expected ? 1 : P.D[jStart]);
  k[N + 1] = ssF.k;
  const nUnk = N - jStart;

  const c = new Float64Array(N + 1);
  const lnMU = (cj, j) => {
    const lnLevel = Math.log(cj) + j * lnG1;
    if (util === 'crra') return -P.sigma[j] * lnLevel;
    if (util === 'log') return -lnLevel;
    return -P.theta[j] * cj * Math.exp(j * lnG1);
  };
  const lnB = (j) => (s.time === 'discrete' ? Math.log(P.beta[j]) : -P.rho[j] * h);
  const gam = (j) => (1 + g * h) * (1 + P.n[j] * h); // (1+n)(1+g): рост числа эффективных работников

  const fill = (x) => {
    for (let i = 0; i < nUnk; i++) k[jStart + 1 + i] = x[i];
    for (let j = jStart; j <= N; j++) {
      if (!(k[j] > 0)) return false;
      const y = Math.pow(k[j], a) * Math.pow(P.Z[j], 1 - a);
      c[j] = ((1 - P.delta[j] * h) * k[j] + h * y - gam(j) * k[j + 1] / P.D[j + 1]) / h;
      if (!(c[j] > 0)) return false;
    }
    return true;
  };

  // Эйлер: u'(c_t) = B_t·(1+r_{t+1})·[1/(1+n_t) у Милля]·u'(c_{t+1})
  const residual = (x) => {
    if (!fill(x)) return null;
    const F = new Float64Array(nUnk);
    for (let i = 0; i < nUnk; i++) {
      const j = jStart + i;
      const r1 = a * Math.pow(k[j + 1] / P.Z[j + 1], a - 1) - P.delta[j + 1];
      const gross = P.D[j + 1] * (1 + h * r1);
      if (!(gross > 0)) return null;
      const popAdj = mill ? Math.log(1 + P.n[j] * h) : 0;
      F[i] = lnMU(c[j], j) - lnB(j) - Math.log(gross) + popAdj - lnMU(c[j + 1], j + 1);
    }
    return F;
  };

  let x0;
  if (guess && guess.length === nUnk) x0 = guess;
  else {
    x0 = new Float64Array(nUnk);
    const k0 = k[jStart];
    const Dhat = jHat > jStart ? P.D[jHat] : 1; // ожидаемый скачок капитала: закладываем его в начальное приближение
    for (let i = 0; i < nUnk; i++) {
      const j = jStart + 1 + i, t = (i + 1) * h;
      x0[i] = ssF.k + (k0 - ssF.k) * Math.exp(-0.08 * t);
      if (Dhat !== 1 && j >= jHat) x0[i] += (Dhat - 1) * ss0.k * Math.exp(-0.08 * (j - jHat) * h);
    }
  }
  const res = newtonTridiagonal(residual, x0, { tol: 1e-11, maxIter: 80 });
  if (!res.ok) return { ok: false, x: res.x, reason: 'Численный метод не сошёлся.' };
  fill(res.x);
  for (let j = 0; j < jStart; j++) c[j] = ss0.c;
  return { ok: true, x: res.x, k: Float64Array.from(k), c: Float64Array.from(c), P, base, ss0, ssF, g, jStart, jHat, expected };
}

export function solve(s) {
  const errors = validate(s);
  if (errors.length) return { ok: false, errors };
  // dt и Tsolve — служебные параметры для проверок точности (в интерфейсе не используются)
  const h = s.time === 'discrete' ? 1 : (s.dt || 0.02);
  const Tsolve = Math.max(300, s.horizon + 250, s.tHat + 250, s.Tsolve || 0);
  const N = Math.round(Tsolve / h);

  let sol = solvePath(s, h, N, 1);
  if (!sol.ok && !sol.reason?.startsWith('После шока') && !sol.reason?.startsWith('Новый')) {
    // продолжение по величине шока (гомотопия)
    let guess = null;
    for (const sc of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1]) {
      sol = solvePath(s, h, N, sc, guess);
      if (!sol.ok) break;
      guess = sol.x;
    }
  }
  if (!sol.ok) return { ok: false, errors: [sol.reason || 'Не удалось найти решение.'] };

  const { k, c, P, base, ss0, g } = sol;
  const a = s.alpha;
  const Np = Math.round(s.horizon / h);
  const lnG1 = Math.log(1 + g * h);
  const t = [], series = { c: [], k: [], y: [], i: [], r: [], w: [], s: [], E: [], L: [] };
  const eff = { c: [], k: [], y: [], i: [], w: [] };
  const lvl = { c: [], k: [], y: [], i: [], w: [], r: [], s: [], E: [], L: [] };
  const baseLvl = { c: [], k: [], y: [], i: [], w: [], E: [], L: [] };
  const agg = { c: [], k: [], y: [], i: [] }, baseAgg = { c: [], k: [], y: [], i: [] };
  // население: L_0 = 1, L_{j+1} = (1 + n_j h) L_j
  const Lp = new Float64Array(Np + 1), Lb = new Float64Array(Np + 1);
  Lp[0] = 1; Lb[0] = 1;
  for (let j = 0; j < Np; j++) { Lp[j + 1] = Lp[j] * (1 + P.n[j] * h); Lb[j + 1] = Lb[j] * (1 + base.n[j] * h); }
  const stride = Math.max(1, Math.round(0.1 / h)); // на графики — точки с шагом 0.1
  for (let j = 0; j <= Np; j += stride) {
    const G = Math.exp(j * lnG1);
    const Z = P.Z[j];
    const yh = Math.pow(k[j], a) * Math.pow(Z, 1 - a);
    const ch = c[j];
    const ih = yh - ch; // валовые инвестиции (поток) на работника, детрендированные
    const wh = (1 - a) * yh;
    const r = a * Math.pow(k[j] / Z, a - 1) - P.delta[j];
    t.push(+(j * h).toFixed(6));
    const hat = { c: ch, k: k[j], y: yh, i: ih, w: wh };
    for (const v of ['c', 'k', 'y', 'i', 'w']) {
      lvl[v].push(hat[v] * G);
      eff[v].push(hat[v] / Z);
      baseLvl[v].push(ss0[v] * G);
      series[v].push(100 * (hat[v] / ss0[v] - 1));
    }
    for (const v of ['c', 'k', 'y', 'i']) { agg[v].push(hat[v] * G * Lp[j]); baseAgg[v].push(ss0[v] * G * Lb[j]); }
    series.r.push(100 * (r - ss0.r));
    series.s.push(100 * (ih / yh - ss0.s));
    lvl.r.push(100 * r);
    lvl.s.push((100 * ih) / yh);
    lvl.E.push(G * Z); baseLvl.E.push(G); series.E.push(100 * (Z - 1));
    lvl.L.push(Lp[j]); baseLvl.L.push(Lb[j]); series.L.push(100 * (Lp[j] / Lb[j] - 1));
  }
  baseLvl.r = t.map(() => 100 * ss0.r);
  baseLvl.s = t.map(() => 100 * ss0.s);
  const baseEff = {};
  for (const v of ['c', 'k', 'y', 'i', 'w']) baseEff[v] = t.map(() => ss0[v]);

  const exact0 = steady(s, base, 0, h, g, true);
  const exactF = steady(s, P, N + 1, h, g, true);
  return {
    ok: true, h: h * stride, t, irf: series, levels: lvl, eff, baseLevels: baseLvl, baseEff, agg, baseAgg,
    ss0: exact0, ssF: exactF, ZF: P.Z[N + 1],
    permanentChange: Math.abs(exactF.k - exact0.k) / exact0.k > 1e-9 || Math.abs(exactF.r - exact0.r) > 1e-12,
    marks: { tHat: s.tHat, t0: sol.expected ? s.t0 : null },
  };
}

// ───────────────────────────── Графики ─────────────────────────────

export function chartSpecs(s) {
  const cen = s.version === 'centralized';
  const tp = s.variant === 'tp';
  const D = s.time === 'discrete';
  const x = (v) => (D ? `${v}_t` : `${v}(t)`);
  const k = tp ? '\\tilde k' : 'k';
  const showL = Math.abs(s.n) > 0 || s.shockTarget === 'n';
  const specs = [
    ...(tp ? [{ id: 'E', title: 'Технология', sym: x('E'), irfUnit: '$\\Delta$(%) от тренда', noEff: true }] : []),
    ...(showL ? [{ id: 'L', title: 'Население', sym: x('L'), irfUnit: '$\\Delta$(%) от тренда', noEff: true }] : []),
    { id: 'c', title: 'Потребление', sym: x('c'), aggSym: x('C'), irfUnit: '$\\Delta$(%) от s.s.' },
    { id: 'k', title: 'Капитал', sym: x('k'), aggSym: x('K'), irfUnit: '$\\Delta$(%) от s.s.' },
    { id: 'y', title: 'Выпуск', sym: x('y'), aggSym: x('Y'), irfUnit: '$\\Delta$(%) от s.s.' },
    { id: 'i', title: 'Инвестиции', sym: x('i'), aggSym: x('I'), irfUnit: '$\\Delta$(%) от s.s.' },
    cen ? { id: 'r', title: 'Доходность капитала', sym: `\\alpha ${k}^{\\alpha-1}-\\delta`, irfUnit: '$\\Delta$(п.п.) от s.s.', lvlUnit: '%', noEff: true }
        : { id: 'r', title: 'Ставка процента', sym: x('r'), irfUnit: '$\\Delta$(п.п.) от s.s.', lvlUnit: '%', noEff: true },
    cen ? { id: 'w', title: 'Предельный продукт труда', sym: tp ? `(1-\\alpha)E${k}^{\\alpha}` : `(1-\\alpha)${k}^{\\alpha}`, irfUnit: '$\\Delta$(%) от s.s.' }
        : { id: 'w', title: 'Зарплата', sym: x('w'), irfUnit: '$\\Delta$(%) от s.s.' },
    { id: 's', title: 'Норма сбережения', sym: D ? 's_t = i_t/y_t' : 's(t) = i/y', irfUnit: '$\\Delta$(п.п.) от s.s.', lvlUnit: '%', noEff: true },
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
// «+ 0.9» / «- 0.1» для подстановки чисел
const pm = (x) => (x < 0 ? `-${n4(-x)}` : `+${n4(x)}`);

// Все формулы — уже с подставленными функциями (Кобб–Дуглас, выбранная полезность).
export function formulas(s) {
  const D = s.time === 'discrete';
  const tp = s.variant === 'tp';
  const cen = s.version === 'centralized';
  const mill = s.objective !== 'bentham';
  const ut = s.utility;
  const sig = ut === 'log' ? 1 : s.sigma;
  const g = tp ? s.g : 0;
  const a = s.alpha, d = s.delta, nn = s.n;
  const tl = (v) => (tp ? `\\tilde ${v}` : v);
  const fs = { dec: [], cen: [], system: [], shock: [], ss: [] };

  // полезность и предельная полезность от аргумента
  const U = (c) => (ut === 'crra' ? `\\dfrac{${c}^{\\,1-\\sigma}-1}{1-\\sigma}` : ut === 'log' ? `\\ln ${c}` : `-\\dfrac{1}{\\theta}\\,e^{-\\theta ${c}}`);
  const Up = (c) => (ut === 'crra' ? `${c}^{-\\sigma}` : ut === 'log' ? `\\dfrac{1}{${c}}` : `e^{-\\theta ${c}}`);
  const cT = D ? '{c_t}' : 'c(t)';
  const growthD = tp ? '(1+n)(1+g)' : '(1+n)';
  const growthC = tp ? '(n+g+\\delta)' : '(n+\\delta)';
  const popLaw = D ? 'L_{t+1}=(1+n)\\,L_t' : '\\dot L/L=n';
  const tpLaw = D ? 'E_{t+1}=(1+g)\\,E_t' : '\\dot E/E=g';
  const lawLine = tp ? `${popLaw},\\qquad ${tpLaw}` : popLaw;

  // целевая функция и дисконтирование в TVC
  const objD = mill ? `\\sum_{t=0}^{\\infty}\\beta^t\\,${U(cT)}` : `\\sum_{t=0}^{\\infty}\\beta^t L_t\\,${U(cT)}`;
  const objC = mill ? `\\int_0^{\\infty}e^{-\\rho t}\\,${U(cT)}\\,dt` : `\\int_0^{\\infty}e^{-\\rho t}L(t)\\,${U(cT)}\\,dt`;
  const tvcW = D ? (mill ? '\\beta^t' : '\\beta^t L_t') : (mill ? 'e^{-\\rho t}' : 'e^{-(\\rho-n)t}');
  // с ТП задачи записываются в единицах на эффективного работника: c = c̃·E
  const cE = D ? '(\\tilde c_tE_t)' : '\\big(\\tilde c(t)E(t)\\big)';
  const objDe = tp ? objD.replace(cT, cE) : objD;
  const objCe = tp ? objC.replace(cT, cE) : objC;
  const UpE = tp ? Up(cE) : Up(cT);

  // ── децентрализованная
  if (D) {
    fs.dec.push({ agent: 'Домохозяйства', system: true, items: [
      ...(tp ? [
        `\\max_{\\{\\tilde c_t,\\,\\tilde b_{t+1}\\}_{t=0}^{\\infty}}\\; V_0=${objDe}`,
        '\\text{s.t.}\\quad (1+n)(1+g)\\,\\tilde b_{t+1}=(1+r_t)\\,\\tilde b_t+\\tilde w_t-\\tilde c_t,\\qquad \\tilde b_0\\ \\text{задано}',
        `\\text{TVC:}\\quad \\lim_{t\\to\\infty}${tvcW}\\,${UpE}\\,E_t\\,\\tilde b_t=0`,
      ] : [
        `\\max_{\\{c_t,\\,b_{t+1}\\}_{t=0}^{\\infty}}\\; V_0=${objD}`,
        '\\text{s.t.}\\quad (1+n)\\,b_{t+1}=(1+r_t)\\,b_t+w_t-c_t,\\qquad b_0\\ \\text{задано}',
        `\\text{TVC:}\\quad \\lim_{t\\to\\infty}${tvcW}\\,${Up(cT)}\\,b_t=0`,
      ]),
    ] });
    fs.dec.push({ agent: 'Фирмы', items: [
      tp ? '\\max_{K_t,L_t}\\; \\pi_t=K_t^{\\alpha}(E_tL_t)^{1-\\alpha}-w_tL_t-(r_t+\\delta)K_t'
         : '\\max_{K_t,L_t}\\; \\pi_t=K_t^{\\alpha}L_t^{1-\\alpha}-w_tL_t-(r_t+\\delta)K_t',
    ] });
    fs.dec.push({ agent: 'Рынки (балансовые условия)', items: [
      tp ? '\\tilde b_t=\\tilde k_t\\quad\\text{(рынок капитала)}' : 'b_t=k_t\\quad\\text{(рынок капитала)}',
    ] });
    fs.dec.push({ agent: 'Экзогенные процессы', items: [lawLine] });
  } else {
    fs.dec.push({ agent: 'Домохозяйства', system: true, items: [
      ...(tp ? [
        `\\max_{\\tilde c(t)}\\; V_0=${objCe}`,
        '\\text{s.t.}\\quad \\dot{\\tilde b}=(r-n-g)\\,\\tilde b+\\tilde w-\\tilde c,\\qquad \\tilde b(0)\\ \\text{задано}',
        `\\text{TVC:}\\quad \\lim_{t\\to\\infty}${tvcW}\\,${UpE}\\,E(t)\\,\\tilde b(t)=0`,
      ] : [
        `\\max_{c(t)}\\; V_0=${objC}`,
        '\\text{s.t.}\\quad \\dot b=(r-n)\\,b+w-c,\\qquad b(0)\\ \\text{задано}',
        `\\text{TVC:}\\quad \\lim_{t\\to\\infty}${tvcW}\\,${Up(cT)}\\,b(t)=0`,
      ]),
    ] });
    fs.dec.push({ agent: 'Фирмы', items: [
      tp ? '\\max_{K,L}\\; \\pi=K^{\\alpha}\\big(E(t)L\\big)^{1-\\alpha}-w(t)L-\\big(r(t)+\\delta\\big)K'
         : '\\max_{K,L}\\; \\pi=K^{\\alpha}L^{1-\\alpha}-w(t)L-\\big(r(t)+\\delta\\big)K',
    ] });
    fs.dec.push({ agent: 'Рынки (балансовые условия)', items: [
      tp ? '\\tilde b(t)=\\tilde k(t)\\quad\\text{(рынок капитала)}' : 'b(t)=k(t)\\quad\\text{(рынок капитала)}',
    ] });
    fs.dec.push({ agent: 'Экзогенные процессы', items: [lawLine] });
  }

  // ── централизованная
  if (D) {
    fs.cen.push({ agent: 'Центральный планировщик', system: true, items: [
      tp ? `\\max_{\\{\\tilde c_t,\\,\\tilde k_{t+1}\\}_{t=0}^{\\infty}}\\; V_0=${objDe}`
         : `\\max_{\\{c_t,\\,k_{t+1}\\}_{t=0}^{\\infty}}\\; V_0=${objD}`,
      tp ? '\\text{s.t.}\\quad (1+n)(1+g)\\,\\tilde k_{t+1}=(1-\\delta)\\,\\tilde k_t+\\tilde k_t^{\\alpha}-\\tilde c_t,\\qquad \\tilde k_0\\ \\text{задано}'
         : '\\text{s.t.}\\quad (1+n)\\,k_{t+1}=(1-\\delta)\\,k_t+k_t^{\\alpha}-c_t,\\qquad k_0>0\\ \\text{задано}',
      tp ? `\\text{TVC:}\\quad \\lim_{t\\to\\infty}${tvcW}\\,${UpE}\\,E_{t+1}\\,\\tilde k_{t+1}=0`
         : `\\text{TVC:}\\quad \\lim_{t\\to\\infty}${tvcW}\\,${Up(cT)}\\,k_{t+1}=0`,
    ] });
    fs.cen.push({ agent: 'Экзогенные процессы', items: [lawLine] });
  } else {
    fs.cen.push({ agent: 'Центральный планировщик', system: true, items: [
      tp ? `\\max_{\\tilde c(t)}\\; V_0=${objCe}` : `\\max_{c(t)}\\; V_0=${objC}`,
      tp ? '\\text{s.t.}\\quad \\dot{\\tilde k}=\\tilde k^{\\alpha}-\\tilde c-(n+g+\\delta)\\,\\tilde k,\\qquad \\tilde k(0)\\ \\text{задано}'
         : '\\text{s.t.}\\quad \\dot k=k^{\\alpha}-c-(n+\\delta)\\,k,\\qquad k(0)>0\\ \\text{задано}',
      tp ? `\\text{TVC:}\\quad \\lim_{t\\to\\infty}${tvcW}\\,${UpE}\\,E(t)\\,\\tilde k(t)=0`
         : `\\text{TVC:}\\quad \\lim_{t\\to\\infty}${tvcW}\\,${Up(cT)}\\,k(t)=0`,
    ] });
    fs.cen.push({ agent: 'Экзогенные процессы', items: [lawLine] });
  }

  // ── итоговая система (с подставленными функциями) и та же система в числах
  const K1 = D ? `${tl('k')}_{t+1}` : tl('k');
  const mpk = `\\alpha\\,${K1}^{\\alpha-1}`;
  const mpkN = `${n4(a)}\\,${K1}^{${n4(a - 1)}}`;
  let euler, eulerN;
  if (D) {
    const Bt = mill ? '\\dfrac{\\beta}{1+n}' : '\\beta';
    const BtN = n4(mill ? s.beta / (1 + nn) : s.beta);
    // децентрализованная версия: правая часть через r_{t+1} (подстановка r — в строке FOC фирмы)
    const R = cen ? `${Bt}\\left(${mpk}+1-\\delta\\right)` : `${Bt}\\,(1+r_{t+1})`;
    const RN = `${BtN}\\left(${mpkN}${pm(1 - d)}\\right)`;
    const pre = '';
    if (ut === 'cara') {
      euler = `e^{\\theta\\,(c_{t+1}-c_t)}=${pre}${R}`;
      eulerN = `e^{${n4(s.theta)}\\,(c_{t+1}-c_t)}=${RN}`;
    } else {
      const ratio = tp ? '\\dfrac{\\tilde c_{t+1}}{\\tilde c_t}' : '\\dfrac{c_{t+1}}{c_t}';
      const growth = tp ? (ut === 'log' ? '(1+g)' : '(1+g)^{\\sigma}') : '';
      const growthN = tp ? `${n4(1 + g)}${ut === 'log' ? '' : `^{${n4(sig)}}`}` : '';
      euler = ut === 'log' ? `${growth}\\,${ratio}=${pre}${R}` : `${growth}\\left(${ratio}\\right)^{\\sigma}=${pre}${R}`;
      eulerN = ut === 'log' ? `${growthN}\\,${ratio}=${RN}` : `${growthN}\\left(${ratio}\\right)^{${n4(sig)}}=${RN}`;
    }
  } else {
    const k = tl('k');
    const nTerm = mill ? '-n' : '';
    const gTerm = ut === 'cara' ? '' : (tp ? (ut === 'log' ? '-g' : '-\\sigma g') : '');
    const lhs = ut === 'cara' ? '\\dot c' : (tp ? '\\dfrac{\\dot{\\tilde c}}{\\tilde c}' : '\\dfrac{\\dot c}{c}');
    const den = ut === 'cara' ? '\\theta' : '\\sigma';
    const preNum = `r-\\rho${nTerm}${gTerm}`;
    const num = `\\alpha\\,${k}^{\\alpha-1}-\\delta-\\rho${nTerm}${gTerm}`;
    const cst = d + s.rho + (mill ? nn : 0) + (ut === 'cara' ? 0 : sig * g);
    const numN = `${n4(a)}\\,${k}^{${n4(a - 1)}}${pm(-cst)}`;
    if (ut === 'log') {
      euler = `${lhs}=${cen ? num : preNum}`;
      eulerN = `${lhs}=${numN}`;
    } else {
      euler = `${lhs}=\\dfrac{${cen ? num : preNum}}{${den}}`;
      eulerN = `${lhs}=\\dfrac{${numN}}{${n4(ut === 'cara' ? s.theta : sig)}}`;
    }
  }
  fs.system.push({ label: 'Уравнение Эйлера', tex: euler, num: eulerN });

  if (!cen) {
    const k = D ? `${tl('k')}_t` : tl('k');
    const r = D ? 'r_t' : 'r', w = D ? 'w_t' : 'w';
    const wl = tp ? (D ? 'w_t=(1-\\alpha)\\,E_t' : 'w=(1-\\alpha)\\,E') : `${w}=(1-\\alpha)\\,`;
    const wlN = tp ? (D ? `w_t=${n4(1 - a)}\\,E_t` : `w=${n4(1 - a)}\\,E`) : `${w}=${n4(1 - a)}\\,`;
    fs.system.push({ label: 'Цены факторов (FOC фирмы)',
      tex: `${r}=\\alpha\\,${k}^{\\alpha-1}-\\delta,\\qquad ${wl}${k}^{\\alpha}`,
      num: `${r}=${n4(a)}\\,${k}^{${n4(a - 1)}}${pm(-d)},\\qquad ${wlN}${k}^{${n4(a)}}`,
    });
  }

  let accum, accumN;
  {
    const k = tl('k'), c = tl('c');
    if (D) {
      accum = `${growthD}\\,${k}_{t+1}=(1-\\delta)\\,${k}_t+${k}_t^{\\alpha}-${c}_t`;
      accumN = `${n4((1 + nn) * (1 + g))}\\,${k}_{t+1}=${n4(1 - d)}\\,${k}_t+${k}_t^{${n4(a)}}-${c}_t`;
    } else {
      accum = `\\dot{${k}}=${k}^{\\alpha}-${c}-${growthC}\\,${k}`;
      accumN = `\\dot{${k}}=${k}^{${n4(a)}}-${c}-${n4(nn + g + d)}\\,${k}`;
    }
  }
  fs.system.push({ label: cen ? 'Ресурсное ограничение' : 'Динамика капитала (бюджет + рынок + FOC фирмы)', tex: accum, num: accumN });

  // ── шок
  const tg = s.shockTarget;
  const persistent = s.shockPersistence === 'temporary' && SHOCK_TARGETS[tg].kind !== 'state';
  const prof = persistent ? '\\rho_s^{\\,t-\\hat t}\\,\\text{𝟙}\\{t\\ge\\hat t\\}' : '\\text{𝟙}\\{t\\ge\\hat t\\}';
  let shockTex, shockNum;
  if (tg === 'tfp') {
    shockTex = `${D ? 'E_t=(1+g)^t' : 'E(t)=e^{gt}'}\\big(1+\\varphi\\cdot ${prof}\\big)`;
    shockNum = `\\varphi=${n4(s.shockSize / 100)}`;
  } else if (tg === 'k') {
    shockTex = `${D ? 'k_{\\hat t}' : 'k(\\hat t)'}=(1+\\varphi_k)\\,${D ? 'k_{\\hat t}^{-}' : 'k(\\hat t^{-})'}`;
    shockNum = `\\varphi_k=${n4(s.shockSize / 100)}`;
  } else {
    const sym = { beta: '\\beta', rho: '\\rho', sigma: '\\sigma', theta: '\\theta', delta: '\\delta', n: 'n' }[tg];
    shockTex = `${sym}${D ? '_t' : '(t)'}=${sym}+\\Delta ${sym}\\cdot ${prof}`;
    shockNum = `\\Delta ${sym}=${n4(s.shockSize)}`;
  }
  shockNum += `,\\qquad \\hat t=${s.tHat}`;
  if (persistent) shockNum += `,\\qquad \\rho_s=${n4(s.rhoS)}`;
  fs.shock.push({ tex: shockTex, num: shockNum });
  fs.shockInfo = s.shockTiming === 'expected' && s.t0 < s.tHat
    ? `Ожидаемый шок: объявлен в $t_0 = ${s.t0}$, происходит в $\\hat t = ${s.tHat}$. С момента $t_0$ агенты знают весь будущий путь и сразу пересчитывают план.`
    : `Неожиданный (MIT) шок: до $\\hat t = ${s.tHat}$ экономика в стационаре; в $\\hat t$ агенты узнают о шоке и пересчитывают план.`;

  // ── стационар (с подстановкой и в числах)
  const sigT = ut === 'cara' ? '' : (ut === 'log' ? '' : '^{\\sigma}');
  let rss, rv;
  if (D) {
    const numer = [mill ? '(1+n)' : '', tp && ut !== 'cara' ? `(1+g)${sigT}` : ''].filter(Boolean).join('');
    rss = `1+r^*=\\dfrac{${numer || '1'}}{\\beta}`;
    rv = ((mill ? 1 + nn : 1) * Math.pow(1 + g, ut === 'cara' ? 0 : sig)) / s.beta - 1;
  } else {
    rss = `r^*=\\rho${mill ? '+n' : ''}${tp && ut !== 'cara' ? (ut === 'log' ? '+g' : '+\\sigma g') : ''}`;
    rv = s.rho + (mill ? nn : 0) + (ut === 'cara' ? 0 : sig * g);
  }
  const dep = D ? (1 + nn) * (1 + g) - 1 + d : nn + g + d;
  const depTex = D ? (tp ? '\\big[(1+n)(1+g)-1+\\delta\\big]' : '(n+\\delta)') : growthC;
  const kv = Math.pow(a / (rv + d), 1 / (1 - a));
  const cv = Math.pow(kv, a) - dep * kv;
  fs.ss = [
    { tex: rss, num: `r^*=${n4(rv)}` },
    { tex: `${tl('k')}^*=\\left(\\dfrac{\\alpha}{r^*+\\delta}\\right)^{\\frac{1}{1-\\alpha}}`,
      num: `${tl('k')}^*=${n4(kv)}` },
    { tex: `${tl('c')}^*=\\left(${tl('k')}^*\\right)^{\\alpha}-${depTex}\\,${tl('k')}^*`,
      num: `${tl('c')}^*=${n4(cv)}` },
  ];
  return fs;
}

export function steadyTable(s, res) {
  const tp = s.variant === 'tp';
  const cen = s.version === 'centralized';
  const D = s.time === 'discrete';
  const e = tp ? 'на эфф. работника' : 'на работника';
  const invName = D
    ? (tp ? 'инвестиции $[(1+n)(1+g)-1+\\delta]\\tilde k^*$' : 'инвестиции $(n+\\delta)k^*$')
    : (tp ? 'инвестиции $(n+g+\\delta)\\tilde k^*$' : 'инвестиции $(n+\\delta)k^*$');
  const rows = [
    { sym: tp ? '\\tilde k^*' : 'k^*', name: `капитал ${e}`, key: 'k' },
    { sym: tp ? '\\tilde y^*' : 'y^*', name: `выпуск ${e}`, key: 'y' },
    { sym: tp ? '\\tilde \\imath^*' : 'i^*', name: invName, key: 'i' },
    { sym: tp ? '\\tilde c^*' : 'c^*', name: `потребление ${e}`, key: 'c' },
    { sym: tp ? '\\tilde w^*' : 'w^*', name: cen ? 'предельный продукт труда' : 'зарплата', key: 'w' },
    { sym: 'r^*', name: cen ? 'доходность капитала $\\alpha k^{*\\,\\alpha-1}-\\delta$' : 'ставка процента', key: 'r', pct: true },
    { sym: 's^*', name: 'норма сбережения $i^*/y^*$', key: 's', pct: true },
  ];
  const v = (ss, r, Z) => (r.pct ? `${(100 * ss[r.key]).toFixed(2)}%` : fmt(ss[r.key] / Z, 3));
  const ZF = tp ? res.ZF : 1;
  return rows.map((r) => ({ ...r, before: v(res.ss0, r, 1), after: v(res.ssF, r, ZF) }));
}
