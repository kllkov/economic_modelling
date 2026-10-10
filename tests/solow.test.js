// Проверки модели Солоу против аналитических решений.
import { solve, defaults, formulas, steadyTable, chartSpecs } from '../site/assets/js/models/solow.js';
import assert from 'node:assert/strict';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const run = (o) => { const r = solve({ ...defaults, ...o }); assert.ok(r.ok, JSON.stringify(r.errors)); return r; };
const idx = (r, t) => r.t.findIndex((x) => Math.abs(x - t) < 1e-9);

// 1. Стационар: k̃* = (s/dep)^{1/(1−α)}, dep = (1+n)(1+g)−1+δ (дискр.) / n+g+δ (непр.)
{
  const a = 0.3, s = 0.2, d = 0.05, n = 0.01, g = 0.02;
  let r = run({ shockSize: 0 });
  near(r.ss0.k, Math.pow(s / ((1 + n) * (1 + g) - 1 + d), 1 / (1 - a)), 1e-12, 'k* дискр.');
  r = run({ time: 'continuous', shockSize: 0 });
  near(r.ss0.k, Math.pow(s / (n + g + d), 1 / (1 - a)), 1e-12, 'k* непр.');
  near(r.ss0.r, a * Math.pow(r.ss0.k, a - 1) - d, 1e-12, 'r*');
  near(r.ss0.kGR, Math.pow(a / (n + g + d), 1 / (1 - a)), 1e-12, 'k_GR');
  // без шока траектория стоит на месте
  assert.ok(r.irf.k.every((v) => Math.abs(v) < 1e-9), 'без шока IRF = 0');
}

// 2. Непрерывное время: точное решение Бернулли k̃^{1−α}(t) = k̃*^{1−α} + (k̃0^{1−α} − k̃*^{1−α}) e^{−(1−α)(n+g+δ)t}
{
  const a = 0.3, d = 0.05, n = 0.01, g = 0.02, lam = (1 - a) * (n + g + d);
  const r = run({ time: 'continuous', shockTarget: 'k', shockSize: -50, tHat: 0, horizon: 80 });
  const ks = r.ss0.k, k0 = 0.5 * ks;
  let maxErr = 0;
  r.t.forEach((t, i) => {
    const exact = Math.pow(Math.pow(ks, 1 - a) + (Math.pow(k0, 1 - a) - Math.pow(ks, 1 - a)) * Math.exp(-lam * t), 1 / (1 - a));
    maxErr = Math.max(maxErr, Math.abs(r.eff.k[i] / exact - 1));
  });
  assert.ok(maxErr < 1e-9, `RK4 vs точное решение: ${maxErr}`);
}

// 3. Дискретное время: рекурсия (1+n)(1+g)k̃' = (1−δ)k̃ + s k̃^α
{
  const a = 0.3, s = 0.2, d = 0.05, n = 0.01, g = 0.02;
  const r = run({ shockTarget: 'k', shockSize: -40, tHat: 3, horizon: 60 });
  let k = r.ss0.k;
  for (let t = 0; t < 60; t++) {
    if (t === 3) k *= 0.6;
    near(r.eff.k[t], k, 1e-12, `k̃_${t}`);
    k = ((1 - d) * k + s * Math.pow(k, a)) / ((1 + n) * (1 + g));
  }
}

// 4. Перманентный рост s: сходимость к новому стационару; темп роста y/L — временно выше g, затем → g
{
  const r = run({ shockTarget: 's', shockSize: 0.05, tHat: 10, horizon: 200 });
  const ksNew = Math.pow(0.25 / (1.01 * 1.02 - 1 + 0.05), 1 / 0.7);
  near(r.ssF.k, ksNew, 1e-12, 'k* после роста s');
  near(r.eff.k.at(-1), ksNew, 1e-3 * ksNew, 'сходимость к новому k*');
  assert.ok(r.levels.gy[11] > 2 + 0.1, 'темп роста y/L временно выше g');
  near(r.levels.gy.at(-1), 2, 0.01, 'в долгосрочном периоде темп роста y/L → g');
  near(r.irf.c[10], -100 * 0.05 / 0.8, 1e-9, 'в момент шока потребление падает на Δs/(1−s)');
}

