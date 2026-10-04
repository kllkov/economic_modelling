// Проверки модели Фишера против аналитических решений.
import { solve, defaults } from '../site/assets/js/models/fisher.js';
import assert from 'node:assert/strict';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const run = (o) => solve({ ...defaults, ...o });

// 1. Функция потребления: c_0 = (1 − γ/(1+r))·W_0, γ = [β(1+r)]^{1/σ}; лог: (1−β)W_0; CARA: r/(1+r)·W_0 − Δ/r
{
  const r = 0.05, b0 = 3, w = 1, beta = 0.96;
  for (const variant of ['const', 'growing']) {
    const gw = variant === 'growing' ? 0.02 : 0;
    const W = (1 + r) * b0 + w * (1 + r) / (r - gw);
    let x = run({ variant, b0, shockSize: 0 });
    near(x.levels.c[0], (1 - Math.pow(beta * (1 + r), 1 / 2) / (1 + r)) * W, 1e-10, `CRRA c0 ${variant}`);
    x = run({ variant, b0, utility: 'log', shockSize: 0 });
    near(x.levels.c[0], (1 - beta) * W, 1e-10, `log c0 ${variant}`);
    x = run({ variant, b0, utility: 'cara', shockSize: 0 });
    near(x.levels.c[0], (r / (1 + r)) * W - Math.log(beta * (1 + r)) / 1 / r, 1e-9, `CARA c0 ${variant}`);
  }
}
// 2. Непрерывное время: c_0 = [ρ − (1−σ)r]/σ·(b_0 + w/(r−g)), ошибка дискретизации O(dt)
{
  const x = run({ time: 'continuous', rho: 0.04, b0: 3, shockSize: 0 });
  near(x.levels.c[0], ((0.04 + 0.05) / 2) * (3 + 1 / 0.05), 2e-3, 'continuous c0');
  const y = run({ time: 'continuous', rho: 0.04, b0: 3, shockSize: 0, dt: 0.002 });
  near(y.levels.c[0], ((0.04 + 0.05) / 2) * (3 + 1 / 0.05), 3e-4, 'continuous c0, dt=0.002');
}
// 3. Гипотеза перманентного дохода: β(1+r)=1, неожиданный перманентный шок дохода φ ⇒ Δc = φ·w с момента шока
{
  const beta = 1 / 1.05;
  const x = run({ beta, shockTarget: 'w', shockSize: -10, tHat: 8 });
  for (let t = 8; t < 30; t++) near(x.levels.c[t] - x.baseLevels.c[t], -0.1, 1e-9, `PIH permanent t=${t}`);
  for (let t = 0; t < 8; t++) near(x.levels.c[t], x.baseLevels.c[t], 1e-12, 'до шока без изменений');
  // временный шок на один период (ρ_s = 0): Δc = r/(1+r)·φw навсегда
  const y = run({ beta, shockTarget: 'w', shockSize: -10, tHat: 8, shockPersistence: 'temporary', rhoS: 0 });
  for (let t = 8; t < 30; t++) near(y.levels.c[t] - y.baseLevels.c[t], -0.1 * 0.05 / 1.05, 1e-9, `PIH transitory t=${t}`);
}
// 4. Шок активов: Δc_t̂ = (1 − γ/(1+r))·(1+r)·Δb
{
  const r = 0.05, gm = Math.pow(0.96 * 1.05, 1 / 2);
  const x = run({ shockTarget: 'b', shockSize: 2, tHat: 6 });
  near(x.levels.c[6] - x.baseLevels.c[6], (1 - gm / (1 + r)) * (1 + r) * 2, 1e-10, 'asset shock');
  near(x.levels.b[6] - x.baseLevels.b[6], 2, 1e-12, 'b jumps by Δb');
}
// 5. Ожидаемый шок: реакция в t0, в t̂ потребление не прыгает (Эйлер выполняется через t̂)
{
  const x = run({ shockTarget: 'r', shockSize: 0.01, shockTiming: 'expected', t0: 3, tHat: 10, shockPersistence: 'temporary', rhoS: 0.6 });
  near(x.levels.c[2], x.baseLevels.c[2], 1e-12, 'до объявления без изменений');
  assert.ok(Math.abs(x.levels.c[3] - x.baseLevels.c[3]) > 1e-4, 'реакция в t0');
  for (let t = 3; t < 39; t++) {
    const r1 = x.levels.r[t + 1] / 100;
    near(Math.pow(x.levels.c[t + 1] / x.levels.c[t], 2), 0.96 * (1 + r1), 1e-10, `Euler t=${t}`);
  }
}
// 6. Бюджет: b_t не уходит в схему Понци (дисконтированные активы стремятся к нулю при росте c)
{
  const x = run({ horizon: 200, shockSize: 0 });
  const T = 200, disc = Math.pow(1.05, -T);
  assert.ok(Math.abs(x.levels.b[T] * disc) < 1e-2, `no-Ponzi: ${x.levels.b[T] * disc}`);
}
// 7. Все комбинации решаются
{
  const sizes = { b: 2, w: -10, r: 0.01, beta: 0.01, rho: -0.01, sigma: 1, theta: 0.5 };
  let n = 0, bad = [];
  for (const time of ['discrete', 'continuous']) for (const variant of ['const', 'growing']) for (const utility of ['crra', 'log', 'cara'])
    for (const tg of ['b', 'w', 'r', time === 'discrete' ? 'beta' : 'rho', 'sigma', 'theta'])
      for (const shockTiming of ['unexpected', 'expected']) for (const shockPersistence of ['permanent', 'temporary']) {
        if (tg === 'sigma' && utility !== 'crra') continue;
        if (tg === 'theta' && utility !== 'cara') continue;
        if ((tg === 'sigma' || tg === 'theta') && (shockTiming === 'expected' || shockPersistence === 'temporary')) continue;
        const x = run({ time, variant, utility, shockTarget: tg, shockSize: sizes[tg], shockTiming, shockPersistence, rho: 0.04 });
        n++; if (!x.ok) bad.push(`${time} ${variant} ${utility} ${tg} ${shockTiming} ${shockPersistence}: ${x.errors}`);
      }
  console.log(`комбинаций: ${n}, неудачных: ${bad.length}`);
  bad.forEach((b) => console.log('FAIL', b));
  assert.equal(bad.length, 0);
}
console.log('Модель Фишера: все проверки пройдены');
