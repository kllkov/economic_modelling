// Модель Солоу (Solow–Swan): экзогенная норма сбережения s, производство Кобба–Дугласа
// Y = K^α (A L)^{1−α}, трудосберегающий ТП (A растёт темпом g), население растёт темпом n.
// Обозначения — как в конспекте лекции: A — технология, k̃ = K/(AL), y = f(k).
//
// Динамика — прямое (вперёд) решение: оптимизации во времени нет, поэтому ожидания не влияют
// на траекторию. Дискретное время — точная рекурсия, непрерывное — RK4 с шагом 0.02.
// Внутри счёт ведётся в x = K/(L·(1+g)^t) — капитал на работника, очищенный от базового тренда;
// фактический уровень технологии относительно базового тренда — Ar(t) = A(t)/(1+g)^t.

const SHOCK_TARGETS = {
  tfp:   { label: 'Уровень технологии $A_t$', kind: 'param', group: 'state', unit: '%', def: 10, step: 1, variant: 'tp' },
  k:     { label: 'Капитал $k_t$', kind: 'state', unit: '%', def: -30, step: 1 },
  s:     { label: 'Норма сбережения $s$', kind: 'param', unit: 'Δ', def: 0.05, step: 0.01 },
  n:     { label: 'Темп роста населения $n$', kind: 'param', unit: 'Δ', def: 0.01, step: 0.005 },
  g:     { label: 'Темп роста технологии $g$', kind: 'param', unit: 'Δ', def: 0.01, step: 0.005, variant: 'tp' },
  delta: { label: 'Норма амортизации $\\delta$', kind: 'param', unit: 'Δ', def: 0.02, step: 0.005 },
};

export const meta = { id: 'solow', title: 'Модель Солоу', subtitle: 'Solow–Swan model', ready: true };

export const defaults = {
  time: 'discrete', version: 'decentralized', variant: 'tp', production: 'cd',
  alpha: 0.3, s: 0.2, delta: 0.05, n: 0.01, g: 0.02,
  shockTarget: 's', shockSize: 0.05, tHat: 10,
  shockPersistence: 'permanent', rhoS: 0.8,
  horizon: 100,
};

function shockTargetsFor(st) {
  return Object.entries(SHOCK_TARGETS)
    .filter(([, d]) => !d.variant || d.variant === st.variant)
    .sort(([, a], [, b]) => ((a.group ?? a.kind) === 'state' ? 0 : 1) - ((b.group ?? b.kind) === 'state' ? 0 : 1))
    .map(([v, d]) => ({ v, l: d.label }));
}

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
  { id: 'production', label: 'Производственная функция', type: 'select',
    options: [{ v: 'cd', l: 'Кобба–Дугласа' }] },

  { section: 'Параметры' },
  { id: 'alpha', label: '$\\alpha$ — доля капитала', type: 'number', min: 0.05, max: 0.95, step: 0.01 },
  { id: 's', label: '$s$ — норма сбережения', type: 'number', min: 0.01, max: 0.99, step: 0.01 },
  { id: 'delta', label: '$\\delta$ — амортизация', type: 'number', min: 0, max: 0.5, step: 0.01 },
  { id: 'n', label: '$n$ — темп роста населения', type: 'number', min: -0.05, max: 0.1, step: 0.005 },
  { id: 'g', label: '$g$ — темп роста $A_t$', type: 'number', min: 0, max: 0.1, step: 0.005,
    show: (st) => st.variant === 'tp' },

  { section: 'Шок' },
  { id: 'shockTarget', label: 'На что шок', type: 'select', rich: true, options: shockTargetsFor,
    groupLabel: (v) => ((SHOCK_TARGETS[v]?.group ?? SHOCK_TARGETS[v]?.kind) === 'state' ? 'state-переменные' : 'параметры') },
  { id: 'shockSize', label: (st) => (SHOCK_TARGETS[st.shockTarget]?.unit === '%' ? 'Величина, $\\Delta$(%)' : 'Величина, $\\Delta$(уровни)'),
    type: 'number', step: (st) => SHOCK_TARGETS[st.shockTarget]?.step ?? 0.01 },
  { id: 'tHat', label: 'Момент шока $\\hat t$', type: 'number', min: 0, max: 100, step: 1 },
  { id: 'shockPersistence', label: 'Длительность', type: 'segmented',
    options: [{ v: 'permanent', l: 'Перманентный' }, { v: 'temporary', l: 'Временный' }],
    show: (st) => SHOCK_TARGETS[st.shockTarget]?.kind !== 'state' },
  { id: 'rhoS', label: 'Персистентность $\\rho_s$', type: 'number', slider: true, min: 0, max: 0.99, step: 0.01,
    show: (st) => SHOCK_TARGETS[st.shockTarget]?.kind !== 'state' && st.shockPersistence === 'temporary',
    hint: 'Отклонение затухает как $\\rho_s^{\\,t-\\hat t}$' },

  { section: 'Отображение' },
  { id: 'horizon', label: 'Горизонт графиков', type: 'number', min: 20, max: 200, step: 5 },
];

