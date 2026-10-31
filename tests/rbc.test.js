// Модель RBC: числа из лекции (стационар, отклики при разных ρ), точность нелинейного решения,
// тренды (слайд «Отклики с трендами и без») и блоки страницы.
import assert from 'node:assert/strict';
import { defaults, solve, steady, policy, steadyTable, systemBlocks, extraBlocks, ssCharts, chartSpecs, formulas } from '../site/assets/js/models/rbc.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const run = (o = {}) => { const r = solve({ ...defaults, ...o }); assert.ok(r.ok, JSON.stringify(o) + r.errors); return r; };
const argmax = (a) => a.indexOf(Math.max(...a));

// 1. Стационарное состояние в числах (α = 1/3, β = 0.99, δ = 0.025, θ = 4, χ = 1)
{
  const ss = steady(defaults);
  near(ss.r, 0.0101, 5e-5, 'r*'); near(ss.r + defaults.delta, 0.0351, 5e-5, 'r* + δ');
  near(ss.kap, 29.26, 5e-3, 'K*/N*'); near(ss.w, 2.05, 5e-3, 'w*'); near(ss.cN, 2.35, 5e-3, 'C*/N*'); near(ss.N, 0.47, 5e-3, 'N*');
  near(ss.y, 1.44, 5e-3, 'Y*'); near(ss.c, 1.10, 5e-3, 'C*'); near(ss.i, 0.34, 5e-3, 'I*'); near(ss.KY, 9.5, 5e-2, 'K*/Y*');
}

// 2. Отклики на шок технологии 1% при ρ = 0.95 (лог-линейная модель, как в лекции)
{
  const r = run();
  const I = r.irf;
  near(I.A[0], 1, 1e-12, 'Â_0'); near(I.k[0], 0, 1e-12, 'K̂_0 задан');
  near(I.y[0], 1.31, 5e-3, 'Ŷ_0'); near(I.N[0], 0.46, 5e-3, 'N̂_0'); near(I.w[0], 0.85, 5e-3, 'ŵ_0'); near(I.i[0], 4.3, 5e-2, 'Î_0');
  near(I.y[0], I.A[0] + (2 / 3) * I.N[0], 1e-9, 'Ŷ_0 = Â_0 + (1−α)N̂_0');
  assert.equal(argmax(I.k), 20, 'пик капитала — около 20-го квартала');
  assert.equal(argmax(I.c), 14, 'пик горба потребления — 14-й квартал');
  assert.equal(I.r.findIndex((v) => v < 0), 15, 'Δr < 0 с 15-го квартала');
  near(I.r[0], 0.046, 1e-3, 'Δr_0 (п. п.)');
}

// 3. Временный и почти постоянный шок; смена знака Δr_1
{
  const r0 = run({ rho: 0 }).irf;
  near(r0.N[0], 0.69, 5e-3, 'ρ = 0: N̂_0'); near(r0.i[0], 5.9, 5e-2, 'ρ = 0: Î_0'); near(r0.c[0], 0.09, 5e-3, 'ρ = 0: Ĉ_0');
  assert.ok(r0.N[1] < 0, 'ρ = 0: уже в t = 1 часы ниже нормы');
  const r1 = run({ rho: 0.999 }).irf;
  near(r1.c[0], 0.66, 6e-3, 'ρ = 0.999: Ĉ_0'); near(r1.N[0], 0.26, 5e-3, 'ρ = 0.999: N̂_0'); near(r1.i[0], 2.8, 5e-2, 'ρ = 0.999: Î_0');
  const flip = [...Array(30).keys()].map((j) => j / 100).find((rho) => run({ rho }).irf.r[1] > 0);
  near(flip, 0.08, 1e-9, 'Δr_1 меняет знак при ρ ≈ 0.08');
  for (const rho of [0, 0.5, 0.95, 0.999]) assert.ok(run({ rho }).irf.N[0] > 0, `часы в момент шока растут при ρ = ${rho}`);
}

// 4. Функции политики: устойчивость и связь с часами
{
  const p = policy(defaults);
  assert.ok(Math.abs(p.KK) < 1, 'η_KK — устойчивый корень');
  near(p.NK, (defaults.alpha - p.cK) / (defaults.chi + defaults.alpha), 1e-12, 'η_NK');
  near(p.NA, (1 - p.cA) / (defaults.chi + defaults.alpha), 1e-12, 'η_NA');
}

