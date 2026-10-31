// Модель Рамсея (Ramsey–Cass–Koopmans) с ростом населения: настройки, решатель, формулы.
// Обозначения следуют материалам курса: домохозяйства владеют капиталом и сдают его фирмам,
// r_t — ставка процента (аренда r_t + δ), w_t — зарплата, π_t — прибыль фирм,
// k_t — капиталовооружённость, f(k) = k^α, L_t — население (= занятые),
// L_{t+1} = (1+n)L_t, E_t — эффективность труда, тильда — величины на эффективного работника.
// Законы движения записаны в точной форме: (1+n)(1+g)k̃_{t+1} = (1−δ)k̃_t + f(k̃_t) − c̃_t.
// В подписях интерфейса фрагменты между $…$ рендерятся KaTeX.

import { newtonTridiagonal } from '../solver.js';
import { sample, halfLife, tc, tcMap } from '../charts.js';

// ───────────────────────────── Настройки ─────────────────────────────

const MIT_NOTE = 'Только неожиданный перманентный: при смене функции полезности во времени сравнение $u\'(c_t)$ и $u\'(c_{t+1})$ зависело бы от единиц измерения $c$';

const SHOCK_TARGETS = {
  tfp:   { label: 'Уровень технологии $E_t$', kind: 'param', group: 'state', unit: '%', def: 10, step: 1, variant: 'tp' },
  k:     { label: 'Капиталовооружённость $k_t$', kind: 'state', unit: '%', def: -20, step: 1 },
  n:     { label: 'Темп роста населения $n$', kind: 'param', unit: 'Δ', def: 0.01, step: 0.005 },
  beta:  { label: 'Дисконт-фактор $\\beta$', kind: 'param', unit: 'Δ', def: 0.01, step: 0.005, time: 'discrete' },
  rho:   { label: 'Ставка дисконтирования $\\rho$', kind: 'param', unit: 'Δ', def: -0.01, step: 0.005, time: 'continuous' },
  sigma: { label: 'Неприятие риска $\\sigma$', kind: 'param', unit: 'Δ', def: 1, step: 0.25, utility: 'crra', onlyMIT: true,
           note: MIT_NOTE },
  theta: { label: 'Неприятие риска $\\theta$', kind: 'param', unit: 'Δ', def: 0.5, step: 0.1, utility: 'cara', onlyMIT: true,
           note: MIT_NOTE },
  delta: { label: 'Норма выбытия капитала $\\delta$', kind: 'param', unit: 'Δ', def: 0.02, step: 0.005 },
};

// параметр, путь которого показывается отдельным графиком при его шоке (как δ_t в материалах курса)
const PAR_CHART = { delta: ['Норма выбытия капитала', '\\delta_t'], beta: ['Дисконт-фактор', '\\beta_t'], rho: ['Ставка дисконтирования', '\\rho_t'],
  sigma: ['Неприятие риска', '\\sigma_t'], theta: ['Неприятие риска', '\\theta_t'] };