export function normalize(st, changed) {
  const allowed = shockTargetsFor(st).map((o) => o.v);
  if (!allowed.includes(st.shockTarget)) { st.shockTarget = 'k'; changed = 'shockTarget'; }
  if (changed === 'shockTarget') st.shockSize = SHOCK_TARGETS[st.shockTarget].def;
  return st;
}

// ───────────────────────────── Решатель ─────────────────────────────

const isState = (st) => SHOCK_TARGETS[st.shockTarget]?.kind === 'state';

// профиль шока параметра: 0 до t̂, затем 1 (перманентный) или ρ_s^{t−t̂} (временный)
function prof(st, t) {
  if (isState(st) || t < st.tHat - 1e-7) return 0;
  if (st.shockPersistence === 'permanent') return 1;
  return Math.pow(st.rhoS, t - st.tHat);
}
// ∫_0^t prof(τ) dτ — нужен для уровня технологии при шоке g в непрерывном времени
function profInt(st, t) {
  if (isState(st) || t <= st.tHat) return 0;
  const u = t - st.tHat;
  if (st.shockPersistence === 'permanent') return u;
  const r = st.rhoS;
  if (!(r > 0)) return 0;
  return (1 - Math.pow(r, u)) / -Math.log(r);
}

// параметры в момент t (с шоком, умноженным на scale; scale = 0 — базовый путь)
function params(st, t, scale = 1) {
  const p = prof(st, t) * scale, tg = st.shockTarget, d = st.shockSize;
  return {
    s: st.s + (tg === 's' ? d * p : 0),
    n: st.n + (tg === 'n' ? d * p : 0),
    delta: st.delta + (tg === 'delta' ? d * p : 0),
    g: (st.variant === 'tp' ? st.g : 0) + (tg === 'g' ? d * p : 0),
    Z: 1 + (tg === 'tfp' ? (d / 100) * p : 0),
  };
}

// Стационар в эффективных единицах (k̃ = K/(AL)) при постоянных параметрах P
function steady(st, P) {
  const a = st.alpha;
  const dep = st.time === 'discrete' ? (1 + P.n) * (1 + P.g) - 1 + P.delta : P.n + P.g + P.delta;
  const k = Math.pow(P.s / dep, 1 / (1 - a));
  const y = Math.pow(k, a);
  const kGR = Math.pow(a / dep, 1 / (1 - a));
  const yGR = Math.pow(kGR, a);
  const rGrowth = st.time === 'discrete' ? (1 + P.n) * (1 + P.g) - 1 : P.n + P.g; // темп роста экономики
  return {
    k, y, c: (1 - P.s) * y, i: P.s * y, w: (1 - a) * y, r: a * Math.pow(k, a - 1) - P.delta, s: P.s,
    dep, kGR, cGR: yGR - dep * kGR, sGR: a, rGR: rGrowth, growth: rGrowth,
  };
}

