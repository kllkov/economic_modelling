// Модель межвременного выбора Фишера с бесконечным горизонтом планирования.
// Обозначения следуют материалам курса: b_t — активы, r — экзогенная ставка процента,
// w_t — трудовой доход, c_t — потребление; b_{t+1} = (1+r_t) b_t + w_t − c_t.
// Задача домохозяйства решается точно: путь потребления задаёт уравнение Эйлера,
// уровень — пожизненное бюджетное ограничение (хвост после горизонта суммируется аналитически).
// В подписях интерфейса фрагменты между $…$ рендерятся KaTeX.

const MIT_NOTE = 'Только неожиданный перманентный: при смене функции полезности во времени сравнение $u\'(c_t)$ и $u\'(c_{t+1})$ зависело бы от единиц измерения $c$';

const SHOCK_TARGETS = {
  b:     { label: 'Активы $b_t$', kind: 'state', unit: 'abs', def: 2, step: 0.5,
           note: 'Разовое изменение активов $\\Delta b$ (наследство, потеря сбережений)' },
  w:     { label: 'Трудовой доход $w_t$', kind: 'param', group: 'state', unit: '%', def: -10, step: 1 },
  r:     { label: 'Ставка процента $r$', kind: 'param', unit: 'Δ', def: 0.01, step: 0.005,
           note: 'Абсолютное изменение $\\Delta r$' },
  beta:  { label: 'Дисконт-фактор $\\beta$', kind: 'param', unit: 'Δ', def: 0.01, step: 0.005, time: 'discrete',
           note: 'Абсолютное изменение $\\Delta\\beta$' },
  rho:   { label: 'Ставка дисконтирования $\\rho$', kind: 'param', unit: 'Δ', def: -0.01, step: 0.005, time: 'continuous',
           note: 'Абсолютное изменение $\\Delta\\rho$' },
  sigma: { label: 'Неприятие риска $\\sigma$', kind: 'param', unit: 'Δ', def: 1, step: 0.25, utility: 'crra', onlyMIT: true,
           note: `Абсолютное изменение $\\Delta\\sigma$. ${MIT_NOTE}` },
  theta: { label: 'Неприятие риска $\\theta$', kind: 'param', unit: 'Δ', def: 0.5, step: 0.1, utility: 'cara', onlyMIT: true,
           note: `Абсолютное изменение $\\Delta\\theta$. ${MIT_NOTE}` },
};

export const meta = { id: 'fisher', title: 'Модель Фишера', subtitle: 'Fisher intertemporal choice model', ready: true };

export const defaults = {
  time: 'discrete', variant: 'const', utility: 'crra',
  beta: 0.96, rho: 0.04, sigma: 2, theta: 1, r: 0.05, w: 1, b0: 0, gw: 0.02,
  shockTarget: 'r', shockSize: 0.01, shockTiming: 'unexpected', tHat: 10, t0: 3,
  shockPersistence: 'permanent', rhoS: 0.8,
  horizon: 40,
};

function shockTargetsFor(s) {
  return Object.entries(SHOCK_TARGETS)
    .filter(([, d]) => (!d.time || d.time === s.time) && (!d.utility || d.utility === s.utility))
    .sort(([, a], [, b]) => ((a.group ?? a.kind) === 'state' ? 0 : 1) - ((b.group ?? b.kind) === 'state' ? 0 : 1))
    .map(([v, d]) => ({ v, l: d.label }));
}

