import { solve, defaults } from '../site/assets/js/models/ramsey.js';
import assert from 'node:assert/strict';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const run = (o) => { const t0 = Date.now(); const r = solve({ ...defaults, ...o }); r.ms = Date.now() - t0; return r; };

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
      for (const shockTarget of ['tfp', 'k', time === 'discrete' ? 'beta' : 'rho', 'sigma', 'theta', 'delta'])
        for (const shockTiming of ['unexpected', 'expected'])
          for (const shockPersistence of ['permanent', 'temporary']) {
            if (utility === 'cara' && variant === 'tp') continue;
            if (shockTarget === 'sigma' && utility !== 'crra') continue;
            if (shockTarget === 'tfp' && variant !== 'tp') continue;
            if ((shockTarget === 'sigma' || shockTarget === 'theta') && (shockTiming === 'expected' || shockPersistence === 'temporary')) continue;
            if (shockTarget === 'theta' && utility !== 'cara') continue;
            const sizes = { tfp: 10, k: -20, beta: 0.01, rho: -0.01, sigma: 1, theta: 0.5, delta: 0.02 };
            const o = { time, variant, utility, shockTarget, shockTiming, shockPersistence, shockSize: sizes[shockTarget],
                        rho: 0.04, beta: 0.96 };
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
console.log('Все проверки пройдены');