function validate(st) {
  const errors = [];
  const tg = st.shockTarget, d = st.shockSize;
  const sh = (key) => (tg === key ? d : 0);
  if (!(st.alpha > 0 && st.alpha < 1)) errors.push('$\\alpha$ должна лежать в $(0,1)$.');
  if (!(st.s > 0 && st.s < 1)) errors.push('$s$ должна лежать в $(0,1)$.');
  if (!(st.s + sh('s') > 0 && st.s + sh('s') < 1)) errors.push('После шока норма сбережения должна остаться в $(0,1)$.');
  if (!(st.delta >= 0) || !(st.delta + sh('delta') >= 0)) errors.push('$\\delta$ не может быть отрицательной (в том числе после шока).');
  if (!(st.n > -0.5) || !(st.n + sh('n') > -0.5)) errors.push('$n$ должен быть больше $-0.5$ (в том числе после шока).');
  const g = st.variant === 'tp' ? st.g : 0;
  if (st.variant === 'tp' && (!(g > -0.5) || !(g + sh('g') > -0.5))) errors.push('$g$ должен быть больше $-0.5$.');
  const dep = (n, gg, dl) => (st.time === 'discrete' ? (1 + n) * (1 + gg) - 1 + dl : n + gg + dl);
  if (!(dep(st.n, g, st.delta) > 0))
    errors.push(st.time === 'discrete' ? 'Нужно $(1+n)(1+g)-1+\\delta > 0$, иначе стационара нет.' : 'Нужно $n+g+\\delta > 0$, иначе стационара нет.');
  else if (st.shockPersistence === 'permanent' && !isState(st) && !(dep(st.n + sh('n'), g + sh('g'), st.delta + sh('delta')) > 0))
    errors.push('После перманентного шока стационар не существует: нужно, чтобы эффективная норма выбытия оставалась положительной.');
  if (tg === 'tfp' && st.variant !== 'tp') errors.push('Шок технологии доступен только в вариации с технологическим прогрессом.');
  if (tg === 'g' && st.variant !== 'tp') errors.push('Шок темпа роста технологии доступен только в вариации с технологическим прогрессом.');
  if (tg === 'k' && d <= -100) errors.push('Капитал не может упасть больше чем на 100%.');
  if (tg === 'tfp' && d <= -100) errors.push('Уровень $A_t$ не может упасть больше чем на 100%.');
  return errors;
}

// Траектория x_j = K/(L·(1+g₀)^t) на сетке с шагом h, j = 0..N.
// scale = 0 даёт базовый путь (экономика всё время на ТСР).
function simulate(st, h, N, scale) {
  const a = st.alpha;
  const g0 = st.variant === 'tp' ? st.g : 0;
  const ss0 = steady(st, params(st, 0, 0));
  const jHat = Math.round(st.tHat / h);
  const D = st.shockTarget === 'k' && scale ? 1 + st.shockSize / 100 : 1;
  const x = new Float64Array(N + 1), Ar = new Float64Array(N + 1), L = new Float64Array(N + 1);
  const disc = st.time === 'discrete';

  // уровень технологии относительно базового тренда
  if (disc) {
    let G = 1;
    for (let j = 0; j <= N; j++) {
      Ar[j] = G * params(st, j * h, scale).Z;
      G *= (1 + params(st, j * h, scale).g * h) / (1 + g0 * h);
    }
  } else {
    const dg = st.shockTarget === 'g' ? st.shockSize * scale : 0;
    for (let j = 0; j <= N; j++) Ar[j] = Math.exp(dg * profInt(st, j * h)) * params(st, j * h, scale).Z;
  }
  const ArAt = (t) => {
    const dg = st.shockTarget === 'g' ? st.shockSize * scale : 0;
    return Math.exp(dg * profInt(st, t)) * params(st, t, scale).Z;
  };

  L[0] = 1;
  x[0] = ss0.k * (jHat === 0 ? D : 1);
  for (let j = 0; j < N; j++) {
    const t = j * h;
    if (disc) {
      const P = params(st, t, scale);
      const yhat = Math.pow(x[j], a) * Math.pow(Ar[j], 1 - a);
      x[j + 1] = ((1 - P.delta * h) * x[j] + h * P.s * yhat) / ((1 + P.n * h) * (1 + g0 * h));
      L[j + 1] = L[j] * (1 + P.n * h);
    } else {
      // ẋ = s·x^α·Ar^{1−α} − (n + g₀ + δ)·x ; правый конец шага берём слева от t_{j+1}
      const f = (tt, xx) => {
        const P = params(st, tt, scale);
        return P.s * Math.pow(xx, a) * Math.pow(ArAt(tt), 1 - a) - (P.n + g0 + P.delta) * xx;
      };
      const tEnd = t + h - 1e-7;
      const k1 = f(t, x[j]);
      const k2 = f(t + h / 2, x[j] + (h / 2) * k1);
      const k3 = f(t + h / 2, x[j] + (h / 2) * k2);
      const k4 = f(tEnd, x[j] + h * k3);
      x[j + 1] = x[j] + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      // население: ln L = ∫ n
      const nInt = (tt) => st.n * tt + (st.shockTarget === 'n' ? st.shockSize * scale * profInt(st, tt) : 0);
      L[j + 1] = Math.exp(nInt(t + h));
    }
    if (j + 1 === jHat) x[j + 1] *= D;
    if (!(x[j + 1] > 0) || !Number.isFinite(x[j + 1])) return null;
  }
  return { x, Ar, L, ss0, g0 };
}