export const defaults = {
  time: 'discrete', version: 'centralized', variant: 'tp', objective: 'mill',
  utility: 'crra', production: 'cd',
  alpha: 0.3, beta: 0.96, rho: 0.04, delta: 0.1, sigma: 2, theta: 1, g: 0.02, n: 0.01,
  shockTarget: 'k', shockSize: -20, shockTiming: 'unexpected', tHat: 15, t0: 5,
  shockPersistence: 'permanent', rhoS: 0.8, tempMode: 'ar', shockDur: 5,
  horizon: 60, k0: 0.928,
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
    options: [{ v: 'centralized', l: 'Централизованная' }, { v: 'decentralized', l: 'Децентрализованная' }] },
  { id: 'variant', label: 'Технологический прогресс', type: 'select',
    options: [
      { v: 'base', l: 'Отсутствует' },
      { v: 'tp', l: 'Трудосберегающий' },
    ] },
  { id: 'objective', label: 'Целевая функция', type: 'segmented',
    options: (s) => (s.time === 'discrete'
      ? [{ v: 'mill', l: '$\\sum\\beta^t u(c_t)$' }, { v: 'bentham', l: '$\\sum\\beta^t L_t u(c_t)$' }]
      : [{ v: 'mill', l: '$\\int e^{-\\rho t}u(c)\\,dt$' }, { v: 'bentham', l: '$\\int e^{-\\rho t}L u(c)\\,dt$' }]),
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
    options: [{ v: 'cd', l: 'Кобб-Дуглас' }] },

  { section: 'Параметры' },
  { id: 'alpha', label: '$\\alpha$ — доля капитала', type: 'number', min: 0.01, max: 0.99, step: 0.01 },
  { id: 'beta', label: '$\\beta$ — дисконт-фактор', type: 'number', min: 0.5, max: 0.999, step: 0.005,
    show: (s) => s.time === 'discrete' },
  { id: 'rho', label: '$\\rho$ — ставка дисконтирования', type: 'number', min: 0.001, max: 0.5, step: 0.005,
    show: (s) => s.time === 'continuous' },
  { id: 'delta', label: '$\\delta$ — выбытие капитала', type: 'number', min: 0, max: 0.99, step: 0.01 },
  { id: 'n', label: '$n$ — темп роста $L_t$', type: 'number', min: -0.05, max: 1, step: 0.005 },
  { id: 'sigma', label: '$\\sigma$ — неприятие риска', type: 'number', min: 0.1, max: 10, step: 0.1,
    show: (s) => s.utility === 'crra' },
  { id: 'theta', label: '$\\theta$ — неприятие риска', type: 'number', min: 0.05, max: 10, step: 0.05,
    show: (s) => s.utility === 'cara' },
  { id: 'g', label: '$g$ — темп роста $E_t$', type: 'number', min: 0, max: 1, step: 0.005,
    show: (s) => s.variant === 'tp' },
  { id: 'k0', label: (s) => `$${s.variant === 'tp' ? '\\tilde k_0' : 'k_0'}$ — начальная капиталовооружённость`, type: 'number', min: 0.01, max: 100, step: 0.1 },

  { section: 'Шок' },
  { id: 'shockTarget', label: 'На что шок', type: 'select', rich: true, options: shockTargetsFor,
    groupLabel: (v) => ((SHOCK_TARGETS[v]?.group ?? SHOCK_TARGETS[v]?.kind) === 'state' ? 'state-переменные' : 'параметры') },
  { id: 'shockSize', label: (s) => (SHOCK_TARGETS[s.shockTarget]?.unit === '%' ? 'Величина, $\\Delta_{\\%}$' : 'Величина, $\\Delta$'),
    type: 'number', step: (s) => SHOCK_TARGETS[s.shockTarget]?.step ?? 0.01,
    hint: (s) => SHOCK_TARGETS[s.shockTarget]?.note },
  { id: 'shockTiming', label: 'Ожидаемость', type: 'segmented',
    options: [{ v: 'unexpected', l: 'Неожиданный (MIT)' }, { v: 'expected', l: 'Ожидаемый' }],
    show: (s) => !SHOCK_TARGETS[s.shockTarget]?.onlyMIT },
  { id: 'tHat', label: 'Момент шока $\\hat t$', type: 'number', min: 0, max: 100, step: 1 },
  { id: 't0', label: 'Объявление $t_0$', type: 'number', min: 0, max: 100, step: 1,
    show: (s) => s.shockTiming === 'expected', hint: 'Должно быть меньше $\\hat t$' },
  { id: 'shockPersistence', label: 'Длительность', type: 'segmented',
    options: [{ v: 'permanent', l: 'Перманентный' }, { v: 'temporary', l: 'Временный' }],
    show: (s) => SHOCK_TARGETS[s.shockTarget]?.kind !== 'state' && !SHOCK_TARGETS[s.shockTarget]?.onlyMIT },
  { id: 'tempMode', label: 'Временный шок', type: 'segmented',
    options: [{ v: 'ar', l: 'Персистентность' }, { v: 'fixed', l: 'Число периодов' }],
    show: (s) => SHOCK_TARGETS[s.shockTarget]?.kind !== 'state' && !SHOCK_TARGETS[s.shockTarget]?.onlyMIT && s.shockPersistence === 'temporary' },
  { id: 'rhoS', label: 'Персистентность $\\rho_s$', type: 'number', slider: true, min: 0, max: 0.99, step: 0.01,
    show: (s) => SHOCK_TARGETS[s.shockTarget]?.kind !== 'state' && !SHOCK_TARGETS[s.shockTarget]?.onlyMIT && s.shockPersistence === 'temporary' && s.tempMode !== 'fixed',
    hint: 'Отклонение затухает как $\\rho_s^{\\,t-\\hat t}$' },
  { id: 'shockDur', label: 'Число периодов $N$', type: 'number', min: 1, max: 200, step: 1,
    show: (s) => SHOCK_TARGETS[s.shockTarget]?.kind !== 'state' && !SHOCK_TARGETS[s.shockTarget]?.onlyMIT && s.shockPersistence === 'temporary' && s.tempMode === 'fixed',
    hint: (s) => (s.time === 'continuous' ? 'Шок действует на $[\\hat t,\\,\\hat t+N)$, затем сразу исчезает' : 'Шок действует в $t=\\hat t,\\dots,\\hat t+N-1$, затем сразу исчезает') },

  { section: 'Отображение' },
  { id: 'horizon', label: 'Горизонт графиков', type: 'number', min: 20, max: 200, step: 5 },
];

// Согласование настроек при изменении (вызывается UI после каждого изменения)
export function normalize(s, changed) {
  s.shockDur = Math.max(1, Math.round(+s.shockDur || 1));
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

// момент, когда временный шок на N периодов исчезает (для разметки графиков)
const shockEnd = (x) => (x.shockPersistence === 'temporary' && x.tempMode === 'fixed' && SHOCK_TARGETS[x.shockTarget]?.kind !== 'state' ? x.tHat + x.shockDur : null);

// ───────────────────────────── Решатель ─────────────────────────────

function shockProfile(s, t) {
  if (t < s.tHat - 1e-9) return 0;
  if (s.shockPersistence === 'permanent') return 1;
  if (s.tempMode === 'fixed') return t < s.tHat + s.shockDur - 1e-9 ? 1 : 0;
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
  if (!(s.k0 > 0)) errors.push('Начальная капиталовооружённость должна быть положительной.');
  if (s.shockTarget === 'k' && s.shockSize <= -100) errors.push('Капиталовооружённость не может упасть больше чем на 100%.');
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
  const t = [], series = { c: [], k: [], y: [], i: [], r: [], w: [], s: [], E: [], L: [], par: [] };
  const eff = { c: [], k: [], y: [], i: [], w: [] };
  const lvl = { c: [], k: [], y: [], i: [], w: [], r: [], s: [], E: [], L: [], par: [] };
  const baseLvl = { c: [], k: [], y: [], i: [], w: [], E: [], L: [], par: [] };
  const parKey = PAR_CHART[s.shockTarget] ? s.shockTarget : null;
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
    if (parKey) { lvl.par.push(P[parKey][j]); baseLvl.par.push(base[parKey][j]); series.par.push(P[parKey][j] - base[parKey][j]); }
  }
  baseLvl.r = t.map(() => 100 * ss0.r);
  baseLvl.s = t.map(() => 100 * ss0.s);
  const baseEff = {};
  for (const v of ['c', 'k', 'y', 'i', 'w']) baseEff[v] = t.map(() => ss0[v]);

  const exact0 = steady(s, base, 0, h, g, true);
  const exactF = steady(s, P, N + 1, h, g, true);
  return {
    ok: true, t, irf: series, levels: lvl, eff, baseLevels: baseLvl, baseEff, agg, baseAgg,
    ss0: exact0, ssF: exactF, ZF: P.Z[N + 1],
    permanentChange: Math.abs(exactF.k - exact0.k) / exact0.k > 1e-9 || Math.abs(exactF.r - exact0.r) > 1e-12,
    marks: { tHat: s.tHat, tEnd: shockEnd(s), t0: sol.expected ? s.t0 : null },
  };
}

