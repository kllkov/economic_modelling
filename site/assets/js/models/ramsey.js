// Модель Рамсея (Ramsey–Cass–Koopmans): настройки, решатель, формулы.
// Обозначения следуют презентации курса: b_t — активы, r_t — ставка процента,
// w_t — зарплата, k_t — капитал на работника, f(k) = k^α, E_t — эффективность труда,
// тильда — величины на эффективного работника.
// В подписях интерфейса фрагменты между $…$ рендерятся KaTeX.

import { newtonTridiagonal } from '../solver.js';

// ───────────────────────────── Настройки ─────────────────────────────

const SHOCK_TARGETS = {
  tfp:   { label: 'Уровень технологии $E_t$', kind: 'param', unit: '%', def: 10, step: 1, variant: 'tp',
           note: '$\\varphi$ — скачок уровня $E_t$, %' },
  k:     { label: 'Капитал $k_t$', kind: 'state', unit: '%', def: -20, step: 1,
           note: 'Разовое изменение запаса капитала, %' },
  beta:  { label: 'Дисконт-фактор $\\beta$', kind: 'param', unit: 'Δ', def: 0.01, step: 0.005, time: 'discrete',
           note: 'Абсолютное изменение $\\Delta\\beta$' },
  rho:   { label: 'Ставка дисконтирования $\\rho$', kind: 'param', unit: 'Δ', def: -0.01, step: 0.005, time: 'continuous',
           note: 'Абсолютное изменение $\\Delta\\rho$' },
  sigma: { label: 'Неприятие риска $\\sigma$', kind: 'param', unit: 'Δ', def: 1, step: 0.25, utility: 'crra',
           note: 'Абсолютное изменение $\\Delta\\sigma$; $1/\\sigma$ — эластичность межвременного замещения' },
  theta: { label: 'Неприятие риска $\\theta$', kind: 'param', unit: 'Δ', def: 0.5, step: 0.1, utility: 'cara',
           note: 'Абсолютное изменение $\\Delta\\theta$' },
  delta: { label: 'Норма амортизации $\\delta$', kind: 'param', unit: 'Δ', def: 0.02, step: 0.005,
           note: 'Абсолютное изменение $\\Delta\\delta$' },
};

export const meta = {
  id: 'ramsey',
  title: 'Модель Рамсея',
  subtitle: 'Ramsey–Cass–Koopmans model',
  ready: true,
};

export const defaults = {
  time: 'discrete', version: 'decentralized', variant: 'base',
  utility: 'crra', production: 'cd',
  alpha: 0.3, beta: 0.96, rho: 0.04, delta: 0.1, sigma: 2, theta: 1, g: 0.02,
  shockTarget: 'k', shockSize: -20, shockTiming: 'unexpected', tHat: 15, t0: 5,
  shockPersistence: 'permanent', rhoS: 0.8,
  horizon: 60,
};