export function solve(st) {
  const errors = validate(st);
  if (errors.length) return { ok: false, errors };
  const disc = st.time === 'discrete';
  const h = disc ? 1 : (st.dt || 0.02);
  const N = Math.round(Math.max(st.horizon, st.tHat + 1) / h) + 1;
  const sim = simulate(st, h, N, 1);
  const base = simulate(st, h, N, 0);
  if (!sim || !base) return { ok: false, errors: ['Траектория капитала вышла за допустимую область (капитал стал неположительным).'] };
  const { x, Ar, L, ss0, g0 } = sim;
  const a = st.alpha;

  const Np = Math.round(st.horizon / h);
  const stride = Math.max(1, Math.round(0.1 / h));
  const t = [];
  const irf = { A: [], L: [], c: [], k: [], y: [], i: [], r: [], w: [], gy: [] };
  const lvl = { A: [], L: [], c: [], k: [], y: [], i: [], r: [], w: [], gy: [] };
  const baseLvl = { A: [], L: [], c: [], k: [], y: [], i: [], r: [], w: [], gy: [] };
  const eff = { c: [], k: [], y: [], i: [], w: [] }, baseEff = { c: [], k: [], y: [], i: [], w: [] };
  const agg = { c: [], k: [], y: [], i: [] }, baseAgg = { c: [], k: [], y: [], i: [] };
  const ssGrowth = 100 * g0; // темп роста выпуска на работника на ТСР, %

  // темп роста выпуска на работника
  const growthAt = (j) => {
    const P = params(st, j * h, 1);
    const yhat = (jj) => Math.pow(x[jj], a) * Math.pow(Ar[jj], 1 - a);
    if (disc) return j === 0 ? 100 * g0 : 100 * ((yhat(j) / yhat(j - 1)) * (1 + g0) - 1);
    // непрерывное: g_{y/L} = α·ẋ/x + (1−α)·[(g(t) − g₀) + Ż/Z] + g₀ (правый предел)
    const xdot = P.s * Math.pow(x[j], a) * Math.pow(Ar[j], 1 - a) - (P.n + g0 + P.delta) * x[j];
    let zdot = 0;
    if (st.shockTarget === 'tfp' && st.shockPersistence === 'temporary' && j * h >= st.tHat - 1e-7 && st.rhoS > 0)
      zdot = ((st.shockSize / 100) * Math.log(st.rhoS) * Math.pow(st.rhoS, j * h - st.tHat)) / P.Z;
    return 100 * (a * (xdot / x[j]) + (1 - a) * (P.g - g0 + zdot) + g0);
  };

  for (let j = 0; j <= Np; j += stride) {
    const tt = j * h;
    const P = params(st, tt, 1);
    const G = disc ? Math.pow(1 + g0, tt) : Math.exp(g0 * tt);
    const Lb = base.L[j];
    const yhat = Math.pow(x[j], a) * Math.pow(Ar[j], 1 - a);
    const hat = { k: x[j], y: yhat, c: (1 - P.s) * yhat, i: P.s * yhat, w: (1 - a) * yhat };
    const r = a * Math.pow(x[j] / Ar[j], a - 1) - P.delta;
    t.push(+tt.toFixed(6));
    for (const v of ['c', 'k', 'y', 'i', 'w']) {
      irf[v].push(100 * (hat[v] / ss0[v] - 1));
      lvl[v].push(hat[v] * G);
      baseLvl[v].push(ss0[v] * G);
      eff[v].push(hat[v] / Ar[j]);
      baseEff[v].push(ss0[v]);
    }
    for (const v of ['c', 'k', 'y', 'i']) { agg[v].push(hat[v] * G * L[j]); baseAgg[v].push(ss0[v] * G * Lb); }
    irf.r.push(100 * (r - ss0.r)); lvl.r.push(100 * r); baseLvl.r.push(100 * ss0.r);
    irf.A.push(100 * (Ar[j] - 1)); lvl.A.push(G * Ar[j]); baseLvl.A.push(G);
    irf.L.push(100 * (L[j] / Lb - 1)); lvl.L.push(L[j]); baseLvl.L.push(Lb);
    const gy = growthAt(j);
    irf.gy.push(gy - ssGrowth); lvl.gy.push(gy); baseLvl.gy.push(ssGrowth);
  }

  const permanent = st.shockPersistence === 'permanent' && !isState(st);
  const ssF = steady(st, permanent ? params(st, Infinity, 1) : params(st, 0, 0));
  return {
    ok: true, h: h * stride, t, irf, levels: lvl, baseLevels: baseLvl, eff, baseEff, agg, baseAgg,
    ss0, ssF, x, Ar, L, hGrid: h,
    permanentChange: Math.abs(ssF.k - ss0.k) / ss0.k > 1e-12 || st.shockTarget === 'tfp' || st.shockTarget === 'g',
    marks: { tHat: st.tHat, t0: null },
  };
}