// ───────────────────────────── Графики ─────────────────────────────

export function chartSpecs(s) {
  const cen = s.version === 'centralized';
  const tp = s.variant === 'tp';
  const x = (v) => `${v}_t`;
  const showL = Math.abs(s.n) > 0 || s.shockTarget === 'n';
  const specs = [
    ...(tp ? [{ id: 'E', title: 'Технология', sym: x('E'), irfUnit: '$\\Delta_{\\%}$ от тренда', noEff: true, levelOnly: true }] : []),
    ...(showL ? [{ id: 'L', title: 'Население', sym: x('L'), irfUnit: '$\\Delta_{\\%}$ от тренда', noEff: true, levelOnly: true }] : []),
    { id: 'c', title: 'Потребление', sym: x('c'), aggSym: x('C'), irfUnit: '$\\Delta_{\\%}$ от s.s.' },
    { id: 'k', title: 'Капитал', wTitle: 'Капиталовооружённость', sym: x('k'), aggSym: x('K'), irfUnit: '$\\Delta_{\\%}$ от s.s.' },
    { id: 'y', title: 'Выпуск', sym: x('y'), aggSym: x('Y'), irfUnit: '$\\Delta_{\\%}$ от s.s.' },
    { id: 'i', title: 'Инвестиции', sym: x('i'), aggSym: x('I'), irfUnit: '$\\Delta_{\\%}$ от s.s.' },
    cen ? { id: 'r', title: 'Отдача от капитала', sym: 'F^{\\prime}_K-\\delta', irfUnit: '$\\Delta$ от s.s.', lvlUnit: '%', noEff: true }
        : { id: 'r', title: 'Ставка процента', sym: x('r'), irfUnit: '$\\Delta$ от s.s.', lvlUnit: '%', noEff: true },
    cen ? { id: 'w', title: 'Предельный продукт труда', sym: 'F^{\\prime}_L', irfUnit: '$\\Delta_{\\%}$ от s.s.' }
        : { id: 'w', title: 'Зарплата', sym: x('w'), irfUnit: '$\\Delta_{\\%}$ от s.s.' },
    { id: 's', title: 'Норма сбережения', sym: 's_t = i_t/y_t', irfUnit: '$\\Delta$ от s.s.', lvlUnit: '%', noEff: true },
  ];
  const par = PAR_CHART[s.shockTarget];
  if (par) specs.unshift({ id: 'par', title: par[0], sym: par[1], irfUnit: '$\\Delta$ от s.s.', noEff: true, noLog: true });
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
// Децентрализованная версия — как в курсе: домохозяйства владеют капиталом (активов b нет),
// получают аренду (r_t + δ)k_t, зарплату и прибыль фирм.
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
  const k = tl('k'), c = tl('c'), w = tl('w'), pi = tp ? '\\tilde\\pi' : '\\pi';
  const fs = { dec: [], cen: [], system: [], shock: [], ssTitle: 'Траектория сбалансированного роста' };

  // полезность и предельная полезность от аргумента
  const U = (x) => (ut === 'crra' ? `\\dfrac{${x}^{\\,1-\\sigma}-1}{1-\\sigma}` : ut === 'log' ? `\\ln ${x}` : `-\\dfrac{1}{\\theta}e^{-\\theta ${x}}`);
  const Up = (x) => (ut === 'crra' ? `${x}^{-\\sigma}` : ut === 'log' ? `\\dfrac{1}{${x}}` : `e^{-\\theta ${x}}`);
  const Uw = (x) => (ut === 'cara' ? `\\left(${U(x)}\\right)` : U(x));
  const cT = '{c_t}';
  const growthD = tp ? '(1+n)(1+g)' : '(1+n)';
  const growthC = tp ? '(n+g+\\delta)' : '(n+\\delta)';
  const popLaw = D ? 'L_{t+1}=(1+n)L_t' : '\\dot L_t/L_t=n';
  const tpLaw = D ? 'E_{t+1}=(1+g)E_t' : '\\dot E_t/E_t=g';
  const lawLine = (tp ? `${popLaw},\\qquad ${tpLaw}` : popLaw) + (tp ? ',\\qquad L_0=E_0=1' : ',\\qquad L_0=1');

  // целевая функция и TVC: λ_t = β^t u′(c_t)E_t — теневая цена единицы k̃_{t+1}
  const objD = mill ? `\\sum_{t=0}^{\\infty}\\beta^t${Uw(cT)}` : `\\sum_{t=0}^{\\infty}\\beta^t L_t${Uw(cT)}`;
  const objC = mill ? `\\int_0^{\\infty}e^{-\\rho t}${Uw(cT)}\\,dt` : `\\int_0^{\\infty}e^{-\\rho t}L_t${Uw(cT)}\\,dt`;
  const tvcW = D ? (mill ? '\\beta^t' : '\\beta^t L_t') : (mill ? 'e^{-\\rho t}' : 'e^{-(\\rho-n)t}');
  // с ТП задачи записываются в единицах на эффективного работника: c = c̃·E
  const cE = '(\\tilde c_tE_t)';
  const obj = tp ? (D ? objD : objC).replace(cT, cE) : (D ? objD : objC);
  const lam = tp ? `${tvcW}${Up(cE)}E_t` : `${tvcW}${Up(cT)}`;
  const tvc = `\\text{TVC:}\\quad \\lim_{t\\to\\infty}${lam}${k}_{${D ? 't+1' : 't'}}=0,\\qquad ${k}_0\\ \\text{задано}`;
  const maxD = `\\max_{\\{${c}_t,\\,${k}_{t+1}\\}_{t=0}^{\\infty}}\\; V_0=${obj}`;
  const maxC = `\\max_{\\{${c}_t\\}_{t\\ge0}}\\; V_0=${obj}`;
  const firm = tp ? '\\max_{K_t,L_t}\\; \\pi_t=K_t^{\\alpha}(E_tL_t)^{1-\\alpha}-w_tL_t-(r_t+\\delta)K_t'
    : '\\max_{K_t,L_t}\\; \\pi_t=K_t^{\\alpha}L_t^{1-\\alpha}-w_tL_t-(r_t+\\delta)K_t';
  const markets = [`${k}_t\\ \\text{(спрос фирм)}=${k}_t\\ \\text{(предложение домохозяйств)}`,
    'L_t\\ \\text{(спрос фирм)}=L_t\\ \\text{(предложение домохозяйств)}'];

  // ── децентрализованная
  fs.dec.push({ agent: 'Домохозяйства', system: true, items: D ? [
    maxD,
    `\\text{s.t.}\\quad ${growthD}${k}_{t+1}=(1-\\delta)${k}_t+(r_t+\\delta)${k}_t+${w}_t+${pi}_t-${c}_t`,
    tvc,
  ] : [
    maxC,
    `\\text{s.t.}\\quad \\dot{${k}}_t=(r_t+\\delta)${k}_t-${growthC}${k}_t+${w}_t+${pi}_t-${c}_t`,
    tvc,
  ] });
  fs.dec.push({ agent: 'Фирмы', items: [firm] });
  fs.dec.push({ agent: 'Рынки', items: markets });
  fs.dec.push({ agent: 'Экзогенные процессы', items: [lawLine] });

  // ── централизованная
  fs.cen.push({ agent: 'Центральный планировщик', system: true, items: D ? [
    maxD,
    `\\text{s.t.}\\quad ${growthD}${k}_{t+1}=(1-\\delta)${k}_t+${k}_t^{\\alpha}-${c}_t`,
    tvc,
  ] : [
    maxC,
    `\\text{s.t.}\\quad \\dot{${k}}_t=${k}_t^{\\alpha}-${c}_t-${growthC}${k}_t`,
    tvc,
  ] });
  fs.cen.push({ agent: 'Экзогенные процессы', items: [lawLine] });

  // ── итоговая система (с подставленными функциями) и та же система в числах
  let euler, eulerN;
  if (D) {
    const K1 = `${k}_{t+1}`;
    const R = cen ? `\\left[1+\\alpha ${K1}^{\\alpha-1}-\\delta\\right]` : '(1+r_{t+1})';
    const RN = cen ? `\\left[${n4(1 - d)}+${n4(a)}${K1}^{${n4(a - 1)}}\\right]` : '(1+r_{t+1})';
    const rhs = mill ? `\\dfrac{\\beta${R}}{1+n}` : `\\beta${R}`;
    const rhsN = mill ? `\\dfrac{${n4(s.beta)}${RN}}{${n4(1 + nn)}}` : `${n4(s.beta)}${RN}`;
    if (ut === 'cara') {
      euler = `e^{\\theta(c_{t+1}-c_t)}=${rhs}`;
      eulerN = `e^{${n4(s.theta)}(c_{t+1}-c_t)}=${rhsN}`;
    } else {
      const ratio = tp ? `\\dfrac{(1+g)${c}_{t+1}}{${c}_t}` : `\\dfrac{${c}_{t+1}}{${c}_t}`;
      const ratioN = tp ? `\\dfrac{${n4(1 + g)}${c}_{t+1}}{${c}_t}` : ratio;
      euler = ut === 'log' ? `${ratio}=${rhs}` : `\\left(${ratio}\\right)^{\\sigma}=${rhs}`;
      eulerN = ut === 'log' ? `${ratioN}=${rhsN}` : `\\left(${ratioN}\\right)^{${n4(sig)}}=${rhsN}`;
    }
  } else {
    const kt = `${k}_t`;
    const nTerm = mill ? '-n' : '';
    const gTerm = ut === 'cara' ? '' : (tp ? (ut === 'log' ? '-g' : '-\\sigma g') : '');
    const lhs = ut === 'cara' ? '\\dot c_t' : `\\dfrac{\\dot{${c}}_t}{${c}_t}`;
    const den = ut === 'cara' ? '\\theta' : '\\sigma';
    const num = cen ? `\\alpha ${kt}^{\\alpha-1}-\\delta-\\rho${nTerm}${gTerm}` : `r_t-\\rho${nTerm}${gTerm}`;
    const cst = s.rho + (mill ? nn : 0) + (ut === 'cara' ? 0 : sig * g);
    const numN = cen ? `${n4(a)}${kt}^{${n4(a - 1)}}${pm(-(cst + d))}` : `r_t${pm(-cst)}`;
    euler = ut === 'log' ? `${lhs}=${num}` : `${lhs}=\\dfrac{${num}}{${den}}`;
    eulerN = ut === 'log' ? `${lhs}=${numN}` : `${lhs}=\\dfrac{${numN}}{${n4(ut === 'cara' ? s.theta : sig)}}`;
  }

  const kt = `${k}_t`;
  if (cen) {
    fs.system.push({ label: 'Уравнение Эйлера', tex: euler, num: eulerN });
    fs.system.push(D
      ? { label: 'Ресурсное ограничение', tex: `${growthD}${k}_{t+1}=(1-\\delta)${kt}+${kt}^{\\alpha}-${c}_t`,
        num: `${n4((1 + nn) * (1 + g))}${k}_{t+1}=${n4(1 - d)}${kt}+${kt}^{${n4(a)}}-${c}_t` }
      : { label: 'Ресурсное ограничение', tex: `\\dot{${k}}_t=${kt}^{\\alpha}-${c}_t-${growthC}${kt}`,
        num: `\\dot{${k}}_t=${kt}^{${n4(a)}}-${c}_t-${n4(nn + g + d)}${kt}` });
  } else {
    // система децентрализованного равновесия: два уравнения домохозяйства и два — фирмы
    fs.system.push({ label: 'Уравнение Эйлера (домохозяйства)', tex: euler, num: eulerN });
    fs.system.push(D
      ? { label: 'Бюджетное ограничение (домохозяйства)', tex: `${growthD}${k}_{t+1}=(1+r_t)${kt}+${w}_t+${pi}_t-${c}_t`,
        num: `${n4((1 + nn) * (1 + g))}${k}_{t+1}=(1+r_t)${kt}+${w}_t+${pi}_t-${c}_t` }
      : { label: 'Бюджетное ограничение (домохозяйства)', tex: `\\dot{${k}}_t=(r_t-${tp ? 'n-g' : 'n'})${kt}+${w}_t+${pi}_t-${c}_t`,
        num: `\\dot{${k}}_t=(r_t${pm(-(nn + g))})${kt}+${w}_t+${pi}_t-${c}_t` });
    fs.system.push({ label: 'Спрос на капитал (фирмы)', tex: `r_t=\\alpha ${kt}^{\\alpha-1}-\\delta`, num: `r_t=${n4(a)}${kt}^{${n4(a - 1)}}${pm(-d)}` });
    fs.system.push({ label: 'Спрос на труд (фирмы)', tex: `${w}_t=(1-\\alpha)${kt}^{\\alpha}`, num: `${w}_t=${n4(1 - a)}${kt}^{${n4(a)}}` });
    fs.system.push({ label: 'Прибыль фирм (CRS)', tex: `${pi}_t=${kt}^{\\alpha}-(r_t+\\delta)${kt}-${w}_t=0`,
      num: `${pi}_t=${kt}^{${n4(a)}}-(r_t${pm(d)})${kt}-${w}_t=0` });
  }

  // ── шок
  const tg = s.shockTarget;
  const persistent = s.shockPersistence === 'temporary' && SHOCK_TARGETS[tg].kind !== 'state';
  const prof = persistent && s.tempMode === 'fixed' ? '\\text{𝟙}\\{\\hat t\\le t<\\hat t+N\\}' : persistent ? '\\rho_s^{\\,t-\\hat t}\\,\\text{𝟙}\\{t\\ge\\hat t\\}' : '\\text{𝟙}\\{t\\ge\\hat t\\}';
  let shockTex, shockNum;
  if (tg === 'tfp') {
    shockTex = `${D ? 'E_t=(1+g)^t' : 'E_t=e^{gt}'}\\big(1+\\varphi\\cdot ${prof}\\big)`;
    shockNum = `\\varphi=${n4(s.shockSize / 100)}`;
  } else if (tg === 'k') {
    shockTex = `${k}_{\\hat t}=(1+\\varphi_k)${k}_{\\hat t}^{-}`;
    shockNum = `\\varphi_k=${n4(s.shockSize / 100)}`;
  } else {
    const sym = { beta: '\\beta', rho: '\\rho', sigma: '\\sigma', theta: '\\theta', delta: '\\delta', n: 'n' }[tg];
    shockTex = `${sym}_t=${sym}+\\Delta ${sym}\\cdot ${prof}`;
    shockNum = `\\Delta ${sym}=${n4(s.shockSize)}`;
  }
  shockNum += `,\\qquad \\hat t=${s.tHat}`;
  if (persistent) shockNum += s.tempMode === 'fixed' ? `,\\qquad N=${s.shockDur}` : `,\\qquad \\rho_s=${n4(s.rhoS)}`;
  fs.shock.push({ tex: shockTex, num: shockNum });
  return fs;
}

