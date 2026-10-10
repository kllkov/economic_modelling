// Проверки модели IS–PC–MPR: аналитика Гали (метод неопределённых коэффициентов), уравнения на траектории,
// правила ожиданий, сходимость к стационару, принцип Тейлора.
import { solve, defaults, formulas, steadyTable, chartSpecs, extraBlocks, coefs } from '../site/assets/js/models/ispcmpr.js';
import assert from 'node:assert/strict';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const run = (o) => { const r = solve({ ...defaults, ...o }); assert.ok(r.ok, JSON.stringify(r.errors)); return r; };

// 1. Рациональные ожидания, неожиданный AR(1)-шок: x = −(1−βρ)Λυ, π = −κΛυ (Galí, (48)–(51))
{
  for (const rhoS of [0, 0.5, 0.8]) {
    const st = { ...defaults, expectations: 'rational', shockTarget: 'v', shockSize: 1, shockPersistence: 'temporary', rhoS, tHat: 3, horizon: 30 };
    const r = run(st);
    const C = coefs(st);
    const Lam = 1 / ((1 - st.beta * rhoS) * (st.sigma * (1 - rhoS) + st.phiY) + C.kappa * (st.phiPi - rhoS));
    for (let t = 3; t <= 20; t++) {
      const v = Math.pow(rhoS, t - 3);
      near(r.irf.x[t], -(1 - st.beta * rhoS) * Lam * v, 1e-9, `x_${t}, ρ=${rhoS}`);
      near(r.irf.pi[t], -C.kappa * Lam * v, 1e-9, `π_${t}, ρ=${rhoS}`);
    }
    for (let t = 0; t < 3; t++) near(r.irf.x[t], 0, 1e-12, 'до шока x = 0');
  }
}

// 2. Технологический шок при RE: r̂ⁿ = −σ(1−ρ_a)ψ a; x = (1−βρ)Λ r̂ⁿ, π = κΛ r̂ⁿ
{
  const rhoS = 0.7;
  const st = { ...defaults, expectations: 'rational', shockTarget: 'a', shockSize: 1, shockPersistence: 'temporary', rhoS, tHat: 2, horizon: 30 };
  const r = run(st), C = coefs(st);
  const Lam = 1 / ((1 - st.beta * rhoS) * (st.sigma * (1 - rhoS) + st.phiY) + C.kappa * (st.phiPi - rhoS));
  for (let t = 2; t <= 15; t++) {
    const rn = -st.sigma * (1 - rhoS) * C.psi * Math.pow(rhoS, t - 2);
    near(r.irf.rn[t], rn, 1e-9, `rⁿ_${t}`);
    near(r.irf.x[t], (1 - st.beta * rhoS) * Lam * rn, 1e-9, `x_${t} (технология)`);
    near(r.irf.pi[t], C.kappa * Lam * rn, 1e-9, `π_${t} (технология)`);
    near(r.levels.y[t], C.psi * Math.pow(rhoS, t - 2) + r.levels.x[t], 1e-12, 'y = yⁿ + x');
  }
}

// 3. Уравнения выполняются на траектории при любых ожиданиях
{
  const combos = [];
  for (const expectations of ['naive', 'adaptive', 'rational'])
    for (const shockTarget of ['d', 'u', 'v', 'a'])
      for (const shockPersistence of ['permanent', 'temporary'])
        for (const shockTiming of expectations === 'rational' ? ['unexpected', 'expected'] : ['unexpected'])
          combos.push({ expectations, shockTarget, shockPersistence, shockTiming });
  for (const c of combos) {
    const st = { ...defaults, ...c, shockSize: 1, tHat: 6, t0: 2, horizon: 60 };
    const r = run(st), C = coefs(st), S = r.sim;
    for (let t = 0; t <= 60; t++) {
      const E = S.E[t];
      const tag = `${JSON.stringify(c)} t=${t}`;
      near(S.x[t], S.ex[t] - (S.i[t] - S.epi[t] - S.rn[t]) / st.sigma, 1e-9, `IS ${tag}`);
      near(S.pi[t] - E.piStar, st.beta * (S.epi[t] - E.piStar) + C.kappa * S.x[t] + E.u, 1e-9, `PC ${tag}`);
      near(S.i[t], C.rho + E.piStar + st.phiPi * (S.pi[t] - E.piStar) + st.phiY * S.x[t] + E.v, 1e-9, `MPR ${tag}`);
      near(S.r[t], S.i[t] - S.epi[t], 1e-12, `r ${tag}`);
      if (c.expectations === 'naive') { near(S.epi[t], E.piStar, 1e-12, 'наивные: Eπ = π*'); near(S.ex[t], 0, 1e-12, 'наивные: Ex = 0'); }
      if (c.expectations === 'adaptive' && t > 0) {
        near(S.epi[t], S.epi[t - 1] + st.gamma * (S.pi[t - 1] - S.epi[t - 1]), 1e-9, `адаптивные Eπ ${tag}`);
        near(S.ex[t], S.ex[t - 1] + st.gamma * (S.x[t - 1] - S.ex[t - 1]), 1e-9, `адаптивные Ex ${tag}`);
      }
      const t0 = c.shockTiming === 'expected' ? 2 : 6;
      if (c.expectations === 'rational' && t >= t0 && t < 60) {
        near(S.epi[t], S.pi[t + 1], 1e-9, `RE: Eπ = π_{t+1} ${tag}`);
        near(S.ex[t], S.x[t + 1], 1e-9, `RE: Ex = x_{t+1} ${tag}`);
      }
      if (c.expectations === 'rational' && t < t0) near(S.pi[t], 0, 1e-12, 'RE: до информации — стационар');
    }
    formulas(st); steadyTable(st, r); extraBlocks(st, r);
    for (const sp of chartSpecs(st)) assert.ok(r.irf[sp.id].every(Number.isFinite), `${sp.id} конечен`);
  }
  console.log(`комбинаций: ${combos.length}`);
}