function shockTargetsFor(s) {
  return Object.entries(SHOCK_TARGETS)
    .filter(([, d]) => (!d.time || d.time === s.time) && (!d.utility || d.utility === s.utility)
      && (!d.variant || d.variant === s.variant))
    .sort(([, a], [, b]) => (a.kind === 'state' ? 0 : 1) - (b.kind === 'state' ? 0 : 1))
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

  { section: 'Функции' },
  { id: 'utility', label: 'Полезность домохозяйств', type: 'select',
    options: [
      { v: 'crra', l: 'CRRA' },
      { v: 'log', l: 'Логарифмическая' },
      { v: 'cara', l: 'CARA' },
    ] },
  { id: 'production', label: 'Производственная функция', type: 'select',
    options: [{ v: 'cd', l: 'Кобба–Дугласа' }],
    hint: 'Другие формы появятся позже' },

  { section: 'Параметры' },
  { id: 'alpha', label: '$\\alpha$ — доля капитала', type: 'number', min: 0.05, max: 0.95, step: 0.01 },
  { id: 'beta', label: '$\\beta$ — дисконт-фактор', type: 'number', min: 0.5, max: 0.999, step: 0.005,
    show: (s) => s.time === 'discrete' },
  { id: 'rho', label: '$\\rho$ — ставка дисконтирования', type: 'number', min: 0.001, max: 0.5, step: 0.005,
    show: (s) => s.time === 'continuous' },
  { id: 'delta', label: '$\\delta$ — амортизация', type: 'number', min: 0, max: 0.5, step: 0.01 },
  { id: 'sigma', label: '$\\sigma$ — неприятие риска', type: 'number', min: 0.1, max: 10, step: 0.1,
    show: (s) => s.utility === 'crra' },
  { id: 'theta', label: '$\\theta$ — неприятие риска', type: 'number', min: 0.05, max: 10, step: 0.05,
    show: (s) => s.utility === 'cara' },
  { id: 'g', label: '$g$ — темп роста $E_t$', type: 'number', min: 0, max: 0.1, step: 0.005,
    show: (s) => s.variant === 'tp' },

  { section: 'Шок' },
  { id: 'shockTarget', label: 'На что шок', type: 'select', rich: true, options: shockTargetsFor,
    groupLabel: (v) => (SHOCK_TARGETS[v]?.kind === 'state' ? 'state-переменная' : 'параметр') },
  { id: 'shockSize', label: (s) => (SHOCK_TARGETS[s.shockTarget]?.unit === '%' ? 'Величина, %' : 'Величина, $\\Delta$'),
    type: 'number', step: (s) => SHOCK_TARGETS[s.shockTarget]?.step ?? 0.01,
    hint: (s) => SHOCK_TARGETS[s.shockTarget]?.note },
  { id: 'shockTiming', label: 'Ожидаемость', type: 'segmented',
    options: [{ v: 'unexpected', l: 'Неожиданный' }, { v: 'expected', l: 'Ожидаемый' }] },
  { id: 'tHat', label: (s) => (s.time === 'discrete' ? 'Период шока $\\hat t$' : 'Момент шока $\\hat t$'),
    type: 'number', min: 0, max: 100, step: 1 },
  { id: 't0', label: 'Объявление $t_0$', type: 'number', min: 0, max: 100, step: 1,
    show: (s) => s.shockTiming === 'expected', hint: 'Должно быть меньше $\\hat t$' },
  { id: 'shockPersistence', label: 'Длительность', type: 'segmented',
    options: [{ v: 'permanent', l: 'Перманентный' }, { v: 'temporary', l: 'Временный' }],
    show: (s) => SHOCK_TARGETS[s.shockTarget]?.kind !== 'state' },
  { id: 'rhoS', label: 'Персистентность $\\rho_s$', type: 'number', slider: true, min: 0, max: 0.99, step: 0.01,
    show: (s) => SHOCK_TARGETS[s.shockTarget]?.kind !== 'state' && s.shockPersistence === 'temporary',
    hint: 'Отклонение затухает как $\\rho_s^{\\,t-\\hat t}$' },

  { section: 'Отображение' },
  { id: 'horizon', label: 'Горизонт графиков', type: 'number', min: 20, max: 200, step: 5 },
];

// Согласование настроек при изменении (вызывается UI после каждого изменения)
export function normalize(s, changed) {
  const allowed = shockTargetsFor(s).map((o) => o.v);
  if (!allowed.includes(s.shockTarget)) {
    // соответствие β ↔ ρ при смене времени
    if (s.shockTarget === 'beta' && allowed.includes('rho')) s.shockTarget = 'rho';
    else if (s.shockTarget === 'rho' && allowed.includes('beta')) s.shockTarget = 'beta';
    else s.shockTarget = 'k';
    changed = 'shockTarget';
  }
  if (changed === 'shockTarget') s.shockSize = SHOCK_TARGETS[s.shockTarget].def;
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
    D: new Float64Array(N + 2),
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
    P.Z[j] = 1 + (target === 'tfp' ? (size / 100) * prof : 0);
    P.D[j] = target === 'k' && j === jHat ? 1 + size / 100 : 1;
  }
  return P;
}

// Стационар в единицах «на эффективного работника» (детрендировано по (1+g)^t),
// для сетки с шагом h (h = 1 — дискретное время; h → 0 — непрерывное).
function steady(s, P, j, h, g, exact = false) {
  const a = s.alpha, d = P.delta[j], Z = P.Z[j];
  let r;
  if (s.time === 'discrete') {
    const sig = s.utility === 'cara' ? 0 : P.sigma[j];
    r = Math.pow(1 + g, sig) / P.beta[j] - 1;
  } else {
    const sig = s.utility === 'cara' ? 0 : P.sigma[j];
    r = exact ? P.rho[j] + sig * g : (Math.exp((P.rho[j] + sig * Math.log(1 + g * h) / h) * h) - 1) / h;
  }
  const k = Z * Math.pow(a / (r + d), 1 / (1 - a));
  const y = Math.pow(k, a) * Math.pow(Z, 1 - a);
  const c = y - (d + g) * k;
  return { r, k, y, c, i: (d + g) * k, w: (1 - a) * y, s: ((d + g) * k) / y };
}