// Траектория сбалансированного роста: одна таблица «величина — смысл — формула — значение»
export function steadyTable(s, res) {
  const tp = s.variant === 'tp';
  const cen = s.version === 'centralized';
  const D = s.time === 'discrete';
  const mill = s.objective !== 'bentham';
  const ut = s.utility;
  const e = tp ? 'на эфф. работника' : 'на работника';
  const tl = (v) => (tp ? `\\tilde ${v}` : v);
  const [k, y, i, c] = ['k', 'y', 'i', 'c'].map((v) => `${tl(v)}^*`);
  const RS = cen ? 'F^{\\prime}_K-\\delta' : 'r^*';
  const gS = tp && ut !== 'cara' ? (ut === 'log' ? '(1+g)' : '(1+g)^{\\sigma}') : '';
  let rTex;
  if (D) {
    const numer = mill ? (gS ? `(1+n)${gS}` : '1+n') : gS || '1';
    rTex = `\\dfrac{${numer}}{\\beta}-1`;
  } else rTex = `\\rho${mill ? '+n' : ''}${gS ? (ut === 'log' ? '+g' : '+\\sigma g') : ''}`;
  const depTex = D ? (tp ? '\\big[(1+n)(1+g)-1+\\delta\\big]' : '(n+\\delta)') : (tp ? '(n+g+\\delta)' : '(n+\\delta)');
  const rows = [
    { sym: k, name: `капиталовооружённость${tp ? ' на эфф. работника' : ''}`, key: 'k',
      tex: `\\left(\\dfrac{\\alpha}{${cen ? 'F^{\\prime}_K' : 'r^*+\\delta'}}\\right)^{\\frac{1}{1-\\alpha}}` },
    { sym: y, name: `выпуск ${e}`, key: 'y', tex: `\\left(${k}\\right)^{\\alpha}` },
    { sym: i, name: `инвестиции ${e}`, key: 'i', tex: `${depTex}${k}` },
    { sym: c, name: `потребление ${e}`, key: 'c', tex: `${y}-${i}` },
    { sym: cen ? (tp ? '\\tilde F^{\\prime}_L' : 'F^{\\prime}_L') : `${tl('w')}^*`, name: cen ? 'предельный продукт труда' : 'зарплата', key: 'w',
      tex: `(1-\\alpha)${y}` },
    { sym: RS, name: cen ? 'отдача от капитала' : 'ставка процента', key: 'r', pct: true, tex: rTex },
    { sym: 's^*', name: 'норма сбережения', key: 's', pct: true, tex: `\\dfrac{${i}}{${y}}` },
  ];
  const ZF = tp ? res.ZF : 1;
  const v = (ss, r, Z) => (r.pct ? `${(100 * ss[r.key]).toFixed(2)}%` : fmt(ss[r.key] / Z, 3));
  return rows.map((r) => ({ ...r, before: v(res.ss0, r, 1), after: v(res.ssF, r, ZF), value: res.ss0[r.key] }));
}