// ───────────────────────────── Графики ─────────────────────────────

export function chartSpecs(st) {
  const cen = st.version === 'centralized';
  const tp = st.variant === 'tp';
  const D = st.time === 'discrete';
  const x = (v) => (D ? `${v}_t` : `${v}(t)`);
  const k = tp ? '\\tilde k' : 'k';
  const showL = Math.abs(st.n) > 0 || st.shockTarget === 'n';
  const specs = [
    ...(tp ? [{ id: 'A', title: 'Технология', sym: x('A'), irfUnit: '$\\Delta$(%) от тренда', noEff: true }] : []),
    ...(showL ? [{ id: 'L', title: 'Население', sym: x('L'), irfUnit: '$\\Delta$(%) от тренда', noEff: true }] : []),
    { id: 'k', title: 'Капитал', sym: x('k'), aggSym: x('K'), irfUnit: '$\\Delta$(%) от s.s.' },
    { id: 'y', title: 'Выпуск', sym: x('y'), aggSym: x('Y'), irfUnit: '$\\Delta$(%) от s.s.' },
    { id: 'c', title: 'Потребление', sym: x('c'), aggSym: x('C'), irfUnit: '$\\Delta$(%) от s.s.' },
    { id: 'i', title: 'Инвестиции', sym: x('i'), aggSym: x('I'), irfUnit: '$\\Delta$(%) от s.s.' },
    { id: 'gy', title: 'Темп роста выпуска на работника', sym: D ? 'g_{y,t}' : 'g_y(t)', irfUnit: '$\\Delta$(п.п.) от s.s.', lvlUnit: '%', noEff: true },
    cen ? { id: 'r', title: 'Доходность капитала', sym: `\\alpha ${k}^{\\alpha-1}-\\delta`, irfUnit: '$\\Delta$(п.п.) от s.s.', lvlUnit: '%', noEff: true }
        : { id: 'r', title: 'Ставка процента', sym: x('r'), irfUnit: '$\\Delta$(п.п.) от s.s.', lvlUnit: '%', noEff: true },
    cen ? { id: 'w', title: 'Предельный продукт труда', sym: tp ? `(1-\\alpha)A${k}^{\\alpha}` : `(1-\\alpha)${k}^{\\alpha}`, irfUnit: '$\\Delta$(%) от s.s.' }
        : { id: 'w', title: 'Заработная плата', sym: x('w'), irfUnit: '$\\Delta$(%) от s.s.' },
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

export function formulas(st) {
  const D = st.time === 'discrete';
  const tp = st.variant === 'tp';
  const cen = st.version === 'centralized';
  const g = tp ? st.g : 0;
  const a = st.alpha, d = st.delta, nn = st.n, sv = st.s;
  const tl = (v) => (tp ? `\\tilde ${v}` : v);
  const fs = { dec: [], cen: [], system: [], shock: [], ss: [] };
  fs.problemTitle = 'Модель';
  fs.systemTitle = 'Уравнения динамики';
  fs.ssTitle = 'Траектория сбалансированного роста';

  const popLaw = D ? 'L_{t+1}=(1+n)\\,L_t' : '\\dot L/L=n';
  const tpLaw = D ? 'A_{t+1}=(1+g)\\,A_t' : '\\dot A/A=g';
  const lawLine = tp ? `${popLaw},\\qquad ${tpLaw}` : popLaw;
  const prodT = tp ? (D ? 'Y_t=K_t^{\\alpha}(A_tL_t)^{1-\\alpha}' : 'Y=K^{\\alpha}(AL)^{1-\\alpha}')
    : (D ? 'Y_t=K_t^{\\alpha}L_t^{1-\\alpha}' : 'Y=K^{\\alpha}L^{1-\\alpha}');

  // ── децентрализованная
  if (D) {
    fs.dec.push({ agent: 'Фирмы', items: [
      tp ? '\\max_{K_t,L_t}\\; \\pi_t=K_t^{\\alpha}(A_tL_t)^{1-\\alpha}-w_tL_t-(r_t+\\delta)K_t'
         : '\\max_{K_t,L_t}\\; \\pi_t=K_t^{\\alpha}L_t^{1-\\alpha}-w_tL_t-(r_t+\\delta)K_t',
      tp ? 'r_t=\\alpha\\,\\tilde k_t^{\\alpha-1}-\\delta,\\qquad w_t=(1-\\alpha)\\,A_t\\,\\tilde k_t^{\\alpha}'
         : 'r_t=\\alpha\\,k_t^{\\alpha-1}-\\delta,\\qquad w_t=(1-\\alpha)\\,k_t^{\\alpha}',
    ] });
    fs.dec.push({ agent: 'Домохозяйства', system: true, items: [
      'C_t=(1-s)\\,Y_t,\\qquad 0<s<1\\ \\text{задана экзогенно}',
      'B_{t+1}=(1+r_t)\\,B_t+w_tL_t-C_t',
      tp ? '\\Leftrightarrow\\quad (1+n)(1+g)\\,\\tilde b_{t+1}=(1+r_t)\\,\\tilde b_t+\\tilde w_t-\\tilde c_t'
         : '\\Leftrightarrow\\quad (1+n)\\,b_{t+1}=(1+r_t)\\,b_t+w_t-c_t',
    ] });
    fs.dec.push({ agent: 'Рынки (балансовые условия)', items: [
      tp ? '\\tilde b_t=\\tilde k_t\\quad\\text{(рынок капитала)}' : 'b_t=k_t\\quad\\text{(рынок капитала)}',
    ] });
  } else {
    fs.dec.push({ agent: 'Фирмы', items: [
      tp ? '\\max_{K,L}\\; \\pi=K^{\\alpha}(AL)^{1-\\alpha}-wL-(r+\\delta)K'
         : '\\max_{K,L}\\; \\pi=K^{\\alpha}L^{1-\\alpha}-wL-(r+\\delta)K',
      tp ? 'r=\\alpha\\,\\tilde k^{\\alpha-1}-\\delta,\\qquad w=(1-\\alpha)\\,A\\,\\tilde k^{\\alpha}'
         : 'r=\\alpha\\,k^{\\alpha-1}-\\delta,\\qquad w=(1-\\alpha)\\,k^{\\alpha}',
    ] });
    fs.dec.push({ agent: 'Домохозяйства', system: true, items: [
      'C=(1-s)\\,Y,\\qquad 0<s<1\\ \\text{задана экзогенно}',
      '\\dot B=r\\,B+wL-C',
      tp ? '\\Leftrightarrow\\quad \\dot{\\tilde b}=(r-n-g)\\,\\tilde b+\\tilde w-\\tilde c'
         : '\\Leftrightarrow\\quad \\dot b=(r-n)\\,b+w-c',
    ] });
    fs.dec.push({ agent: 'Рынки (балансовые условия)', items: [
      tp ? '\\tilde b=\\tilde k\\quad\\text{(рынок капитала)}' : 'b=k\\quad\\text{(рынок капитала)}',
    ] });
  }
  fs.dec.push({ agent: 'Экзогенные процессы', items: [lawLine] });

  // ── централизованная: ресурсное ограничение экономики
  fs.cen.push({ agent: 'Экономика в целом', system: true, items: D ? [
    prodT,
    'Y_t=C_t+I_t,\\qquad I_t=s\\,Y_t',
    'K_{t+1}=(1-\\delta)\\,K_t+I_t,\\qquad K_0\\ \\text{задано}',
  ] : [
    prodT,
    'Y=C+I,\\qquad I=s\\,Y',
    '\\dot K=I-\\delta K,\\qquad K(0)\\ \\text{задано}',
  ] });
  fs.cen.push({ agent: 'Экзогенные процессы', items: [lawLine] });

  // ── основное уравнение динамики
  const k = tl('k'), c = tl('c'), ii = tp ? '\\tilde \\imath' : 'i';
  if (D) {
    const lhs = tp ? '(1+n)(1+g)' : '(1+n)';
    fs.system.push({ label: 'Основное уравнение динамики',
      tex: `${lhs}\\,${k}_{t+1}=(1-\\delta)\\,${k}_t+s\\,${k}_t^{\\alpha}`,
      num: `${n4((1 + nn) * (1 + g))}\\,${k}_{t+1}=${n4(1 - d)}\\,${k}_t+${n4(sv)}\\,${k}_t^{${n4(a)}}` });
  } else {
    fs.system.push({ label: 'Основное уравнение динамики',
      tex: `\\dot{${k}}=s\\,${k}^{\\alpha}-${tp ? '(n+g+\\delta)' : '(n+\\delta)'}\\,${k}`,
      num: `\\dot{${k}}=${n4(sv)}\\,${k}^{${n4(a)}}-${n4(nn + g + d)}\\,${k}` });
  }
  if (!cen) {
    const kk = D ? `${k}_t` : k;
    const r = D ? 'r_t' : 'r', w = D ? 'w_t' : 'w', A = tp ? (D ? 'A_t\\,' : 'A\\,') : '';
    fs.system.push({ label: 'Цены факторов (FOC фирмы)',
      tex: `${r}=\\alpha\\,${kk}^{\\alpha-1}-\\delta,\\qquad ${w}=(1-\\alpha)\\,${A}${kk}^{\\alpha}`,
      num: `${r}=${n4(a)}\\,${kk}^{${n4(a - 1)}}${pm(-d)},\\qquad ${w}=${n4(1 - a)}\\,${A}${kk}^{${n4(a)}}` });
  }
  {
    const kk = D ? `${k}_t` : k, cc = D ? `${c}_t` : c, iv = D ? `${ii}_t` : ii;
    fs.system.push({ label: 'Потребление и инвестиции',
      tex: `${cc}=(1-s)\\,${kk}^{\\alpha},\\qquad ${iv}=s\\,${kk}^{\\alpha}`,
      num: `${cc}=${n4(1 - sv)}\\,${kk}^{${n4(a)}},\\qquad ${iv}=${n4(sv)}\\,${kk}^{${n4(a)}}` });
  }

  // ── шок
  const tg = st.shockTarget;
  const persistent = st.shockPersistence === 'temporary' && SHOCK_TARGETS[tg].kind !== 'state';
  const prf = persistent ? '\\rho_s^{\\,t-\\hat t}\\,\\text{𝟙}\\{t\\ge\\hat t\\}' : '\\text{𝟙}\\{t\\ge\\hat t\\}';
  let shockTex, shockNum;
  if (tg === 'tfp') {
    shockTex = `${D ? 'A_t=(1+g)^t' : 'A(t)=e^{gt}'}\\big(1+\\varphi\\cdot ${prf}\\big)`;
    shockNum = `\\varphi=${n4(st.shockSize / 100)}`;
  } else if (tg === 'k') {
    shockTex = `${D ? 'K_{\\hat t}' : 'K(\\hat t)'}=(1+\\varphi_k)\\,${D ? 'K_{\\hat t}^{-}' : 'K(\\hat t^{-})'}`;
    shockNum = `\\varphi_k=${n4(st.shockSize / 100)}`;
  } else {
    const sym = { s: 's', n: 'n', g: 'g', delta: '\\delta' }[tg];
    shockTex = `${sym}${D ? '_t' : '(t)'}=${sym}+\\Delta ${sym}\\cdot ${prf}`;
    shockNum = `\\Delta ${sym}=${n4(st.shockSize)}`;
  }
  shockNum += `,\\qquad \\hat t=${st.tHat}`;
  if (persistent) shockNum += `,\\qquad \\rho_s=${n4(st.rhoS)}`;
  fs.shock.push({ tex: shockTex, num: shockNum });
  fs.shockInfo = `До $\\hat t = ${st.tHat}$ экономика находится на траектории сбалансированного роста. В модели Солоу норма сбережения задана экзогенно и никто не оптимизирует во времени, поэтому ожидания не влияют на динамику: объявленный заранее шок дал бы ту же траекторию, что и неожиданный.`;
  fs.flatNote = 'Шок не выводит экономику с траектории сбалансированного роста при текущих параметрах.';

  // ── стационар (ТСР)
  const depTex = D ? (tp ? '(1+n)(1+g)-1+\\delta' : 'n+\\delta') : (tp ? 'n+g+\\delta' : 'n+\\delta');
  const dep = D ? (1 + nn) * (1 + g) - 1 + d : nn + g + d;
  const kv = Math.pow(sv / dep, 1 / (1 - a));
  const yv = Math.pow(kv, a);
  const rv = a * Math.pow(kv, a - 1) - d;
  const kGR = Math.pow(a / dep, 1 / (1 - a));
  const growthTex = D ? (tp ? '(1+n)(1+g)-1' : 'n') : (tp ? 'n+g' : 'n');
  const growthV = D ? (1 + nn) * (1 + g) - 1 : nn + g;
  const eff = rv > growthV + 1e-12, gr = Math.abs(rv - growthV) <= 1e-12;
  fs.ss = [
    { tex: `${k}^*=\\left(\\dfrac{s}{${depTex}}\\right)^{\\frac{1}{1-\\alpha}}`, num: `${k}^*=${n4(kv)}` },
    { tex: `${tl('y')}^*=\\left(${k}^*\\right)^{\\alpha},\\qquad ${c}^*=(1-s)\\left(${k}^*\\right)^{\\alpha}`,
      num: `${tl('y')}^*=${n4(yv)},\\qquad ${c}^*=${n4((1 - sv) * yv)}` },
    { tex: `r^*=\\alpha\\left(${k}^*\\right)^{\\alpha-1}-\\delta`, num: `r^*=${n4(rv)}` },
    { tex: `${k}_{GR}=\\left(\\dfrac{\\alpha}{${depTex}}\\right)^{\\frac{1}{1-\\alpha}}`,
      num: `${k}_{GR}=${n4(kGR)}` },
    { tex: 's_{GR}=\\alpha', num: `s_{GR}=${n4(a)}` },
    { tex: `r^*\\ ${eff ? '>' : gr ? '=' : '<'}\\ ${growthTex}`,
      num: `${n4(rv)}\\ ${eff ? '>' : gr ? '=' : '<'}\\ ${n4(growthV)}` },
  ];
  fs.ssNote = (changed) => (changed ? 'Перманентный шок сдвигает стационар'
    : tg === 'tfp' && st.shockPersistence === 'permanent'
      ? 'В единицах на эффективного работника стационар не меняется, выпуск на работника сдвигается вверх' : 'Шок не меняет стационар');
  return fs;
}

export function steadyTable(st, res) {
  const tp = st.variant === 'tp';
  const cen = st.version === 'centralized';
  const D = st.time === 'discrete';
  const e = tp ? 'на эфф. работника' : 'на работника';
  const k = tp ? '\\tilde k' : 'k';
  const rows = [
    { sym: `${k}^*`, name: `капитал ${e}`, key: 'k' },
    { sym: tp ? '\\tilde y^*' : 'y^*', name: `выпуск ${e}`, key: 'y' },
    { sym: tp ? '\\tilde \\imath^*' : 'i^*', name: 'инвестиции', key: 'i' },
    { sym: tp ? '\\tilde c^*' : 'c^*', name: `потребление ${e}`, key: 'c' },
    { sym: tp ? '\\tilde w^*' : 'w^*', name: cen ? 'предельный продукт труда' : 'заработная плата', key: 'w' },
    { sym: 'r^*', name: cen ? 'доходность капитала' : 'ставка процента', key: 'r', pct: true },
    { sym: `${k}_{GR}`, name: 'капитал по золотому правилу', key: 'kGR' },
    { sym: tp ? '\\tilde c_{GR}' : 'c_{GR}', name: 'потребление по золотому правилу', key: 'cGR' },
  ];
  const v = (ss, r) => (r.pct ? `${(100 * ss[r.key]).toFixed(2)}%` : fmt(ss[r.key], 3));
  const out = rows.map((r) => ({ ...r, before: v(res.ss0, r), after: v(res.ssF, r) }));
  const verdict = (ss) => (Math.abs(ss.r - ss.growth) <= 1e-12 ? 'золотое правило' : ss.r > ss.growth ? 'эффективна' : 'неэффективна');
  out.push({ sym: 's\\ \\text{vs}\\ s_{GR}', name: 'динамическая эффективность', before: verdict(res.ss0), after: verdict(res.ssF) });
  return out;
}