function validate(s) {
  const errors = [];
  const g = s.variant === 'tp' ? s.g : 0;
  if (s.utility === 'cara' && s.variant === 'tp' && s.g > 0)
    errors.push('CARA несовместима со сбалансированным ростом: при $g > 0$ нет стационара в эффективных единицах. Выберите CRRA, логарифмическую полезность или вариант без ТП.');
  if (s.time === 'discrete' && !(s.beta > 0 && s.beta < 1)) errors.push('$\\beta$ должен лежать в $(0,1)$.');
  if (s.time === 'continuous' && !(s.rho > 0)) errors.push('$\\rho$ должна быть положительной.');
  if (!(s.alpha > 0 && s.alpha < 1)) errors.push('$\\alpha$ должна лежать в $(0,1)$.');
  if (s.utility === 'crra' && !(s.sigma > 0)) errors.push('$\\sigma$ должна быть положительной.');
  if (s.utility === 'cara' && !(s.theta > 0)) errors.push('$\\theta$ должна быть положительной.');
  const sig = s.utility === 'log' ? 1 : s.sigma;
  if (s.utility !== 'cara') {
    if (s.time === 'discrete' && s.beta * Math.pow(1 + g, 1 - sig) >= 1)
      errors.push('Нарушено условие ограниченности полезности: нужно $\\beta(1+g)^{1-\\sigma} < 1$.');
    if (s.time === 'continuous' && s.rho <= (1 - sig) * g)
      errors.push('Нарушено условие ограниченности полезности: нужно $\\rho > (1-\\sigma)g$.');
  }
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
  const P = buildPaths(s, N, h, scale);
  const base = buildPaths({ ...s, shockSize: 0 }, N, h, 0);
  const ss0 = steady(s, base, 0, h, g);
  const ssF = steady(s, P, N + 1, h, g);
  if (!(ssF.c > 0) || !(ssF.k > 0)) return { ok: false, reason: 'Новый стационар не существует при этих параметрах.' };

  const jHat = Math.round(s.tHat / h);
  const expected = s.shockTiming === 'expected' && s.t0 < s.tHat;
  const jStart = Math.min(expected ? Math.round(s.t0 / h) : jHat, N - 5);
  const lnG1 = Math.log(1 + g * h);
  const util = s.utility;

  const k = new Float64Array(N + 2);
  for (let j = 0; j <= jStart; j++) k[j] = ss0.k;
  k[jStart] = ss0.k * (expected ? 1 : P.D[jStart]);
  k[N + 1] = ssF.k;
  const n = N - jStart;

  const c = new Float64Array(N + 1);
  const lnMU = (cj, j) => {
    const lnLevel = Math.log(cj) + j * lnG1;
    if (util === 'crra') return -P.sigma[j] * lnLevel;
    if (util === 'log') return -lnLevel;
    return -P.theta[j] * cj * Math.exp(j * lnG1);
  };
  const lnB = (j) => (s.time === 'discrete' ? Math.log(P.beta[j]) : -P.rho[j] * h);

  const fill = (x) => {
    for (let i = 0; i < n; i++) k[jStart + 1 + i] = x[i];
    for (let j = jStart; j <= N; j++) {
      if (!(k[j] > 0)) return false;
      const y = Math.pow(k[j], a) * Math.pow(P.Z[j], 1 - a);
      c[j] = ((1 - P.delta[j] * h) * k[j] + h * y - (1 + g * h) * k[j + 1] / P.D[j + 1]) / h;
      if (util !== 'cara' && !(c[j] > 0)) return false;
    }
    return true;
  };

  const residual = (x) => {
    if (!fill(x)) return null;
    const F = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const j = jStart + i;
      const r1 = a * Math.pow(k[j + 1] / P.Z[j + 1], a - 1) - P.delta[j + 1];
      const gross = P.D[j + 1] * (1 + h * r1);
      if (!(gross > 0)) return null;
      F[i] = lnMU(c[j], j) - lnB(j) - Math.log(gross) - lnMU(c[j + 1], j + 1);
    }
    return F;
  };

  let x0;
  if (guess && guess.length === n) x0 = guess;
  else {
    x0 = new Float64Array(n);
    const k0 = k[jStart];
    for (let i = 0; i < n; i++) {
      const t = (i + 1) * h;
      x0[i] = ssF.k + (k0 - ssF.k) * Math.exp(-0.08 * t);
    }
  }
  const res = newtonTridiagonal(residual, x0, { tol: 1e-11, maxIter: 80 });
  if (!res.ok) return { ok: false, x: res.x, reason: 'Численный метод не сошёлся.' };
  fill(res.x);
  for (let j = 0; j < jStart; j++) c[j] = ss0.c;
  return { ok: true, x: res.x, k: Float64Array.from(k), c: Float64Array.from(c), P, ss0, ssF, g, jStart, jHat, expected };
}

