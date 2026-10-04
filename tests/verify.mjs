// Независимые проверки решателя Рамсея: аналитические решения, сходимость по шагу и горизонту.
import { solve, defaults } from '../site/assets/js/models/ramsey.js';
import fs from 'node:fs';
const run = (o) => solve({ ...defaults, ...o });
const maxAbs = (a) => Math.max(...a.map(Math.abs));
const out = {};

// 1. Лог-полезность, δ = 1: c_t = (1-αβ) y_t, k_{t+1} = αβ y_t при ЛЮБОМ шоке
{
  const a = 0.3, b = 0.96;
  const r = run({ utility: 'log', delta: 1, shockTarget: 'k', shockSize: -20, tHat: 5, horizon: 40 });
  const err = r.levels.c.map((c, i) => c / r.levels.y[i] - (1 - a * b));
  const errK = r.levels.k.slice(1).map((k, i) => (i + 1 === 5 ? 0 : k - a * b * r.levels.y[i])); // в t̂ капитал разрушен
  out.closedForm_k_shock = { maxErr_c_over_y: maxAbs(err), maxErr_k: maxAbs(errK) };
}
// 2. То же, ожидаемый временный шок β: s_t = x_t/(1+x_t), x_t = αβ_t(1+x_{t+1}) — точное решение с ожиданиями
{
  const a = 0.3, b = 0.96, t0 = 5, th = 15, rhoS = 0.7, d = 0.02, H = 60;
  const r = run({ utility: 'log', delta: 1, shockTarget: 'beta', shockSize: d, shockTiming: 'expected', t0, tHat: th,
                  shockPersistence: 'temporary', rhoS, horizon: H });
  const T = 400, beta = (t) => b + (t >= th ? d * rhoS ** (t - th) : 0);
  const x = new Array(T + 1).fill(a * b / (1 - a * b));
  for (let t = T - 1; t >= 0; t--) x[t] = a * beta(t) * (1 + x[t + 1]);
  const sExact = (t) => (t < t0 ? a * b : x[t] / (1 + x[t]));
  const err = r.levels.s.map((s, t) => s / 100 - sExact(t));
  out.closedForm_expected_beta = { maxErr_s: maxAbs(err), s_t0_minus1: r.levels.s[t0 - 1] / 100, s_t0: r.levels.s[t0] / 100, s_exact_t0: sExact(t0) };
}
// 3. Лог, δ=1, с ТП: новость о TFP не меняет норму сбережения (αβ) — ни до, ни после шока
{
  const r = run({ utility: 'log', delta: 1, variant: 'tp', shockTarget: 'tfp', shockSize: 10, shockTiming: 'expected', t0: 5, tHat: 15 });
  out.closedForm_tfp_news = { maxIRF_s_pp: maxAbs(r.irf.s) };
}
// 4. Сходимость непрерывного времени по шагу dt
{
  const base = { time: 'continuous', variant: 'tp', shockTarget: 'tfp', shockSize: 10, shockTiming: 'expected', t0: 5, tHat: 15, rho: 0.04 };
  const r1 = run({ ...base, dt: 0.1 }), r2 = run({ ...base, dt: 0.02 }), r3 = run({ ...base, dt: 0.005 });
  const at = (r, t) => r.irf.c[Math.round(t / r.h)];
  const pts = [5, 10, 14.9, 15, 20, 40];
  out.continuous_dt = pts.map((t) => ({ t, dt_0_1: at(r1, t), dt_0_02: at(r2, t), dt_0_005: at(r3, t) }));
  // линеаризация: скорость сходимости k к стационару = устойчивый корень якобиана
  const s = { time: 'continuous', shockTarget: 'k', shockSize: -1, tHat: 0, rho: 0.04, dt: 0.02, horizon: 80 };
  const r = run(s);
  const al = 0.3, de = 0.1, rho = 0.04, sig = 2;
  const k = Math.pow(al / (rho + de), 1 / (1 - al)), c = k ** al - de * k;
  const fpp = al * (al - 1) * k ** (al - 2);
  const mu = (rho - Math.sqrt(rho * rho - 4 * c * fpp / sig)) / 2;
  const i1 = Math.round(20 / r.h), i2 = Math.round(40 / r.h);
  const fitted = Math.log(r.irf.k[i2] / r.irf.k[i1]) / 20;
  out.continuous_eigen = { theory: mu, simulated: fitted };
}
// 5. Чувствительность к горизонту решения (медленная сходимость: σ=10, δ=0.02)
{
  const o = { sigma: 10, delta: 0.02, shockTarget: 'k', shockSize: -20, tHat: 15, horizon: 100 };
  const r1 = run(o), r2 = run({ ...o, Tsolve: 1500 });
  out.horizon = { maxDiff_c_irf_pp: maxAbs(r1.irf.c.map((v, i) => v - r2.irf.c[i])) };
}
// 6. Данные для независимого решателя на Python (CRRA, ТП, ожидаемый временный TFP-шок)
{
  const o = { variant: 'tp', shockTarget: 'tfp', shockSize: 10, shockTiming: 'expected', t0: 5, tHat: 15, shockPersistence: 'temporary', rhoS: 0.8, horizon: 60 };
  const r = run(o);
  fs.writeFileSync('/tmp/claude-0/verify/js_path.json', JSON.stringify({ c: r.levels.c, k: r.levels.k, r: r.levels.r }));
}
// 7. Инвариантность к сдвигу даты: один и тот же шок в стационаре должен давать один и тот же отклик
{
  const sizes = { tfp: 10, k: -20, beta: 0.01, rho: -0.01, sigma: 1, theta: 0.5, delta: 0.02 };
  const bad = [];
  for (const time of ['discrete', 'continuous']) for (const variant of ['base', 'tp']) for (const utility of ['crra', 'log', 'cara']) {
    if (utility === 'cara' && variant === 'tp') continue;
    for (const tg of ['tfp', 'k', time === 'discrete' ? 'beta' : 'rho', 'sigma', 'theta', 'delta']) {
      if (tg === 'tfp' && variant !== 'tp') continue; if (tg === 'sigma' && utility !== 'crra') continue; if (tg === 'theta' && utility !== 'cara') continue;
      for (const shockTiming of ['unexpected', 'expected']) for (const shockPersistence of ['permanent', 'temporary']) {
        const o = { time, variant, utility, shockTarget: tg, shockSize: sizes[tg], shockTiming, shockPersistence, horizon: 80, rho: 0.04 };
        const A = run({ ...o, t0: 5, tHat: 15 }), B = run({ ...o, t0: 20, tHat: 30 });
        if (!A.ok || !B.ok) continue; // недопустимые комбинации отсекаются валидацией
        let e = 0;
        for (const v of ['c', 'k', 'r']) for (let t = 0; t <= 30; t++) e = Math.max(e, Math.abs(A.irf[v][Math.round((5 + t) / A.h)] - B.irf[v][Math.round((20 + t) / B.h)]));
        if (e > 1e-6) bad.push(`${time} ${variant} ${utility} ${tg} ${shockTiming} ${shockPersistence}: ${e}`);
      }
    }
  }
  out.timeShiftInvariance = bad.length ? bad : 'ok';
}
console.log(JSON.stringify(out, null, 2));