// ───────────── Дополнительные блоки: сходимость, ТСР и основная (фазовая) диаграмма ─────────────

const PC = tcMap({
  dk: '#3d8acb', dk1: '#86c2f0', dc: '#7c62d8', dc1: '#c2b2f7', saddle: '#d9638f', path: '#23214a', ss: '#7d7ca5', from: '#3d8acb',
});

// решения для рисования повторяются при каждом перерисовывании — кешируем
const memo = new Map();
const cached = (key, fn) => {
  if (!memo.has(key)) { if (memo.size > 60) memo.clear(); memo.set(key, fn()); }
  return memo.get(key);
};
const MODEL_KEYS = ['time', 'variant', 'objective', 'utility', 'alpha', 'beta', 'rho', 'delta', 'sigma', 'theta', 'g', 'n', 'dt'];

// стационар (точные формулы) при параметрах s
function ssOf(s) {
  const g = s.variant === 'tp' ? s.g : 0;
  return steady(s, buildPaths({ ...s, shockSize: 0 }, 1, 1, 0), 0, 1, g, true);
}

// Путь без шока из k̃0: экономика сразу встаёт на седловую траекторию. Решается как неожиданный
// сдвиг капиталовооружённости в t = 0 относительно стационара той же сетки.
function pathFrom(s, k0, horizon, dt) {
  return cached(JSON.stringify([MODEL_KEYS.map((x) => s[x]), k0, horizon, dt]), () => {
    const h = s.time === 'discrete' ? 1 : dt;
    const g = s.variant === 'tp' ? s.g : 0;
    const kss = steady(s, buildPaths({ ...s, shockSize: 0 }, 1, h, 0), 0, h, g).k;
    const res = solve({ ...s, dt, shockTarget: 'k', shockSize: 100 * (k0 / kss - 1), tHat: 0, t0: 0,
      shockTiming: 'unexpected', shockPersistence: 'permanent', horizon });
    return res.ok ? res : null;
  });
}