export function solve(s) {
  const errors = validate(s);
  if (errors.length) return { ok: false, errors };
  const h = s.time === 'discrete' ? 1 : 0.1;
  const Tsolve = Math.max(300, s.horizon + 250, s.tHat + 250);
  const N = Math.round(Tsolve / h);

  let sol = solvePath(s, h, N, 1);
  if (!sol.ok) {
    // продолжение по величине шока (гомотопия)
    let guess = null;
    for (const sc of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1]) {
      sol = solvePath(s, h, N, sc, guess);
      if (!sol.ok) break;
      guess = sol.x;
    }
  }
  if (!sol.ok) return { ok: false, errors: [sol.reason || 'Не удалось найти решение.'] };

  const { k, c, P, ss0, ssF, g } = sol;
  const a = s.alpha;
  const Np = Math.round(s.horizon / h);
  const lnG1 = Math.log(1 + g * h);
  const t = [], series = { c: [], k: [], y: [], i: [], r: [], w: [], s: [] };
  const eff = { c: [], k: [], y: [], i: [], w: [] };
  const lvl = { c: [], k: [], y: [], i: [], w: [], r: [], s: [] };
  const baseLvl = { c: [], k: [], y: [], i: [], w: [] };
  for (let j = 0; j <= Np; j++) {
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
    series.r.push(100 * (r - ss0.r));
    series.s.push(100 * (ih / yh - ss0.s));
    lvl.r.push(100 * r);
    lvl.s.push((100 * ih) / yh);
  }
  baseLvl.r = t.map(() => 100 * ss0.r);
  baseLvl.s = t.map(() => 100 * ss0.s);
  const baseEff = {};
  for (const v of ['c', 'k', 'y', 'i', 'w']) baseEff[v] = t.map(() => ss0[v]);

  const exact0 = steady(s, buildPaths({ ...s, shockSize: 0 }, N, h, 0), 0, h, g, true);
  const exactF = steady(s, P, N + 1, h, g, true);
  return {
    ok: true, h, t, irf: series, levels: lvl, eff, baseLevels: baseLvl, baseEff,
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
  return [
    { id: 'c', title: 'Потребление', sym: x('c'), irfUnit: '% откл. от s.s.' },
    { id: 'k', title: 'Капитал', sym: x('k'), irfUnit: '% откл. от s.s.' },
    { id: 'y', title: 'Выпуск', sym: x('y'), irfUnit: '% откл. от s.s.' },
    { id: 'i', title: 'Инвестиции', sym: x('i'), irfUnit: '% откл. от s.s.' },
    cen ? { id: 'r', title: 'Доходность капитала', sym: `\\alpha ${k}^{\\alpha-1}-\\delta`, irfUnit: 'п.п. от s.s.', lvlUnit: '%', noEff: true }
        : { id: 'r', title: 'Ставка процента', sym: x('r'), irfUnit: 'п.п. от s.s.', lvlUnit: '%', noEff: true },
    cen ? { id: 'w', title: 'Предельный продукт труда', sym: `(1-\\alpha)${k}^{\\alpha}`, irfUnit: '% откл. от s.s.' }
        : { id: 'w', title: 'Зарплата', sym: x('w'), irfUnit: '% откл. от s.s.' },
    { id: 's', title: 'Норма сбережения', sym: D ? 's_t = i_t/y_t' : 's(t) = i/y', irfUnit: 'п.п. от s.s.', lvlUnit: '%', noEff: true },
  ].map((c) => ({ ...c, effAvailable: tp && !c.noEff }));
}

// ───────────────────────────── Формулы ─────────────────────────────

function fmtTex(x, d = 4) {
  if (!Number.isFinite(x)) return '?';
  let t = x.toFixed(d);
  if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '');
  return t === '-0' ? '0' : t;
}
const fmt = (x, d = 3) => (Number.isFinite(x) ? fmtTex(x, d).replace('-', '−') : '—');
const n = (x) => fmtTex(x, 4);
// «+ 0.9» / «- 0.1» для подстановки чисел
const pm = (x) => (x < 0 ? `-${n(-x)}` : `+${n(x)}`);