// 5. Перманентный рост уровня A на 10%: k̃ падает, затем возвращается; y/L в долгосрочном периоде +10% (эффект уровня)
{
  for (const time of ['discrete', 'continuous']) {
    const r = run({ time, shockTarget: 'tfp', shockSize: 10, tHat: 5, horizon: 200 });
    near(r.irf.y.at(-1), 10, 0.01, `эффект уровня TFP, ${time}`);
    near(r.ssF.k, r.ss0.k, 1e-12, 'k̃* не меняется');
  }
}

// 6. Перманентный рост g: темп роста y/L → g + Δg (эффект роста), k̃* падает
{
  for (const time of ['discrete', 'continuous']) {
    const r = run({ time, shockTarget: 'g', shockSize: 0.01, tHat: 5, horizon: 200 });
    near(r.levels.gy.at(-1), 3, 0.01, `эффект роста, ${time}`);
    assert.ok(r.ssF.k < r.ss0.k, 'k̃* ниже при большем g');
    near(r.eff.k.at(-1), r.ssF.k, 2e-3 * r.ssF.k, `сходимость k̃ после шока g, ${time}`);
  }
}

// 7. Непрерывное время: темп роста y/L совпадает с численной производной ln(y/L)
{
  const r = run({ time: 'continuous', shockTarget: 's', shockSize: 0.05, tHat: 10, horizon: 60 });
  const i = idx(r, 20), j = idx(r, 20.1), m = idx(r, 20.05 - 0.05);
  const num = (100 * (Math.log(r.levels.y[j]) - Math.log(r.levels.y[i]))) / 0.1;
  near(r.levels.gy[m], num, 0.02, 'g_y = d ln(y/L)/dt');
}

// 8. Население: L_t = (1+n)^t; агрегаты = на работника × L
{
  const r = run({ shockTarget: 'n', shockSize: 0.01, tHat: 10, horizon: 40 });
  near(r.levels.L[10], Math.pow(1.01, 10), 1e-12, 'L_10');
  near(r.levels.L[20], Math.pow(1.01, 10) * Math.pow(1.02, 10), 1e-12, 'L_20 после шока n');
  near(r.agg.y[20], r.levels.y[20] * r.levels.L[20], 1e-12, 'Y = y·L');
}

// 9. Золотое правило: c̃_GR ≥ c̃* при любом s; при s = α совпадают; знак r* − (n+g) ↔ s ≶ α
{
  for (const s of [0.1, 0.3, 0.5, 0.8]) {
    const r = run({ s, shockSize: 0, time: 'continuous' });
    assert.ok(r.ss0.cGR >= r.ss0.c - 1e-12, `c_GR ≥ c* при s=${s}`);
    if (s === 0.3) near(r.ss0.cGR, r.ss0.c, 1e-12, 'при s = α — золотое правило');
    if (s < 0.3) assert.ok(r.ss0.r > 0.03, 'динамически эффективна');
    if (s > 0.3) assert.ok(r.ss0.r < 0.03, 'динамически неэффективна');
  }
}