// 5. Нелинейное решение: точные уравнения выполняются, при шоке 1% близко к лог-линейному
for (const variant of ['base', 'tp']) for (const shockTarget of ['tfp', 'k']) {
  const o = { variant, shockTarget, shockSize: shockTarget === 'tfp' ? 1 : -10, tHat: 2 };
  const nl = run({ ...o, method: 'nonlinear' }), li = run({ ...o, method: 'linear' });
  const E = nl.eff, ss = nl.ss0, s = { ...defaults, ...o }, G = ss.G;
  for (let j = 2; j < 38; j++) {
    const A = nl.levels.A[j], N = nl.levels.N[j];
    near(E.y[j], A * E.k[j] ** s.alpha * N ** (1 - s.alpha), 1e-10, 'производство');
    near(G * E.k[j + 1], E.i[j] + (1 - s.delta) * E.k[j], 1e-10, 'накопление капитала');
    near(s.theta * N ** s.chi, E.w[j] / E.c[j], 1e-9, '«труд — досуг»');
    near(G * E.c[j + 1], s.beta * (1 + nl.levels.r[j + 1] / 100) * E.c[j], 1e-9, 'уравнение Эйлера');
  }
  const tol = shockTarget === 'tfp' ? 0.07 : 0.6;
  for (const v of ['c', 'k', 'y', 'N']) for (let j = 0; j <= 40; j++) near(nl.irf[v][j], li.irf[v][j], tol, `${variant} ${shockTarget}: нелинейное ≈ лог-линейное (${v}, t=${j})`);
}

// 6. С трендами и без: при β под ту же r* отклонения от ТСР почти совпадают (≤ 0.013 п. п. в лекции)
{
  const n = 0.0025, g = 0.0055;
  const b = run().irf;
  const t = run({ variant: 'tp', n, g, beta: 0.99 * (1 + n) * (1 + g) }).irf;
  let dmax = 0;
  for (const v of ['c', 'N', 'y']) for (let j = 0; j <= 40; j++) dmax = Math.max(dmax, Math.abs(t[v][j] - b[v][j]));
  assert.ok(dmax < 0.02, `тренды почти не меняют отклики: ${dmax}`);
}

// 7. Блоки страницы: лог-линейная система, сходимость, ТСР
{
  const [lin] = systemBlocks(defaults);
  assert.equal(lin.groups[0].rows.length, 8, 'лог-линейная система — 8 уравнений');
  assert.equal(formulas(defaults).system.length, 8, 'уравнения динамики — 8 уравнений');
  assert.equal(formulas({ ...defaults, version: 'centralized' }).system.length, 6, 'у планировщика — 6 уравнений');
  const [cv] = extraBlocks(defaults);
  assert.ok(cv.beforeSS && cv.charts.length === 6, 'сходимость к стационару: 6 графиков');
  const k = cv.charts[0].series[0].data;
  near(k[0][1], defaults.k0, 1e-12, 'путь начинается в K_0');
  assert.ok(k[40][1] > k[0][1] && k[40][1] < steady(defaults).k, 'капитал растёт к K*');
  assert.equal(ssCharts(defaults), null, 'без трендов ТСР — стационар, графиков сходимости к ТСР нет');
  const sc = ssCharts({ ...defaults, variant: 'tp' });
  assert.equal(sc.charts.length, 4, 'сходимость к ТСР: k, y, c, w');
  const ssT = steady({ ...defaults, variant: 'tp' });
  near(sc.charts[0].series[0].data[10][1], ssT.k * 1.0055 ** 10, 1e-9, 'ТСР: k̃* E_t');
  const rows = steadyTable({ ...defaults, variant: 'tp' });
  near(rows.find((r) => r.key === 'r').value, (1.0025 * 1.0055) / 0.99 - 1, 1e-12, 'r* с трендами — точный множитель (1+n)(1+g)');
  const specs = chartSpecs(defaults).map((x) => x.id);
  assert.deepEqual(specs, ['A', 'y', 'c', 'i', 'N', 'k', 'w', 'r'], 'порядок графиков как в лекции');
}

// 8. Ограничение по часам
{
  const r = solve({ ...defaults, shockTarget: 'tfp', shockSize: 300, method: 'linear' });
  assert.ok(!r.ok && /N_t/.test(r.errors[0]), 'часы выше 1 — понятная ошибка');
}
console.log('Модель RBC: все проверки пройдены');