// Все формулы — уже с подставленными функциями (Кобб–Дуглас, выбранная полезность).
export function formulas(s) {
  const D = s.time === 'discrete';
  const tp = s.variant === 'tp';
  const cen = s.version === 'centralized';
  const ut = s.utility;
  const sig = ut === 'log' ? 1 : s.sigma;
  const g = tp ? s.g : 0;
  const a = s.alpha, d = s.delta;
  const T = (v) => (D ? `${v}_t` : `${v}(t)`);
  const tl = (v) => (tp ? `\\tilde ${v}` : v);
  const fs = { dec: [], cen: [], system: [], shock: [], ss: [] };

  // полезность и предельная полезность от аргумента
  const U = (c) => (ut === 'crra' ? `\\dfrac{${c}^{\\,1-\\sigma}-1}{1-\\sigma}` : ut === 'log' ? `\\ln ${c}` : `-\\dfrac{1}{\\theta}\\,e^{-\\theta ${c}}`);
  const Up = (c) => (ut === 'crra' ? `${c}^{-\\sigma}` : ut === 'log' ? `\\dfrac{1}{${c}}` : `e^{-\\theta ${c}}`);
  const cT = D ? '{c_t}' : 'c(t)';
  const tpLaw = D ? 'E_{t+1}=(1+g)\\,E_t,\\qquad \\tilde x_t\\equiv x_t/E_t' : '\\dot E/E=g,\\qquad \\tilde x\\equiv x/E';

  // ── децентрализованная
  if (D) {
    fs.dec.push({ agent: 'Домохозяйства', system: true, items: [
      `\\max_{\\{c_t,\\,b_{t+1}\\}_{t=0}^{\\infty}}\\; V_0=\\sum_{t=0}^{\\infty}\\beta^t\\,${U(cT)}`,
      '\\text{s.t.}\\quad b_{t+1}=(1+r_t)\\,b_t+w_t-c_t,\\qquad b_0\\ \\text{задано}',
      ...(tp ? ['\\Leftrightarrow\\quad (1+g)\\,\\tilde b_{t+1}=(1+r_t)\\,\\tilde b_t+\\tilde w_t-\\tilde c_t'] : []),
      `\\text{TVC:}\\quad \\lim_{t\\to\\infty}\\beta^t\\,${Up(cT)}\\,b_t=0`,
    ] });
    fs.dec.push({ agent: 'Фирмы', items: [
      tp ? '\\max_{K_t,L_t}\\; \\pi_t=K_t^{\\alpha}(E_tL_t)^{1-\\alpha}-w_tL_t-(r_t+\\delta)K_t'
         : '\\max_{K_t,L_t}\\; \\pi_t=K_t^{\\alpha}L_t^{1-\\alpha}-w_tL_t-(r_t+\\delta)K_t',
      tp ? 'r_t=\\alpha\\,\\tilde k_t^{\\alpha-1}-\\delta,\\qquad w_t=(1-\\alpha)\\,E_t\\,\\tilde k_t^{\\alpha}'
         : 'r_t=\\alpha\\,k_t^{\\alpha-1}-\\delta,\\qquad w_t=(1-\\alpha)\\,k_t^{\\alpha}',
    ] });
    fs.dec.push({ agent: 'Рынки (балансовые условия)', items: [
      tp ? '\\tilde b_t=\\tilde k_t\\quad\\text{(рынок капитала)},\\qquad L_t=1' : 'b_t=k_t\\quad\\text{(рынок капитала)},\\qquad L_t=1',
      ...(tp ? [tpLaw] : []),
    ] });
  } else {
    fs.dec.push({ agent: 'Домохозяйства', system: true, items: [
      `\\max_{c(t)}\\; V_0=\\int_0^{\\infty}e^{-\\rho t}\\,${U(cT)}\\,dt`,
      '\\text{s.t.}\\quad \\dot b=r(t)\\,b+w(t)-c(t),\\qquad b(0)\\ \\text{задано}',
      ...(tp ? ['\\Leftrightarrow\\quad \\dot{\\tilde b}=(r-g)\\,\\tilde b+\\tilde w-\\tilde c'] : []),
      `\\text{TVC:}\\quad \\lim_{t\\to\\infty}e^{-\\rho t}\\,${Up(cT)}\\,b(t)=0`,
    ] });
    fs.dec.push({ agent: 'Фирмы', items: [
      tp ? '\\max_{K,L}\\; \\pi=K^{\\alpha}\\big(E(t)L\\big)^{1-\\alpha}-w(t)L-\\big(r(t)+\\delta\\big)K'
         : '\\max_{K,L}\\; \\pi=K^{\\alpha}L^{1-\\alpha}-w(t)L-\\big(r(t)+\\delta\\big)K',
      tp ? 'r=\\alpha\\,\\tilde k^{\\alpha-1}-\\delta,\\qquad w=(1-\\alpha)\\,E\\,\\tilde k^{\\alpha}'
         : 'r=\\alpha\\,k^{\\alpha-1}-\\delta,\\qquad w=(1-\\alpha)\\,k^{\\alpha}',
    ] });
    fs.dec.push({ agent: 'Рынки (балансовые условия)', items: [
      tp ? '\\tilde b(t)=\\tilde k(t),\\qquad L=1' : 'b(t)=k(t),\\qquad L=1',
      ...(tp ? [tpLaw] : []),
    ] });
  }

  // ── централизованная
  if (D) {
    fs.cen.push({ agent: 'Центральный планировщик', system: true, items: [
      tp ? `\\max_{\\{\\tilde c_t,\\,\\tilde k_{t+1}\\}_{t=0}^{\\infty}}\\; \\sum_{t=0}^{\\infty}\\beta^t\\,${U('(\\tilde c_tE_t)')}`
         : `\\max_{\\{c_t,\\,k_{t+1}\\}_{t=0}^{\\infty}}\\; V_0=\\sum_{t=0}^{\\infty}\\beta^t\\,${U(cT)}`,
      tp ? '\\text{s.t.}\\quad (1+g)\\,\\tilde k_{t+1}=(1-\\delta)\\,\\tilde k_t+\\tilde k_t^{\\alpha}-\\tilde c_t,\\qquad \\tilde k_0\\ \\text{задано}'
         : '\\text{s.t.}\\quad k_{t+1}=(1-\\delta)\\,k_t+k_t^{\\alpha}-c_t,\\qquad k_0>0\\ \\text{задано}',
      `\\text{TVC:}\\quad \\lim_{t\\to\\infty}\\beta^t\\,${Up(cT)}\\,k_{t+1}=0`,
    ], notes: tp ? [tpLaw] : [] });
  } else {
    fs.cen.push({ agent: 'Центральный планировщик', system: true, items: [
      `\\max_{c(t)}\\; V_0=\\int_0^{\\infty}e^{-\\rho t}\\,${U(cT)}\\,dt`,
      tp ? '\\text{s.t.}\\quad \\dot{\\tilde k}=\\tilde k^{\\alpha}-\\tilde c-(\\delta+g)\\,\\tilde k,\\qquad \\tilde k(0)\\ \\text{задано}'
         : '\\text{s.t.}\\quad \\dot k=k^{\\alpha}-c-\\delta k,\\qquad k(0)>0\\ \\text{задано}',
      `\\text{TVC:}\\quad \\lim_{t\\to\\infty}e^{-\\rho t}\\,${Up(cT)}\\,k(t)=0`,
    ], notes: tp ? [tpLaw] : [] });
  }

  // ── итоговая система (с подставленными функциями) и та же система в числах
  const K1 = D ? `${tl('k')}_{t+1}` : tl('k');
  const mpk = `\\alpha\\,${K1}^{\\alpha-1}`;
  const mpkN = `${n(a)}\\,${K1}^{${n(a - 1)}}`;
  let euler, eulerN;
  if (D) {
    const R = `\\beta\\left(${mpk}+1-\\delta\\right)`;
    const RN = `${n(s.beta)}\\left(${mpkN}${pm(1 - d)}\\right)`;
    const pre = cen ? '' : '\\beta\\,(1+r_{t+1})=';
    if (ut === 'cara') {
      euler = `e^{\\theta\\,(c_{t+1}-c_t)}=${pre}${R}`;
      eulerN = `e^{${n(s.theta)}\\,(c_{t+1}-c_t)}=${RN}`;
    } else {
      const ratio = tp ? '\\dfrac{\\tilde c_{t+1}}{\\tilde c_t}' : '\\dfrac{c_{t+1}}{c_t}';
      const growth = tp ? (ut === 'log' ? '(1+g)' : '(1+g)^{\\sigma}') : '';
      const growthN = tp ? `${n(1 + g)}${ut === 'log' ? '' : `^{${n(sig)}}`}` : '';
      euler = ut === 'log' ? `${growth}\\,${ratio}=${pre}${R}` : `${growth}\\left(${ratio}\\right)^{\\sigma}=${pre}${R}`;
      eulerN = ut === 'log' ? `${growthN}\\,${ratio}=${RN}` : `${growthN}\\left(${ratio}\\right)^{${n(sig)}}=${RN}`;
    }
  } else {
    const k = tl('k');
    const pre = cen ? '' : (ut === 'cara' ? '\\dfrac{r-\\rho}{\\theta}=' : ut === 'log' ? (tp ? 'r-\\rho-g=' : 'r-\\rho=') : (tp ? '\\dfrac{r-\\rho-\\sigma g}{\\sigma}=' : '\\dfrac{r-\\rho}{\\sigma}='));
    const lhs = ut === 'cara' ? '\\dot c' : (tp ? '\\dfrac{\\dot{\\tilde c}}{\\tilde c}' : '\\dfrac{\\dot c}{c}');
    const extra = ut === 'cara' ? '' : (tp ? (ut === 'log' ? '-g' : '-\\sigma g') : '');
    const num = `\\alpha\\,${k}^{\\alpha-1}-\\delta-\\rho${extra}`;
    const cst = d + s.rho + (ut === 'cara' ? 0 : sig * g);
    const numN = `${n(a)}\\,${k}^{${n(a - 1)}}${pm(-cst)}`;
    if (ut === 'log') { euler = `${lhs}=${pre}${num}`; eulerN = `${lhs}=${numN}`; }
    else {
      const den = ut === 'cara' ? '\\theta' : '\\sigma';
      const denN = n(ut === 'cara' ? s.theta : sig);
      euler = `${lhs}=${pre}\\dfrac{${num}}{${den}}`;
      eulerN = `${lhs}=\\dfrac{${numN}}{${denN}}`;
    }
  }
  fs.system.push({ label: 'Уравнение Эйлера', tex: euler, num: eulerN });

  if (!cen) {
    const k = D ? `${tl('k')}_t` : tl('k');
    const r = D ? 'r_t' : 'r', w = D ? 'w_t' : 'w';
    const wl = tp ? (D ? 'w_t=(1-\\alpha)\\,E_t' : 'w=(1-\\alpha)\\,E') : `${w}=(1-\\alpha)\\,`;
    const wlN = tp ? (D ? `w_t=${n(1 - a)}\\,E_t` : `w=${n(1 - a)}\\,E`) : `${w}=${n(1 - a)}\\,`;
    fs.system.push({ label: 'Цены факторов (FOC фирмы)',
      tex: `${r}=\\alpha\\,${k}^{\\alpha-1}-\\delta,\\qquad ${wl}${k}^{\\alpha}`,
      num: `${r}=${n(a)}\\,${k}^{${n(a - 1)}}${pm(-d)},\\qquad ${wlN}${k}^{${n(a)}}`,
    });
  }

  let accum, accumN;
  if (D) {
    const k = tl('k'), c = tl('c');
    accum = `${tp ? '(1+g)\\,' : ''}${k}_{t+1}=(1-\\delta)\\,${k}_t+${k}_t^{\\alpha}-${c}_t`;
    accumN = `${tp ? `${n(1 + g)}\\,` : ''}${k}_{t+1}=${n(1 - d)}\\,${k}_t+${k}_t^{${n(a)}}-${c}_t`;
  } else {
    const k = tl('k'), c = tl('c');
    accum = `\\dot{${k}}=${k}^{\\alpha}-${c}-${tp ? '(\\delta+g)' : '\\delta'}\\,${k}`;
    accumN = `\\dot{${k}}=${k}^{${n(a)}}-${c}-${n(d + g)}\\,${k}`;
  }
  fs.system.push({ label: cen ? 'Ресурсное ограничение' : 'Динамика капитала (бюджет + рынок + FOC фирмы)', tex: accum, num: accumN });

  // ── шок
  const tg = s.shockTarget;
  const persistent = s.shockPersistence === 'temporary' && SHOCK_TARGETS[tg].kind !== 'state';
  const prof = persistent ? '\\rho_s^{\\,t-\\hat t}\\,\\mathbb 1\\{t\\ge\\hat t\\}' : '\\mathbb 1\\{t\\ge\\hat t\\}';
  let shockTex, shockNum;
  if (tg === 'tfp') {
    shockTex = `${D ? 'E_t=(1+g)^t' : 'E(t)=e^{gt}'}\\big(1+\\varphi\\cdot ${prof}\\big)`;
    shockNum = `\\varphi=${n(s.shockSize / 100)}`;
  } else if (tg === 'k') {
    shockTex = `${D ? 'k_{\\hat t}' : 'k(\\hat t)'}=(1+\\varphi_k)\\,${D ? 'k_{\\hat t}^{-}' : 'k(\\hat t^{-})'}`;
    shockNum = `\\varphi_k=${n(s.shockSize / 100)}`;
  } else {
    const sym = { beta: '\\beta', rho: '\\rho', sigma: '\\sigma', theta: '\\theta', delta: '\\delta' }[tg];
    shockTex = `${sym}${D ? '_t' : '(t)'}=${sym}+\\Delta${sym}\\cdot ${prof}`;
    shockNum = `\\Delta${sym}=${n(s.shockSize)}`;
  }
  shockNum += `,\\qquad \\hat t=${s.tHat}`;
  if (persistent) shockNum += `,\\qquad \\rho_s=${n(s.rhoS)}`;
  fs.shock.push({ tex: shockTex, num: shockNum });
  fs.shockInfo = s.shockTiming === 'expected' && s.t0 < s.tHat
    ? `Ожидаемый шок: объявлен в $t_0 = ${s.t0}$, происходит в $\\hat t = ${s.tHat}$. С момента $t_0$ агенты знают весь будущий путь и сразу пересчитывают план.`
    : `Неожиданный шок: до $\\hat t = ${s.tHat}$ экономика в стационаре; в $\\hat t$ агенты узнают о шоке и пересчитывают план.`;

  // ── стационар (с подстановкой и в числах)
  let rss, rssN, rv;
  if (D) {
    if (ut === 'cara' || !tp) { rss = '1+r^*=\\dfrac{1}{\\beta}'; rv = 1 / s.beta - 1; }
    else { rss = `1+r^*=\\dfrac{(1+g)^{${ut === 'log' ? '' : '\\sigma'}}}{\\beta}`.replace('^{}', ''); rv = Math.pow(1 + g, sig) / s.beta - 1; }
  } else {
    if (ut === 'cara' || !tp) { rss = 'r^*=\\rho'; rv = s.rho; }
    else { rss = `r^*=\\rho+${ut === 'log' ? '' : '\\sigma '}g`; rv = s.rho + sig * g; }
  }
  rssN = `r^*=${n(rv)}`;
  const kv = Math.pow(a / (rv + d), 1 / (1 - a));
  const cv = Math.pow(kv, a) - (d + g) * kv;
  fs.ss = [
    { tex: rss, num: rssN },
    { tex: `${tl('k')}^*=\\left(\\dfrac{\\alpha}{r^*+\\delta}\\right)^{\\frac{1}{1-\\alpha}}`,
      num: `${tl('k')}^*=\\left(\\dfrac{${n(a)}}{${n(rv)}+${n(d)}}\\right)^{${n(1 / (1 - a))}}=${n(kv)}` },
    { tex: `${tl('c')}^*=\\left(${tl('k')}^*\\right)^{\\alpha}-(\\delta${tp ? '+g' : ''})\\,${tl('k')}^*`,
      num: `${tl('c')}^*=${n(cv)}` },
  ];
  return fs;
}