// седловая траектория системы s: два пути — снизу (из kLo) и сверху (из kHi) — к стационару
function saddleLine(s, kLo, kHi) {
  const dt = 0.05; // для рисования в непрерывном времени хватает более крупного шага
  const lo = pathFrom(s, kLo, 150, dt), hi = pathFrom(s, kHi, 150, dt);
  const pts = (r) => (r ? r.eff.k.map((x, j) => [x, r.eff.c[j]]) : []);
  return [...pts(lo), ...pts(hi).reverse()];
}

// подписи локусов: Δk̃_{t+1} = 0 и Δc̃_{t+1} = 0 (в непрерывном времени — производные)
function locusLabels(s) {
  const tp = s.variant === 'tp', D = s.time === 'discrete';
  const kS = tp ? '\\tilde k' : 'k', cS = tp ? '\\tilde c' : 'c';
  return { kS, cS, lk: D ? `\\Delta ${kS}_{t+1}=0` : `\\dot{${kS}}_t=0`, lc: D ? `\\Delta ${cS}_{t+1}=0` : `\\dot{${cS}}_t=0` };
}

// Локус Δc̃ = 0. В непрерывном времени — вертикаль k̃ = k̃*. В дискретном в уравнение Эйлера входит k̃_{t+1},
// поэтому Δc̃_{t+1} = 0 ⇔ k̃_{t+1} = k̃*, и в осях (k̃_t, c̃_t) это кривая c̃ = (1−δ)k̃ + k̃^α − (1+n)(1+g)k̃*.
function consLocus(s, ss, xmax, ymax) {
  if (s.time !== 'discrete') return { data: [[ss.k, 0], [ss.k, ymax]] };
  const a = s.alpha, G = 1 + ss.dep - s.delta;
  const f = (x) => (1 - s.delta) * x + Math.pow(x, a) - G * ss.k;
  const root = (y, lo, hi) => { for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) < y) lo = m; else hi = m; } return (lo + hi) / 2; }; // f возрастает
  const x0 = root(0, 0, ss.k), x1 = f(xmax) > ymax ? root(ymax, ss.k, xmax) : xmax;
  return { fn: f, data: sample(f, x0, x1) };
}

// линии фазовой диаграммы системы s: локусы и (по желанию) седловая траектория
function systemSeries(s, xmax, ymax, style) {
  const a = s.alpha, ss = ssOf(s);
  const locus = (x) => Math.pow(x, a) - ss.dep * x;
  const { lk, lc } = locusLabels(s);
  const sfx = style.suffix ? `\\ \\text{${style.suffix}}` : '';
  const out = [
    { label: `$${lk}${sfx}$`, color: style.kColor, width: style.width ?? 2.2, dash: style.dash, fn: locus, data: sample(locus, 0, xmax) },
    { label: `$${lc}${sfx}$`, color: style.cColor, width: style.width ?? 2.2, dash: style.dash, ...consLocus(s, ss, xmax, ymax) },
  ];
  if (style.saddle) out.push({ label: 'седловая траектория', color: PC.saddle, width: 2.4, data: style.saddle.filter(([x]) => x <= xmax) });
  return out;
}

