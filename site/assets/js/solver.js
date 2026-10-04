// Численные утилиты: метод Ньютона для систем с трёхдиагональным якобианом
// (типичная структура perfect-foresight задач: уравнение t зависит от x_{t-1}, x_t, x_{t+1}).

function thomas(a, b, c, d) {
  // a — поддиагональ (a[0] не используется), b — диагональ, c — наддиагональ, d — правая часть
  const n = b.length;
  const cp = new Float64Array(n);
  const dp = new Float64Array(n);
  let denom = b[0];
  if (Math.abs(denom) < 1e-300) return null;
  cp[0] = c[0] / denom;
  dp[0] = d[0] / denom;
  for (let i = 1; i < n; i++) {
    denom = b[i] - a[i] * cp[i - 1];
    if (Math.abs(denom) < 1e-300) return null;
    cp[i] = c[i] / denom;
    dp[i] = (d[i] - a[i] * dp[i - 1]) / denom;
  }
  const x = new Float64Array(n);
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}

function norm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    if (!Number.isFinite(v[i])) return Infinity;
    s += v[i] * v[i];
  }
  return Math.sqrt(s / Math.max(1, v.length));
}

/**
 * Решает F(x) = 0, где F_i зависит только от x_{i-1}, x_i, x_{i+1}.
 * residual(x) должен возвращать Float64Array (или null, если x недопустим).
 */
export function newtonTridiagonal(residual, x0, { tol = 1e-10, maxIter = 60 } = {}) {
  let x = Float64Array.from(x0);
  const n = x.length;
  let F = residual(x);
  if (!F) return { ok: false, x, iter: 0, err: Infinity };
  let err = norm(F);
  for (let iter = 1; iter <= maxIter; iter++) {
    if (err < tol) return { ok: true, x, iter, err };
    // якобиан конечными разностями с раскраской столбцов в 3 цвета
    const a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n);
    for (let color = 0; color < 3; color++) {
      const xp = Float64Array.from(x);
      const hs = new Float64Array(n);
      for (let j = color; j < n; j += 3) {
        hs[j] = 1e-7 * Math.max(1, Math.abs(x[j]));
        xp[j] += hs[j];
      }
      const Fp = residual(xp);
      if (!Fp) return { ok: false, x, iter, err };
      for (let j = color; j < n; j += 3) {
        // столбец j влияет на строки j-1, j, j+1
        if (j - 1 >= 0) c[j - 1] = (Fp[j - 1] - F[j - 1]) / hs[j];
        b[j] = (Fp[j] - F[j]) / hs[j];
        if (j + 1 < n) a[j + 1] = (Fp[j + 1] - F[j + 1]) / hs[j];
      }
    }
    const negF = F.map((v) => -v);
    const dx = thomas(a, b, c, negF);
    if (!dx) return { ok: false, x, iter, err };
    // backtracking
    let step = 1, accepted = false;
    for (let k = 0; k < 30; k++) {
      const xn = new Float64Array(n);
      for (let i = 0; i < n; i++) xn[i] = x[i] + step * dx[i];
      const Fn = residual(xn);
      const en = Fn ? norm(Fn) : Infinity;
      if (en < err * (1 - 1e-4 * step) || (en < tol)) {
        x = xn; F = Fn; err = en; accepted = true;
        break;
      }
      step *= 0.5;
    }
    if (!accepted) return { ok: err < 1e-7, x, iter, err };
  }
  return { ok: err < 1e-7, x, iter: maxIter, err };
}
