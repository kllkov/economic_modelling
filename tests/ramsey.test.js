import { solve, defaults, extraBlocks, ssCharts, steadyTable, formulas } from '../site/assets/js/models/ramsey.js';
import assert from 'node:assert/strict';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const run = (o) => { const t0 = Date.now(); const r = solve({ ...defaults, variant: 'base', n: 0, ...o }); r.ms = Date.now() - t0; return r; };

// 1. Стационар без ТП совпадает с презентацией (α=.3, β=.96, δ=.1)
let r = run({ shockSize: 0 });
assert.ok(r.ok, JSON.stringify(r.errors));
near(r.ss0.k, 2.921, 1e-3, 'k*'); near(r.ss0.y, 1.379, 1e-3, 'y*'); near(r.ss0.c, 1.087, 1e-3, 'c*');
near(r.ss0.w, 0.966, 1e-3, 'w*'); near(r.ss0.r, 0.0417, 1e-4, 'r*'); near(r.ss0.i, 0.292, 1e-3, 'i*');

// 2. С ТП: g=2%, σ=2 → k̃*=2.014, c̃*=0.992, r*=8.37%
r = run({ variant: 'tp', shockSize: 0 });
near(r.ss0.k, 2.014, 1e-3, 'k~*'); near(r.ss0.c, 0.992, 1e-3, 'c~*'); near(r.ss0.r, 0.0837, 1e-4, 'r* TP');
near(r.ss0.w, 0.864, 1e-3, 'w~*'); near(r.ss0.i, 0.242, 1e-3, 'i~*');

// 3. Сходимость из k0 = 0.5 k*: капитал −50% неожиданно в t=0 → c0 ≈ 0.833 (слайд «Сходимость»)
r = run({ shockTarget: 'k', shockSize: -50, tHat: 0, horizon: 40 });
assert.ok(r.ok);
near(r.levels.c[0], 0.833, 2e-3, 'c0 из k0=0.5k*');
near(r.levels.k[1], 1.60, 1e-2, 'k1'); near(r.levels.c[1], 0.862, 2e-3, 'c1');
near(r.levels.k[5], 2.05, 1e-2, 'k5'); near(r.levels.c[5], 0.947, 2e-3, 'c5');
near(r.levels.r[0], 13.0, 0.1, 'r0 %');

// 4. Все комбинации решаются
const combos = [];
for (const time of ['discrete', 'continuous'])
  for (const variant of ['base', 'tp'])
    for (const utility of ['crra', 'log', 'cara'])
      for (const shockTarget of ['tfp', 'k', 'n', time === 'discrete' ? 'beta' : 'rho', 'sigma', 'theta', 'delta'])
        for (const shockTiming of ['unexpected', 'expected'])
          for (const shockPersistence of ['permanent', 'temporary']) {
            if (utility === 'cara' && variant === 'tp') continue;
            if (shockTarget === 'sigma' && utility !== 'crra') continue;
            if (shockTarget === 'tfp' && variant !== 'tp') continue;
            if ((shockTarget === 'sigma' || shockTarget === 'theta') && (shockTiming === 'expected' || shockPersistence === 'temporary')) continue;
            if (shockTarget === 'theta' && utility !== 'cara') continue;
            const sizes = { tfp: 10, k: -20, n: 0.01, beta: 0.01, rho: -0.01, sigma: 1, theta: 0.5, delta: 0.02 };
            const o = { time, variant, utility, shockTarget, shockTiming, shockPersistence, shockSize: sizes[shockTarget],
                        rho: 0.04, beta: 0.96, n: 0.01, objective: combos.length % 2 ? 'mill' : 'bentham' };
            const res = run(o);
            combos.push([JSON.stringify(o), res.ok, res.ms, res.ok ? '' : res.errors.join(';')]);
          }
const bad = combos.filter((c) => !c[1]);
console.log(`комбинаций: ${combos.length}, неудачных: ${bad.length}, макс. время: ${Math.max(...combos.map((c) => c[2]))} мс`);
bad.forEach((b) => console.log('FAIL', b[0], b[3]));
assert.equal(bad.length, 0);

// 5. Неожиданный перманентный TFP: k не прыгает в t̂, c прыгает; до t̂ всё в стационаре
r = run({ variant: 'tp', shockTarget: 'tfp', shockSize: 10 });
const jh = 15;
near(r.irf.k[jh], 0, 1e-9, 'k фиксирован в t̂'); assert.ok(Math.abs(r.irf.c[jh]) > 0.1);
near(r.irf.c[jh - 1], 0, 1e-9, 'до шока стационар');
// долгосрочно: k, c, y растут на φ=10%
near(r.irf.k[60], 10, 0.3, 'k → +10%'); near(r.irf.c[60], 10, 0.3, 'c → +10%');

// 6. Ожидаемый: реакция начинается в t0=5
r = run({ variant: 'tp', shockTarget: 'tfp', shockSize: 10, shockTiming: 'expected' });
near(r.irf.c[4], 0, 1e-9, 'до t0 нет реакции'); assert.ok(Math.abs(r.irf.c[5]) > 0.1, 'c прыгает в t0');

// 6a. σ-шок только неожиданный перманентный
assert.equal(run({ utility: 'crra', shockTarget: 'sigma', shockSize: 1, shockTiming: 'expected' }).ok, false);

// 6b. TFP-шок без ТП запрещён
assert.equal(run({ shockTarget: 'tfp' }).ok, false);

