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
  const a = 0.3, s = 0.2, d = 0.05, n = 0.01, g = 0.02, lam = (1 - a) * (n + g + d);
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
console.log('Модель Солоу: все проверки пройдены');