// максимум кривой Δk̃ = 0 на отрезке [0, xmax] — для высоты диаграммы
function locusTop(s, xmax) {
  const a = s.alpha, ss = ssOf(s);
  const kGR = Math.min(Math.pow(a / ss.dep, 1 / (1 - a)), xmax);
  return Math.pow(kGR, a) - ss.dep * kGR;
}

export function extraBlocks(s, res) {
  return [{ ...convergenceBlock(s), beforeSS: true }, diagramBlock(s, res)];
}

function convergenceBlock(s) {
  const a = s.alpha, tp = s.variant === 'tp', disc = s.time === 'discrete';
  const g0 = tp ? s.g : 0, ss = ssOf(s);
  const r = pathFrom(s, s.k0, s.horizon, 0.02);
  const { kS, cS, lk, lc } = locusLabels(s);
  const yS = tp ? '\\tilde y' : 'y', x = (v) => `${v}_t`;
  const e = tp ? 'на эфф. работника' : 'на работника';
  const color = tc('#3d8acb'), HL = tc('#7c62d8');
  const out = { k: [], y: [], c: [], gy: [] };
  if (r) {
    const dep = ss.dep;
    r.t.forEach((t, j) => {
      const kj = r.eff.k[j], yj = r.eff.y[j];
      out.k.push([t, kj]); out.y.push([t, yj]); out.c.push([t, r.eff.c[j]]);
      if (disc) { if (j >= 1) out.gy.push([t, 100 * ((yj / r.eff.y[j - 1]) * (1 + g0) - 1)]); }
      else out.gy.push([t, 100 * (a * (Math.pow(kj, a) - r.eff.c[j] - dep * kj) / kj + g0)]);
    });
  }
  const mk = (title, sym, key, hl, unit) => {
    const hh = halfLife(out[key], hl, disc);
    return { title, sym, unit, series: [{ label: `$${sym}$`, data: out[key], color, width: 2.6 }],
      opts: { xLabel: 't', xmin: 0, xmax: s.horizon, discrete: disc, hlines: [{ y: hl, color: tc('#7d7ca5') }], marksOnAxis: true,
        vlines: hh ? [{ x: hh.x, yTo: hh.y, color: HL, dots: true, label: `t_{1/2}=${fmtTex(hh.x, disc ? 0 : 1)}` }] : [] } };
  };

  // фазовая диаграмма: локусы, седловая траектория и путь экономики из k̃0 (точки раз в период)
  const xmax = Math.max(2 * ss.k, 1.25 * s.k0);
  const saddle = saddleLine(s, Math.min(0.25 * ss.k, s.k0), xmax);
  const step = disc ? 1 : Math.round(1 / 0.1);
  const path = r ? r.eff.k.filter((_, j) => j % step === 0).map((kk, j) => [kk, r.eff.c[j * step]]) : [];
  const ymax = 1.15 * Math.max(locusTop(s, xmax), ...saddle.map((p) => p[1]), ...path.map((p) => p[1]));
  const series = [
    ...systemSeries(s, xmax, ymax, { kColor: PC.dk, cColor: PC.dc, saddle }),
    { label: `путь экономики из $${kS}_0$`, data: path, color: PC.path, points: true },
  ];
  const c0 = path[0]?.[1] ?? ss.c;
  return {
    title: 'Сходимость к стационару',
    sections: [
      { legend: [{ label: `траектория из $${kS}_0 = ${fmtTex(s.k0, 3)}$`, color }, { label: 'стационарное значение', color: tc('#7d7ca5'), dash: true }, { label: 'период полусходимости', color: HL, dots: true }],
        charts: [
          mk(`Капиталовооружённость${tp ? ' на эфф. работника' : ''}`, x(kS), 'k', ss.k, ''),
          mk(`Выпуск ${e}`, x(yS), 'y', ss.y, ''),
          mk(`Потребление ${e}`, x(cS), 'c', ss.c, ''),
          mk('Темп роста выпуска на работника', 'g_{y,t}', 'gy', 100 * g0, '%'),
        ] },
      { subtitle: 'Основная диаграмма модели', diagram: true,
        legend: [{ label: `$${lk}$`, color: PC.dk }, { label: `$${lc}$`, color: PC.dc }, { label: 'седловая траектория', color: PC.saddle },
          { label: `путь экономики из $${kS}_0$`, color: PC.path, point: true }],
        charts: [{ series, opts: { xLabel: `${kS}_t`, yLabel: `${cS}_t`, xmin: 0, xmax, ymin: 0, ymax, zoom: true, marksOnAxis: true,
          vlines: [{ x: s.k0, color, label: `${kS}_0`, yTo: c0 }, { x: ss.k, color: PC.ss, label: `${kS}^*`, yTo: ss.c }] } }] },
    ],
  };
}

// Графики под таблицей ТСР: величины на работника — теоретическая ТСР и путь из k̃0 к ней
export function ssCharts(s, res, scale = 'log') {
  const disc = s.time === 'discrete';
  const r = pathFrom(s, s.k0, s.horizon, 0.02);
  const pick = (src, key) => (r ? r.t.map((t, j) => [t, src[key][j]]) : []);
  const color = tc('#3d8acb'), BG = tc('#7d7ca5');
  const k0 = `${s.variant === 'tp' ? '\\tilde k' : 'k'}_0`;
  const mk = (title, sym, key) => ({ title, sym, unit: '',
    series: [{ label: 'ТСР', data: pick(r?.baseLevels ?? {}, key), color: BG, width: 2, dash: [6, 4] }, { label: `$${sym}$`, data: pick(r?.levels ?? {}, key), color, width: 2.6 }],
    opts: { xLabel: 't', xmin: 0, xmax: s.horizon, ymin: scale === 'log' ? undefined : 0, log: scale === 'log', discrete: disc, marksOnAxis: true } });
  return {
    subtitle: 'Сходимость к траектории сбалансированного роста',
    scaleToggle: true,
    legend: [{ label: 'ТСР', color: BG, dash: true }, { label: `путь из $${k0}$`, color }],
    charts: [mk('Капиталовооружённость', 'k_t', 'k'), mk('Выпуск на работника', 'y_t', 'y'), mk('Потребление на работника', 'c_t', 'c'), mk(s.version === 'centralized' ? 'Предельный продукт труда' : 'Зарплата', s.version === 'centralized' ? 'F^{\\prime}_L' : 'w_t', 'w')],
  };
}