// 7. Непрерывное время сходится к дискретному стационару с ρ
r = run({ time: 'continuous', rho: 0.04, variant: 'tp' });
near(r.ss0.r, 0.04 + 2 * 0.02, 1e-12, 'r*=ρ+σg');
// 8. Рост населения: стационарная ставка — Милль 1+r* = (1+n)(1+g)^σ/β, Бентам 1+r* = (1+g)^σ/β
r = run({ n: 0.01, objective: 'mill', shockSize: 0 });
near(1 + r.ss0.r, 1.01 / 0.96, 1e-12, 'r* Милль');
r = run({ n: 0.01, objective: 'bentham', shockSize: 0 });
near(1 + r.ss0.r, 1 / 0.96, 1e-12, 'r* Бентам');
r = run({ n: 0.01, objective: 'mill', variant: 'tp', shockSize: 0, shockTarget: 'tfp' });
near(1 + r.ss0.r, 1.01 * 1.02 ** 2 / 0.96, 1e-12, 'r* Милль с ТП');
r = run({ time: 'continuous', n: 0.01, objective: 'mill', variant: 'tp', rho: 0.04, shockSize: 0, shockTarget: 'tfp' });
near(r.ss0.r, 0.04 + 0.01 + 2 * 0.02, 1e-12, 'r*=ρ+n+σg');
// 9. Уровни = на работника × L_t
r = run({ n: 0.02, shockTarget: 'n', shockSize: 0.01, tHat: 10 });
near(r.agg.k[30] / r.levels.k[30], r.levels.L[30], 1e-12, 'K = k·L');
near(r.levels.L[10], 1.02 ** 10, 1e-12, 'L до шока растёт темпом n');
near(r.levels.L[11] / r.levels.L[10], 1.03, 1e-12, 'L после шока растёт темпом n+Δn');
// 10. Пример сходимости из материалов курса (ТП, n = 1%): k̃0 = 0.928 = 0.5k̃* → c̃0 = 0.740, k̃1 = 1.042, c̃1 = 0.772, k̃5 = 1.384, c̃5 = 0.859, r0 = 21.6%
{
  const st = { ...defaults };
  const [cvb, dg] = extraBlocks(st, solve(st));
  const [k, y, c] = cvb.sections[0].charts.map((ch) => ch.series[0].data);
  near(k[0][1], 0.928, 1e-12, 'k̃0'); near(c[0][1], 0.740, 5e-4, 'c̃0'); near(k[1][1], 1.042, 5e-4, 'k̃1'); near(c[1][1], 0.772, 5e-4, 'c̃1');
  near(k[5][1], 1.384, 1e-3, 'k̃5'); near(c[5][1], 0.859, 1e-3, 'c̃5'); near(y[0][1], 0.928 ** 0.3, 1e-12, 'ỹ0');
  // фазовая диаграмма: путь начинается в k̃0 и лежит на седловой траектории, вертикальный локус — в k̃*
  const ph = cvb.sections[1].charts[0];
  const path = ph.series.find((x) => x.points).data, saddle = ph.series.find((x) => x.label === 'седловая траектория').data;
  near(path[0][0], 0.928, 1e-12, 'путь из k̃0');
  const onSaddle = (p) => { const j = saddle.findIndex((q) => q[0] >= p[0]); const [a, b] = [saddle[j - 1], saddle[j]]; return a[1] + (b[1] - a[1]) * (p[0] - a[0]) / (b[0] - a[0]); };
  for (const p of path.slice(0, 15)) near(onSaddle(p), p[1], 2e-3, 'точка пути на седловой траектории');
  const kStar = steadyTable(st, solve(st)).find((r) => r.key === 'k').value;
  near(ph.opts.vlines[1].x, kStar, 1e-12, 'k̃* на оси');
  near(ph.series[1].data[0][0], kStar, 1e-12, 'локус Δc̃ = 0 — вертикаль k̃ = k̃*');
  // графики ТСР: k_t = k̃_t E_t, ТСР = k̃* E_t
  const sc = ssCharts(st);
  const [bgp, pk] = sc.charts[0].series;
  near(pk.data[0][1], 0.928, 1e-12, 'k_0 = k̃_0 (E_0 = 1)');
  near(bgp.data[10][1], kStar * 1.02 ** 10, 1e-9, 'ТСР: k̃* E_t');
  // основная диаграмма с шоком: путь начинается в момент шока, седловая траектория — нового стационара
  assert.ok(dg.charts[0].series.some((x) => x.points), 'путь экономики на диаграмме');
  const sd = { ...defaults, shockTarget: 'delta', shockSize: 0.03, tHat: 5 };
  const dd = extraBlocks(sd, solve(sd))[1].charts[0];
  const vert = dd.series.filter((x) => x.data.length === 2 && x.data[0][0] === x.data[1][0] && !x.points).map((x) => x.data[0][0]);
  const ssNew = solve(sd).ssF.k;
  assert.ok(vert.some((v) => Math.abs(v - ssNew) < 1e-9), 'новый локус Δc̃ = 0 после перманентного шока δ');
}
// 11. Децентрализованная версия — без активов b: домохозяйства владеют капиталом
{
  const F = formulas({ ...defaults, version: 'decentralized' });
  const all = [...F.dec.flatMap((g) => g.items), ...F.system.map((r) => r.tex)].join(' ');
  assert.ok(!/b_/.test(all), 'в децентрализованной версии нет b');
  assert.ok(/\\tilde\\pi_t/.test(all) && /\(r_t\+\\delta\)\\tilde k_t/.test(all), 'доход: аренда капитала и прибыль фирм');
}
console.log('Все проверки пройдены');