export const controls = [
  { section: 'Модель' },
  { id: 'time', label: 'Время', type: 'segmented',
    options: [{ v: 'discrete', l: 'Дискретное' }, { v: 'continuous', l: 'Непрерывное' }] },
  { id: 'variant', label: 'Вариация', type: 'select',
    options: [
      { v: 'const', l: 'Постоянный трудовой доход' },
      { v: 'growing', l: 'Растущий трудовой доход' },
    ] },

  { section: 'Функции' },
  { id: 'utility', label: 'Полезность домохозяйства', type: 'select',
    options: [{ v: 'crra', l: 'CRRA' }, { v: 'log', l: 'Логарифмическая' }, { v: 'cara', l: 'CARA' }] },

  { section: 'Параметры' },
  { id: 'r', label: '$r$ — ставка процента', type: 'number', min: -0.05, max: 0.5, step: 0.005 },
  { id: 'beta', label: '$\\beta$ — дисконт-фактор', type: 'number', min: 0.5, max: 0.999, step: 0.005,
    show: (s) => s.time === 'discrete' },
  { id: 'rho', label: '$\\rho$ — ставка дисконтирования', type: 'number', min: 0.001, max: 0.5, step: 0.005,
    show: (s) => s.time === 'continuous' },
  { id: 'sigma', label: '$\\sigma$ — неприятие риска', type: 'number', min: 0.1, max: 10, step: 0.1,
    show: (s) => s.utility === 'crra' },
  { id: 'theta', label: '$\\theta$ — неприятие риска', type: 'number', min: 0.05, max: 10, step: 0.05,
    show: (s) => s.utility === 'cara' },
  { id: 'w', label: (s) => (s.variant === 'growing' ? '$w_0$ — начальный доход' : '$w$ — трудовой доход'), type: 'number', min: 0, max: 100, step: 0.1 },
  { id: 'gw', label: '$g_w$ — темп роста дохода', type: 'number', min: -0.05, max: 0.2, step: 0.005,
    show: (s) => s.variant === 'growing' },
  { id: 'b0', label: '$b_0$ — начальные активы', type: 'number', min: -100, max: 100, step: 0.5 },

  { section: 'Шок' },
  { id: 'shockTarget', label: 'На что шок', type: 'select', rich: true, options: shockTargetsFor,
    groupLabel: (v) => ((SHOCK_TARGETS[v]?.group ?? SHOCK_TARGETS[v]?.kind) === 'state' ? 'state-переменные' : 'параметры') },
  { id: 'shockSize', label: (s) => ({ '%': 'Величина, %', abs: 'Величина, $\\Delta b$' }[SHOCK_TARGETS[s.shockTarget]?.unit] || 'Величина, $\\Delta$'),
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
  { id: 'horizon', label: 'Горизонт графиков', type: 'number', min: 10, max: 200, step: 5 },
];

export function normalize(s, changed) {
  const allowed = shockTargetsFor(s).map((o) => o.v);
  if (!allowed.includes(s.shockTarget)) {
    if (s.shockTarget === 'beta' && allowed.includes('rho')) s.shockTarget = 'rho';
    else if (s.shockTarget === 'rho' && allowed.includes('beta')) s.shockTarget = 'beta';
    else s.shockTarget = 'r';
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

function buildPaths(s, N, h, withShock) {
  const P = { r: [], B: [], sig: [], th: [], w: [], T: new Float64Array(N + 2) };
  const tg = s.shockTarget, size = withShock ? s.shockSize : 0;
  const gw = s.variant === 'growing' ? s.gw : 0;
  for (let j = 0; j <= N + 1; j++) {
    const t = j * h;
    const prof = SHOCK_TARGETS[tg].kind === 'state' ? 0 : shockProfile(s, t);
    const r = s.r + (tg === 'r' ? size * prof : 0);
    P.r.push(r);
    if (s.time === 'discrete') P.B.push(s.beta + (tg === 'beta' ? size * prof : 0));
    else P.B.push(Math.exp(-(s.rho + (tg === 'rho' ? size * prof : 0)) * h));
    P.sig.push(s.utility === 'log' ? 1 : s.sigma + (tg === 'sigma' ? size * prof : 0));
    P.th.push(s.theta + (tg === 'theta' ? size * prof : 0));
    P.w.push(s.w * Math.pow(1 + gw * h, j) * (1 + (tg === 'w' ? (size / 100) * prof : 0)));
  }
  return P;
}

// Условия конечности пожизненного богатства и полезности для постоянных параметров
function checkConstants(s, r, beta, rho, sig, th, label) {
  const errs = [];
  const gw = s.variant === 'growing' ? s.gw : 0;
  const D = s.time === 'discrete';
  if (D && !(r > -1)) errs.push(`${label}ставка процента должна быть больше $-1$.`);
  if (gw !== 0 || s.w !== 0) {
    if (!(r > gw)) errs.push(`${label}человеческое богатство бесконечно: нужно $r > g_w$.`);
  }
  if (s.utility === 'cara') {
    if (!(r > 0)) errs.push(`${label}при CARA нужно $r > 0$, иначе приведённая стоимость потребления бесконечна.`);
  } else if (D) {
    const gamma = Math.pow(beta * (1 + r), 1 / sig);
    if (!(gamma < 1 + r)) errs.push(`${label}нужно $[\\beta(1+r)]^{1/\\sigma} < 1+r$, иначе домохозяйство бесконечно откладывает потребление.`);
  } else if (!(rho - (1 - sig) * r > 0)) errs.push(`${label}нужно $\\rho > (1-\\sigma)\\,r$, иначе домохозяйство бесконечно откладывает потребление.`);
  return errs;
}

function validate(s) {
  const errors = [];
  if (s.time === 'discrete' && !(s.beta > 0 && s.beta < 1)) errors.push('$\\beta$ должен лежать в $(0,1)$.');
  if (s.time === 'continuous' && !(s.rho > 0)) errors.push('$\\rho$ должна быть положительной.');
  if (s.utility === 'crra' && !(s.sigma > 0)) errors.push('$\\sigma$ должна быть положительной.');
  if (s.utility === 'cara' && !(s.theta > 0)) errors.push('$\\theta$ должна быть положительной.');
  if (!(s.w >= 0)) errors.push('Трудовой доход не может быть отрицательным.');
  if (SHOCK_TARGETS[s.shockTarget]?.onlyMIT && (s.shockTiming === 'expected' || s.shockPersistence === 'temporary'))
    errors.push('Шок параметра неприятия риска допускается только неожиданным и перманентным.');
  if (s.shockTiming === 'expected' && !(s.t0 < s.tHat))
    errors.push('Для ожидаемого шока момент объявления $t_0$ должен быть раньше $\\hat t$.');
  if (s.shockTarget === 'w' && s.shockSize <= -100) errors.push('Доход не может упасть больше чем на 100%.');
  const sig = s.utility === 'log' ? 1 : s.sigma;
  errors.push(...checkConstants(s, s.r, s.beta, s.rho, sig, s.theta, ''));
  // после перманентного шока параметры должны удовлетворять тем же условиям
  if (!errors.length && s.shockPersistence === 'permanent' && SHOCK_TARGETS[s.shockTarget].kind !== 'state') {
    const d = s.shockSize, tg = s.shockTarget;
    errors.push(...checkConstants(s, s.r + (tg === 'r' ? d : 0), s.beta + (tg === 'beta' ? d : 0), s.rho + (tg === 'rho' ? d : 0),
      s.utility === 'log' ? 1 : s.sigma + (tg === 'sigma' ? d : 0), s.theta + (tg === 'theta' ? d : 0), 'После шока '));
  }
  if (tgInvalid(s)) errors.push('Неверная цель шока.');
  return errors;
}
const tgInvalid = (s) => !SHOCK_TARGETS[s.shockTarget];

// Оптимальный план с момента js при богатстве V = R_js·b_js и путях P.
// Возвращает c_j (j ≥ js), а также пожизненное богатство W и человеческое богатство H в момент js.
function plan(s, P, js, bjs, h, N) {
  const util = s.utility;
  const R = (j) => 1 + h * P.r[j];
  const disc = new Float64Array(N + 1), m = new Float64Array(N + 1);
  disc[js] = 1; m[js] = util === 'cara' ? 0 : 1;
  for (let j = js + 1; j <= N; j++) {
    disc[j] = disc[j - 1] / R(j);
    const g = P.B[j - 1] * R(j);
    m[j] = util === 'cara' ? m[j - 1] + Math.log(g) / P.th[j - 1] : m[j - 1] * Math.pow(g, 1 / P.sig[j - 1]);
  }
  let Sm = 0, Sd = 0, Sw = 0, ST = 0;
  for (let j = js; j <= N; j++) {
    Sd += disc[j] * h; Sw += disc[j] * h * P.w[j];
    if (util === 'cara') Sm += disc[j] * h * m[j]; else Sm += disc[j] * h * m[j];
    if (j > js) ST += disc[j - 1] * P.T[j];
  }
  // хвост после N: параметры постоянны, доход растёт с постоянным темпом
  const RF = R(N), x = 1 / RF;
  const Gw = P.w[N + 1] / P.w[N];
  const qw = Gw * x;
  Sw += disc[N] * h * P.w[N] * qw / (1 - qw);
  let tailC1 = 0, tailC0 = 0; // вклад хвоста: c_js·tailC1 + tailC0
  if (util === 'cara') {
    const dlt = Math.log(P.B[N] * RF) / P.th[N];
    tailC1 = disc[N] * h * x / (1 - x);
    tailC0 = disc[N] * h * (m[N] * x / (1 - x) + dlt * x / ((1 - x) * (1 - x)));
  } else {
    const q = Math.pow(P.B[N] * RF, 1 / P.sig[N]) * x;
    tailC1 = disc[N] * h * m[N] * q / (1 - q);
  }
  const V = R(js) * bjs;
  const W = V + Sw + ST; // пожизненное богатство: финансовое + человеческое (+ ожидаемые трансферты)
  let cjs;
  if (util === 'cara') cjs = (W - Sm - tailC0) / (Sd + tailC1);
  else cjs = W / (Sm + tailC1);
  const c = new Float64Array(N + 1);
  for (let j = js; j <= N; j++) c[j] = util === 'cara' ? cjs + m[j] : cjs * m[j];
  return { c, W, H: Sw, cjs };
}

export function solve(s) {
  const errors = validate(s);
  if (errors.length) return { ok: false, errors };
  const D = s.time === 'discrete';
  const h = D ? 1 : (s.dt || 0.02);
  const Tsolve = Math.max(600, s.horizon + 400, s.tHat + 400);
  const N = Math.round(Tsolve / h);
  const jHat = Math.round(s.tHat / h);
  const expected = s.shockTiming === 'expected' && s.t0 < s.tHat;
  const js = expected ? Math.round(s.t0 / h) : jHat;

  const Pb = buildPaths(s, N, h, false);
  const Ps = buildPaths(s, N, h, true);
  if (s.shockTarget === 'b' && expected) Ps.T[jHat] = s.shockSize;

  // базовый план из t = 0
  const base = plan(s, Pb, 0, s.b0, h, N);
  if (s.utility !== 'cara' && !(base.W > 0)) return { ok: false, errors: ['Пожизненное богатство неположительно: домохозяйству нечего потреблять. Увеличьте доход или начальные активы.'] };
  const bb = new Float64Array(N + 2); bb[0] = s.b0;
  for (let j = 0; j <= N; j++) bb[j + 1] = (1 + h * Pb.r[j]) * bb[j] + h * (Pb.w[j] - base.c[j]);

  // план после новости: до js — базовый путь, в js — пересчёт
  let bjs = bb[js];
  if (s.shockTarget === 'b' && !expected) bjs += s.shockSize;
  const sh = plan(s, Ps, js, bjs, h, N);
  if (s.utility !== 'cara' && !(sh.W > 0)) return { ok: false, errors: ['После шока пожизненное богатство неположительно. Уменьшите величину шока.'] };
  const c = new Float64Array(N + 1), b = new Float64Array(N + 2);
  for (let j = 0; j < js; j++) { c[j] = base.c[j]; b[j] = bb[j]; }
  b[js] = bjs;
  for (let j = js; j <= N; j++) {
    c[j] = sh.c[j];
    b[j + 1] = (1 + h * Ps.r[j]) * b[j] + h * (Ps.w[j] - c[j]) + Ps.T[j + 1];
  }

  const Np = Math.round(s.horizon / h);
  const stride = Math.max(1, Math.round(0.1 / h));
  const t = [];
  const lv = { c: [], b: [], y: [], s: [], w: [], r: [] }, bl = { c: [], b: [], y: [], s: [], w: [], r: [] };
  for (let j = 0; j <= Np; j += stride) {
    t.push(+(j * h).toFixed(6));
    const yS = Ps.w[j] + Ps.r[j] * b[j], yB = Pb.w[j] + Pb.r[j] * bb[j];
    lv.c.push(c[j]); bl.c.push(base.c[j]);
    lv.b.push(b[j]); bl.b.push(bb[j]);
    lv.y.push(yS); bl.y.push(yB);
    lv.s.push(yS - c[j]); bl.s.push(yB - base.c[j]);
    lv.w.push(Ps.w[j]); bl.w.push(Pb.w[j]);
    lv.r.push(100 * Ps.r[j]); bl.r.push(100 * Pb.r[j]);
  }
  const yPositive = bl.y.every((v) => v > 1e-9) && lv.y.every((v) => v > 1e-9);
  const pct = (a, z) => a.map((v, i) => 100 * (v / z[i] - 1));
  const abs = (a, z) => a.map((v, i) => v - z[i]);
  const irf = {
    c: s.utility === 'cara' && bl.c.some((v) => v <= 0) ? abs(lv.c, bl.c) : pct(lv.c, bl.c),
    b: abs(lv.b, bl.b),
    y: yPositive ? pct(lv.y, bl.y) : abs(lv.y, bl.y),
    s: abs(lv.s, bl.s),
    w: bl.w.every((v) => v > 0) ? pct(lv.w, bl.w) : abs(lv.w, bl.w),
    r: abs(lv.r, bl.r),
  };

  // план в момент пересчёта js: без шока и с шоком
  const baseAtJs = plan(s, Pb, js, bb[js], h, N);
  // наклон траектории потребления в момент js: дискретно — c_{t+1}/c_t (CARA: c_{t+1}−c_t),
  // непрерывно — темп ċ/c (CARA: ċ) в единицу времени
  const g1 = (P, j) => {
    const lg = Math.log(P.B[j] * (1 + h * P.r[j + 1]));
    if (s.utility === 'cara') return lg / P.th[j] / h;
    return D ? Math.exp(lg / P.sig[j]) : lg / P.sig[j] / h;
  };
  const summary = {
    before: { W: baseAtJs.W, H: baseAtJs.H, c: baseAtJs.cjs, g: g1(Pb, js), mpc: baseAtJs.cjs / baseAtJs.W },
    after: { W: sh.W, H: sh.H, c: sh.cjs, g: g1(Ps, js), mpc: sh.cjs / sh.W },
    tjs: js * h,
  };
  return {
    ok: true, h: h * stride, t, irf, levels: lv, baseLevels: bl, summary, yPct: yPositive,
    marks: { tHat: s.tHat, t0: expected ? s.t0 : null },
  };
}

// ───────────────────────────── Графики ─────────────────────────────

export function chartSpecs(s) {
  const D = s.time === 'discrete';
  const x = (v) => (D ? `${v}_t` : `${v}(t)`);
  const rb = D ? 'r_t b_t' : 'r\\,b';
  return [
    { id: 'c', title: 'Потребление', sym: x('c'), irfUnit: '$\\Delta$(%) от базового пути' },
    { id: 'b', title: 'Активы', sym: x('b'), irfUnit: '$\\Delta$ от базового пути' },
    { id: 'y', title: 'Доход', sym: D ? `y_t = w_t + ${rb}` : `y = w + ${rb}`, irfUnit: '$\\Delta$(%) от базового пути' },
    { id: 's', title: 'Сбережения', sym: D ? 's_t = y_t - c_t' : 's = y - c', irfUnit: '$\\Delta$ от базового пути' },
    { id: 'w', title: 'Трудовой доход', sym: x('w'), irfUnit: '$\\Delta$(%) от базового пути' },
    { id: 'r', title: 'Ставка процента', sym: x('r'), irfUnit: '$\\Delta$(п.п.) от базового пути', lvlUnit: '%' },
  ];
}

// ───────────────────────────── Формулы ─────────────────────────────

function fmtTex(x, d = 4) {
  if (!Number.isFinite(x)) return '?';
  let t = x.toFixed(d);
  if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '');
  return t === '-0' ? '0' : t;
}
const n4 = (x) => fmtTex(x, 4);
const fmt = (x, d = 3) => (Number.isFinite(x) ? fmtTex(x, d).replace('-', '−') : '—');

export function formulas(s) {
  const D = s.time === 'discrete';
  const ut = s.utility;
  const sig = ut === 'log' ? 1 : s.sigma;
  const grow = s.variant === 'growing';
  const r = s.r, gw = grow ? s.gw : 0;
  const fs = { problem: [], system: [], shock: [], ss: [] };
  fs.systemTitle = 'Условия оптимальности';
  fs.ssTitle = 'Оптимальное потребление';
  fs.ssCols = ['без шока', 'с шоком'];
  fs.ssNote = (changed) => (changed ? 'Значения в момент пересчёта плана' : 'Шок не меняет план');
  fs.flatNote = 'Шок не меняет оптимальный план: при текущих параметрах он не влияет ни на пожизненное богатство, ни на уравнение Эйлера.';

  const U = (c) => (ut === 'crra' ? `\\dfrac{${c}^{\\,1-\\sigma}-1}{1-\\sigma}` : ut === 'log' ? `\\ln ${c}` : `-\\dfrac{1}{\\theta}\\,e^{-\\theta ${c}}`);
  const cT = D ? '{c_t}' : 'c(t)';
  const wLaw = D ? (grow ? 'w_t=w_0\\,(1+g_w)^t' : 'w_t=w') : (grow ? 'w(t)=w_0\\,e^{g_w t}' : 'w(t)=w');

  fs.problem.push({ agent: 'Домохозяйство', system: true, items: D ? [
    `\\max_{\\{c_t\\}_{t=0}^{\\infty}}\\; V_0=\\sum_{t=0}^{\\infty}\\beta^t\\,${U(cT)}`,
    '\\text{s.t.}\\quad b_{t+1}=(1+r)\\,b_t+w_t-c_t,\\qquad b_0\\ \\text{задано}',
    '\\text{No-Ponzi:}\\quad \\lim_{T\\to\\infty}\\dfrac{b_T}{(1+r)^T}\\ge 0',
  ] : [
    `\\max_{c(t)}\\; V_0=\\int_0^{\\infty}e^{-\\rho t}\\,${U(cT)}\\,dt`,
    '\\text{s.t.}\\quad \\dot b=r\\,b+w(t)-c(t),\\qquad b(0)\\ \\text{задано}',
    '\\text{No-Ponzi:}\\quad \\lim_{t\\to\\infty}e^{-rt}\\,b(t)\\ge 0',
  ], notes: [`${wLaw},\\qquad r\\ \\text{— экзогенна}`] });

  // уравнение Эйлера
  let euler, eulerN;
  if (D) {
    const gB = s.beta * (1 + r);
    if (ut === 'cara') {
      euler = '\\dfrac{u\'(c_t)}{u\'(c_{t+1})}=\\beta(1+r)\\ \\Rightarrow\\ c_{t+1}-c_t=\\dfrac{\\ln\\big[\\beta(1+r)\\big]}{\\theta}';
      eulerN = `c_{t+1}-c_t=\\dfrac{\\ln(${n4(s.beta)}\\cdot ${n4(1 + r)})}{${n4(s.theta)}}=${n4(Math.log(gB) / s.theta)}`;
    } else if (ut === 'log') {
      euler = '\\dfrac{u\'(c_t)}{u\'(c_{t+1})}=\\beta(1+r)\\ \\Rightarrow\\ \\dfrac{c_{t+1}}{c_t}=\\beta(1+r)';
      eulerN = `\\dfrac{c_{t+1}}{c_t}=${n4(s.beta)}\\cdot ${n4(1 + r)}=${n4(gB)}`;
    } else {
      euler = '\\dfrac{u\'(c_t)}{u\'(c_{t+1})}=\\beta(1+r)\\ \\Rightarrow\\ \\dfrac{c_{t+1}}{c_t}=\\big[\\beta(1+r)\\big]^{1/\\sigma}';
      eulerN = `\\dfrac{c_{t+1}}{c_t}=(${n4(s.beta)}\\cdot ${n4(1 + r)})^{1/${n4(sig)}}=${n4(Math.pow(gB, 1 / sig))}`;
    }
  } else if (ut === 'cara') {
    euler = '\\dot c=\\dfrac{r-\\rho}{\\theta}'; eulerN = `\\dot c=\\dfrac{${n4(r)}-${n4(s.rho)}}{${n4(s.theta)}}=${n4((r - s.rho) / s.theta)}`;
  } else if (ut === 'log') {
    euler = '\\dfrac{\\dot c}{c}=r-\\rho'; eulerN = `\\dfrac{\\dot c}{c}=${n4(r)}-${n4(s.rho)}=${n4(r - s.rho)}`;
  } else {
    euler = '\\dfrac{\\dot c}{c}=\\dfrac{r-\\rho}{\\sigma}'; eulerN = `\\dfrac{\\dot c}{c}=\\dfrac{${n4(r)}-${n4(s.rho)}}{${n4(sig)}}=${n4((r - s.rho) / sig)}`;
  }
  fs.system.push({ label: 'Уравнение Эйлера', tex: euler, num: eulerN });

  // пожизненное бюджетное ограничение и богатство
  let H, budget, Wtex;
  if (D) {
    H = s.w * (1 + r) / (r - gw);
    budget = '\\sum_{t=0}^{\\infty}\\dfrac{c_t}{(1+r)^t}=(1+r)\\,b_0+\\sum_{t=0}^{\\infty}\\dfrac{w_t}{(1+r)^t}\\equiv W_0';
    Wtex = grow ? `W_0=(1+r)\\,b_0+\\dfrac{w_0(1+r)}{r-g_w}` : 'W_0=(1+r)\\,b_0+\\dfrac{w(1+r)}{r}';
  } else {
    H = s.w / (r - gw);
    budget = '\\int_0^{\\infty}e^{-rt}c(t)\\,dt=b_0+\\int_0^{\\infty}e^{-rt}w(t)\\,dt\\equiv W_0';
    Wtex = grow ? 'W_0=b_0+\\dfrac{w_0}{r-g_w}' : 'W_0=b_0+\\dfrac{w}{r}';
  }
  const W = (D ? (1 + r) * s.b0 : s.b0) + H;
  fs.system.push({ label: 'Пожизненное бюджетное ограничение', tex: budget, num: `W_0=${n4(D ? (1 + r) * s.b0 : s.b0)}+${n4(H)}=${n4(W)}` });

  // шок
  const tg = s.shockTarget;
  const persistent = s.shockPersistence === 'temporary' && SHOCK_TARGETS[tg].kind !== 'state';
  const prof = persistent ? '\\rho_s^{\\,t-\\hat t}\\,\\text{𝟙}\\{t\\ge\\hat t\\}' : '\\text{𝟙}\\{t\\ge\\hat t\\}';
  let shockTex, shockNum;
  if (tg === 'b') {
    shockTex = `${D ? 'b_{\\hat t}' : 'b(\\hat t)'}=${D ? 'b_{\\hat t}^{-}' : 'b(\\hat t^{-})'}+\\Delta b`;
    shockNum = `\\Delta b=${n4(s.shockSize)}`;
  } else if (tg === 'w') {
    shockTex = `${D ? 'w_t' : 'w(t)'}=${D ? (grow ? 'w_0(1+g_w)^t' : 'w') : (grow ? 'w_0e^{g_wt}' : 'w')}\\big(1+\\varphi\\cdot ${prof}\\big)`;
    shockNum = `\\varphi=${n4(s.shockSize / 100)}`;
  } else {
    const sym = { r: 'r', beta: '\\beta', rho: '\\rho', sigma: '\\sigma', theta: '\\theta' }[tg];
    shockTex = `${sym}${D ? '_t' : '(t)'}=${sym}+\\Delta ${sym}\\cdot ${prof}`;
    shockNum = `\\Delta ${sym}=${n4(s.shockSize)}`;
  }
  shockNum += `,\\qquad \\hat t=${s.tHat}`;
  if (persistent) shockNum += `,\\qquad \\rho_s=${n4(s.rhoS)}`;
  fs.shock.push({ tex: shockTex, num: shockNum });
  fs.shockInfo = s.shockTiming === 'expected' && s.t0 < s.tHat
    ? `Ожидаемый шок: объявлен в $t_0 = ${s.t0}$, происходит в $\\hat t = ${s.tHat}$. С момента $t_0$ домохозяйство знает весь будущий путь и сразу пересчитывает план.`
    : `Неожиданный (MIT) шок: до $\\hat t = ${s.tHat}$ домохозяйство следует исходному плану; в $\\hat t$ узнаёт о шоке и пересчитывает план.`;

  // функция потребления
  if (D) {
    if (ut === 'cara') {
      const dl = Math.log(s.beta * (1 + r)) / s.theta;
      fs.ss = [
        { tex: '\\Delta=\\dfrac{\\ln\\big[\\beta(1+r)\\big]}{\\theta}', num: `\\Delta=${n4(dl)}` },
        { tex: 'c_0=\\dfrac{r}{1+r}\\,W_0-\\dfrac{\\Delta}{r}', num: `c_0=${n4(r / (1 + r))}\\cdot ${n4(W)}-\\dfrac{${n4(dl)}}{${n4(r)}}=${n4((r / (1 + r)) * W - dl / r)}` },
      ];
    } else {
      const gm = Math.pow(s.beta * (1 + r), 1 / sig);
      fs.ss = [
        ...(ut === 'log' ? [] : [{ tex: '\\gamma=\\big[\\beta(1+r)\\big]^{1/\\sigma}', num: `\\gamma=${n4(gm)}` }]),
        { tex: ut === 'log' ? 'c_0=(1-\\beta)\\,W_0' : 'c_0=\\Big(1-\\dfrac{\\gamma}{1+r}\\Big)W_0',
          num: `c_0=${n4(1 - gm / (1 + r))}\\cdot ${n4(W)}=${n4((1 - gm / (1 + r)) * W)}` },
      ];
    }
  } else if (ut === 'cara') {
    const dl = (r - s.rho) / s.theta;
    fs.ss = [{ tex: 'c_0=r\\,W_0-\\dfrac{\\Delta}{r},\\qquad \\Delta=\\dfrac{r-\\rho}{\\theta}', num: `c_0=${n4(r)}\\cdot ${n4(W)}-\\dfrac{${n4(dl)}}{${n4(r)}}=${n4(r * W - dl / r)}` }];
  } else {
    const mpc = (s.rho - (1 - sig) * r) / sig;
    fs.ss = [{ tex: ut === 'log' ? 'c_0=\\rho\\,W_0' : 'c_0=\\dfrac{\\rho-(1-\\sigma)\\,r}{\\sigma}\\,W_0', num: `c_0=${n4(mpc)}\\cdot ${n4(W)}=${n4(mpc * W)}` }];
  }
  fs.ss.unshift({ tex: Wtex, num: `W_0=${n4(W)}` });
  return fs;
}

export function steadyTable(s, res) {
  const D = s.time === 'discrete';
  const ts = res.summary.tjs;
  const sub = D ? `_{${ts}}` : `(${ts})`;
  const rows = [
    { sym: `W${sub}`, name: 'пожизненное богатство', key: 'W' },
    { sym: `H${sub}`, name: 'человеческое богатство (приведённый доход)', key: 'H' },
    { sym: `c${sub}`, name: 'потребление в момент пересчёта плана', key: 'c' },
    { sym: `c${sub}/W${sub}`, name: 'склонность к потреблению из богатства', key: 'mpc' },
    s.utility === 'cara'
      ? { sym: D ? 'c_{t+1}-c_t' : '\\dot c', name: 'прирост потребления', key: 'g' }
      : { sym: D ? 'c_{t+1}/c_t' : '\\dot c/c', name: D ? 'рост потребления' : 'темп роста потребления', key: 'g' },
  ];
  return rows.map((r) => ({ ...r, before: fmt(res.summary.before[r.key], 4), after: fmt(res.summary.after[r.key], 4) }));
}