// 10. Все комбинации решаются; формулы и таблица строятся
{
  const sizes = { tfp: 10, k: -30, s: 0.05, n: 0.01, g: 0.01, delta: 0.02 };
  let cnt = 0;
  for (const time of ['discrete', 'continuous']) for (const variant of ['base', 'tp']) for (const version of ['decentralized', 'centralized'])
    for (const shockTarget of Object.keys(sizes)) for (const shockPersistence of ['permanent', 'temporary']) {
      if ((shockTarget === 'tfp' || shockTarget === 'g') && variant !== 'tp') continue;
      const st = { ...defaults, time, variant, version, shockTarget, shockPersistence, shockSize: sizes[shockTarget] };
      const r = solve(st);
      assert.ok(r.ok, `${JSON.stringify(st)}: ${r.errors}`);
      for (const sp of chartSpecs(st)) assert.ok(r.irf[sp.id].every(Number.isFinite) && r.levels[sp.id].every(Number.isFinite), `${sp.id} конечен`);
      formulas(st); steadyTable(st, r);
      cnt++;
    }
  console.log(`комбинаций: ${cnt}`);
}

// 11. Основная диаграмма и сходимость: точки пути лежат на s·f(k̃), пересечения — стационары; траектории из любых k̃0 сходятся
{
  const { extraBlocks } = await import('../site/assets/js/models/solow.js');
  for (const time of ['discrete', 'continuous']) {
    const st = { ...defaults, time, shockTarget: 's', shockSize: 0.05, tHat: 10, horizon: 150 };
    const r = solve(st);
    const [cv, dg] = extraBlocks(st, r);
    const full = dg.charts[0];
    const pathS = full.series.find((x) => x.points);
    for (const [k, v] of pathS.data) near(v, 0.25 * Math.pow(k, 0.3), 1e-12, 'точка пути на s′·f(k̃)');
    const ks = full.opts.vlines.map((v) => v.x);
    near(ks[0], r.ss0.k, 1e-12, 'вертикаль k̃*'); near(ks[1], r.ssF.k, 1e-12, 'вертикаль k̃*′');
    near(0.2 * Math.pow(ks[0], 0.3), r.ss0.dep * ks[0], 1e-12, 'k̃* — пересечение s·f и линии выбытия');
    near(pathS.data.at(-1)[0], r.ssF.k, 1e-2 * r.ssF.k, 'путь приходит в новый стационар');
    for (const ch of cv.charts.slice(0, 3)) for (const sr of ch.series) near(sr.data.at(-1)[1], ch.opts.hlines[0].y, 0.01 * ch.opts.hlines[0].y, `сходимость ${ch.title}`);
    assert.equal(cv.charts[0].series.length, 1, 'одна траектория — из введённого k̃0');
    near(cv.charts[0].series[0].data[0][1], st.k0, 1e-12, 'старт из k̃0');
    const gy = cv.charts[3].series[0].data; // k̃0 < k̃*: темп роста выше g и убывает
    assert.ok(gy[1][1] > 2 && gy[1][1] > gy[20][1], 'условная конвергенция: рост выше g и замедляется');
  }
}
// 12. Непрерывное время: шаг перед шоком считается со старыми параметрами, поэтому
//     до t̂ траектория совпадает с базовой, а результат не зависит от шага сетки
{
  const at = (r, t) => r.t.findIndex((x) => Math.abs(x - t) < 1e-9);
  for (const sh of [{ shockTarget: 's', shockSize: 0.05 }, { shockTarget: 'n', shockSize: 0.01 }, { shockTarget: 'delta', shockSize: 0.02 },
    { shockTarget: 'tfp', shockSize: 10, shockPersistence: 'temporary' }]) {
    const st = { ...defaults, time: 'continuous', tHat: 10, horizon: 60, ...sh };
    const a = solve({ ...st, dt: 0.02 }), b = solve({ ...st, dt: 0.005 });
    near(a.levels.k[at(a, 10)], a.baseLevels.k[at(a, 10)], 1e-12, `k в момент шока ещё на базовом пути (${sh.shockTarget})`);
    for (const t of [10.1, 20, 60]) near(a.levels.k[at(a, t)] / b.levels.k[at(b, t)], 1, 1e-9, `k(${t}) не зависит от шага (${sh.shockTarget})`);
  }
}
console.log('Модель Солоу: все проверки пройдены');