// Основная диаграмма с шоком: старые/новые локусы, седловая траектория той системы,
// к которой экономика приходит, и путь экономики с моментами t₀, t̂, t̂ + N на оси
function diagramBlock(s, res) {
  const disc = s.time === 'discrete';
  const tg = s.shockTarget, size = s.shockSize;
  const isState = SHOCK_TARGETS[tg].kind === 'state' || tg === 'tfp';
  const permanent = !isState && s.shockPersistence === 'permanent';
  const sNew = isState ? s : { ...s, [tg]: s[tg] + size };   // параметры после шока / во время шока
  const sMain = permanent ? sNew : s;                        // система, к стационару которой приходит экономика
  const ss0 = ssOf(s), ssM = ssOf(sMain);
  const { kS, cS, lk, lc } = locusLabels(s);

  // путь экономики раз в период (в непрерывном времени — по целым t)
  const step = disc ? 1 : Math.round(1 / 0.1);
  const pt = (j) => [res.eff.k[j], res.eff.c[j]];
  const idx = (t) => res.t.findIndex((x) => Math.abs(x - t) < 1e-9);
  const expected = res.marks.t0 != null;
  const jStart = idx(expected ? res.marks.t0 : s.tHat), jHat = idx(s.tHat);
  const A = [ss0.k, ss0.c];
  const jumps = [];
  // новость: c̃ прыгает; при неожиданном шоке состояния в тот же момент сдвигается и k̃
  const pS = pt(jStart);
  jumps.push(Math.abs(pS[0] - A[0]) > 1e-9 ? [A, [pS[0], A[1]], pS] : [A, pS]);
  // ожидаемый шок состояния в t̂: k̃ сдвигается, уровень потребления не прыгает
  let pre = null;
  if (expected && isState) {
    const p = pt(jHat), f = 1 + size / 100;
    pre = tg === 'tfp' ? [p[0] * f, p[1] * f] : [p[0] / f, p[1]];
    jumps.push([pre, p]);
  }
  const seg = (j0, j1) => { const o = []; for (let j = j0; j <= j1; j += step) o.push(pt(j)); return o; };
  const jEnd = res.t.length - 1;
  const paths = expected && isState ? [[...seg(jStart, jHat - step), pre], seg(jHat, jEnd)] : [seg(jStart, jEnd)];
  const allPts = [A, ...paths.flat(), ...(pre ? [pre] : [])];

  const xmax = Math.max(2 * Math.max(ss0.k, ssM.k), 1.15 * Math.max(...allPts.map((p) => p[0])));
  const saddle = saddleLine(sMain, Math.min(0.25 * ssM.k, ...allPts.map((p) => 0.9 * p[0])), xmax);
  const ymax = 1.15 * Math.max(locusTop(s, xmax), locusTop(sNew, xmax), ...saddle.map((p) => p[1]), ...allPts.map((p) => p[1]));

  const series = [];
  const legend = [];
  const alt = permanent ? s : isState ? null : sNew;   // вторая система: до шока (перманентный) или во время шока (временный)
  const altSfx = permanent ? '(до шока)' : s.tempMode === 'fixed' ? '(во время шока)' : '(в момент шока)';
  if (alt) {
    series.push(...systemSeries(alt, xmax, ymax, { kColor: PC.dk1, cColor: PC.dc1, dash: [7, 4], width: 2, suffix: altSfx }));
    legend.push({ label: `$${lk}\\ \\text{${altSfx}}$`, color: PC.dk1, dash: true }, { label: `$${lc}\\ \\text{${altSfx}}$`, color: PC.dc1, dash: true });
  }
  series.push(...systemSeries(sMain, xmax, ymax, { kColor: PC.dk, cColor: PC.dc, saddle }));
  legend.unshift({ label: `$${lk}$`, color: PC.dk }, { label: `$${lc}$`, color: PC.dc }, { label: 'седловая траектория', color: PC.saddle });
  for (const J of jumps) series.push({ label: 'скачок', data: J, color: PC.path, width: 1.6, dash: [5, 4] });
  paths.forEach((P) => series.push({ label: 'путь экономики', data: P, color: PC.path, points: true }));
  legend.push({ label: 'путь экономики', color: PC.path, point: true }, { label: 'скачок', color: PC.path, dash: true });

  // моменты на оси k̃: объявление, шок, конец шока — в точке, где в этот момент находится экономика
  const vlines = [];
  const mark = (t, label) => { const j = idx(t); if (j >= 0) { const p = pt(j); vlines.push({ x: p[0], color: PC.ss, label, yTo: p[1] }); } };
  if (expected) mark(res.marks.t0, 't_0');
  mark(s.tHat, '\\hat t');
  if (res.marks.tEnd != null) mark(res.marks.tEnd, `\\hat t+${s.shockDur}`);

  return {
    title: 'Основная диаграмма модели', diagram: true,
    legend,
    charts: [{ series, opts: { xLabel: `${kS}_t`, yLabel: `${cS}_t`, xmin: 0, xmax, ymin: 0, ymax, vlines, zoom: true, marksOnAxis: true } }],
  };
}