// 4. Адаптивные ожидания с γ = 1: E*_t π_{t+1} = π_{t−1}
{
  const r = run({ expectations: 'adaptive', gamma: 1, shockTarget: 'u', shockSize: 1, tHat: 3, horizon: 30 });
  for (let t = 1; t <= 30; t++) near(r.sim.epi[t], r.sim.pi[t - 1], 1e-12, `γ=1, t=${t}`);
}

// 5. Перманентные шоки: траектория сходится к новому стационару
{
  for (const expectations of ['naive', 'adaptive', 'rational'])
    for (const shockTarget of ['d', 'u', 'v']) {
      const r = run({ expectations, shockTarget, shockSize: 1, shockPersistence: 'permanent', tHat: 5, horizon: expectations === 'adaptive' ? 1500 : 200 });
      for (const k of ['pi', 'x', 'i', 'r']) near(r.levels[k].at(-1), r.ssF[k], 1e-4, `сходимость ${k}, ${expectations}, ${shockTarget}`);
    }
}

// 6. Стационар с перманентным шоком издержек (RE): (1−β)π̂ − κx = u, (φπ−1)π̂ + φy x = 0
{
  const st = { ...defaults, expectations: 'rational', shockTarget: 'u', shockSize: 1, shockPersistence: 'permanent' };
  const r = run(st), C = coefs(st);
  const ph = r.ssF.pi, x = r.ssF.x;
  near((1 - st.beta) * ph - C.kappa * x, 1, 1e-12, 'PC в стационаре');
  near((st.phiPi - 1) * ph + st.phiY * x, 0, 1e-12, 'IS+MPR в стационаре');
}

// 7. Принцип Тейлора: при нарушении RE и адаптивные — ошибка, наивные решаются
{
  for (const expectations of ['rational', 'adaptive']) {
    const r = solve({ ...defaults, expectations, phiPi: 0.8, phiY: 0 });
    assert.equal(r.ok, false, `ошибка при φπ<1, ${expectations}`);
  }
  assert.ok(solve({ ...defaults, expectations: 'naive', phiPi: 0.8, phiY: 0 }).ok, 'наивные решаются при φπ<1');
}

// 8. Сходимость из начальных ожиданий (адаптивные)
{
  const st = { ...defaults, expectations: 'adaptive', pie0: 8, horizon: 400 };
  const r = run(st);
  const [cv] = extraBlocks(st, r);
  assert.equal(cv.title, 'Сходимость к стационару');
  const pi = cv.charts[0].series[0].data, e = cv.charts[3].series[0].data;
  near(e[0][1], 8, 1e-12, 'старт ожиданий');
  near(pi.at(-1)[1], 0, 1e-2, 'инфляция сходится к нулю');
  assert.ok(cv.charts[1].series[0].data[0][1] < 0, 'высокие ожидания: дезинфляция с отрицательным разрывом');
}

// 9. Диаграмма: путь лежит на PC и AD (IS и MPR) текущего периода в момент шока
{
  for (const expectations of ['naive', 'adaptive', 'rational']) {
    const st = { ...defaults, expectations, shockTarget: 'u', shockSize: 1, tHat: 4, horizon: 30 };
    const r = run(st);
    const dg = extraBlocks(st, r).at(-1);
    const [p1, p2] = dg.charts;
    const at = (ser, x) => { const d = ser.data; for (let i = 1; i < d.length; i++) if (d[i][0] >= x) { const w = (x - d[i - 1][0]) / (d[i][0] - d[i - 1][0]); return d[i - 1][1] + w * (d[i][1] - d[i - 1][1]); } return NaN; };
    const x4 = r.sim.x[4], pi4 = r.sim.pi[4], r4 = r.sim.r[4];
    for (const nm of ['PC′', 'AD′']) { const s = p1.series.find((q) => q.curveLabel === nm); if (s) near(at(s, x4), pi4, 1e-9, `${nm} проходит через (x,π) в t̂, ${expectations}`); }
    for (const nm of ['DIS′', 'MPR′']) { const s = p2.series.find((q) => q.curveLabel === nm); if (s) near(at(s, x4), r4, 1e-9, `${nm} проходит через (x,r) в t̂, ${expectations}`); }
    const pc0 = p1.series.find((q) => q.curveLabel === 'PC');
    near(at(pc0, 0), 0, 1e-9, 'PC до шока проходит через (0, 0)');
  }
}
console.log('Модель IS–PC–MPR: все проверки пройдены');