export function steadyTable(s, res) {
  const tp = s.variant === 'tp';
  const cen = s.version === 'centralized';
  const e = tp ? 'на эфф. работника' : 'на работника';
  const rows = [
    { sym: tp ? '\\tilde k^*' : 'k^*', name: `капитал ${e}`, key: 'k' },
    { sym: tp ? '\\tilde y^*' : 'y^*', name: `выпуск ${e}`, key: 'y' },
    { sym: tp ? '\\tilde \\imath^*' : 'i^*', name: tp ? 'инвестиции $(\\delta+g)\\tilde k^*$' : 'инвестиции $\\delta k^*$ (= износ)', key: 'i' },
    { sym: tp ? '\\tilde c^*' : 'c^*', name: `потребление ${e}`, key: 'c' },
    { sym: tp ? '\\tilde w^*' : 'w^*', name: cen ? 'предельный продукт труда' : 'зарплата', key: 'w' },
    { sym: 'r^*', name: cen ? 'доходность капитала $\\alpha k^{*\\,\\alpha-1}-\\delta$' : 'ставка процента', key: 'r', pct: true },
    { sym: 's^*', name: 'норма сбережения $i^*/y^*$', key: 's', pct: true },
  ];
  const v = (ss, r, Z) => (r.pct ? `${(100 * ss[r.key]).toFixed(2)}%` : fmt(ss[r.key] / Z, 3));
  const ZF = tp ? res.ZF : 1;
  return rows.map((r) => ({ ...r, before: v(res.ss0, r, 1), after: v(res.ssF, r, ZF) }));
}
