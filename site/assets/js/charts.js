// Обёртка над Chart.js: малые графики IRF и уровней переменных.
/* global Chart */

export const COLORS = {
  path: '#3d8acb',
  pathFill: 'rgba(90, 169, 230, .09)',
  base: '#aaa3dd',
  shock: '#7c62d8',
  announce: '#b09cf5',
  zero: '#cdd1f0',
  grid: '#eef0fa',
  tick: '#7d7ca5',
};

// Вертикальные отметки (t₀, t̂) и нулевая линия — без подписей на холсте,
// подписи вынесены в легенду над графиками, чтобы не перекрывать кривые.
const markers = {
  id: 'markers',
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea: a, scales } = chart;
    ctx.save();
    if (opts.zero && scales.y.min < 0 && scales.y.max > 0) {
      const y = scales.y.getPixelForValue(0);
      ctx.strokeStyle = COLORS.zero; ctx.lineWidth = 1.2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
    }
    for (const m of opts.lines || []) {
      if (m.x == null || m.x < scales.x.min || m.x > scales.x.max) continue;
      const x = scales.x.getPixelForValue(m.x);
      ctx.strokeStyle = m.color; ctx.lineWidth = 1.3; ctx.setLineDash(m.dash || [5, 4]);
      ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke();
    }
    ctx.restore();
  },
};

let registered = false;
function ensure() {
  if (registered || typeof Chart === 'undefined') return;
  Chart.register(markers);
  Chart.defaults.font.family = "'Manrope', system-ui, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = COLORS.tick;
  registered = true;
}

const fmtNum = (v) => {
  const a = Math.abs(v);
  const d = a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 4;
  return v.toFixed(d).replace('-', '−');
};

function tickFmt(value, _i, ticks) {
  let step = ticks.length > 1 ? Math.abs(ticks[1].value - ticks[0].value) : Math.abs(value);
  if (!(step > 0)) step = 1;
  const d = Math.min(6, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  return (+value).toFixed(d).replace('-', '−');
}

/**
 * series: [{ data: [[x,y]...], kind: 'path' | 'base' }]
 * opts: { discrete, zero, lines, log, xmax, xLabel }
 */
export function drawChart(canvas, series, opts) {
  ensure();
  const datasets = series.map((s) => {
    const isBase = s.kind === 'base';
    return {
      label: s.label,
      data: s.data.map(([x, y]) => ({ x, y })),
      borderColor: isBase ? COLORS.base : COLORS.path,
      backgroundColor: isBase ? COLORS.base : COLORS.path,
      borderWidth: isBase ? 1.6 : (opts.discrete ? 1.4 : 2.2),
      borderDash: isBase ? [2, 4] : [],
      pointRadius: !isBase && opts.discrete ? 2.2 : 0,
      pointHoverRadius: 4,
      tension: 0,
      fill: false,
      order: isBase ? 2 : 1,
    };
  });
  return new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      normalized: true,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      layout: { padding: { top: 6, right: 6 } },
      scales: {
        x: {
          type: 'linear', min: 0, max: opts.xmax,
          grid: { color: COLORS.grid, drawTicks: false },
          border: { display: false },
          ticks: { maxTicksLimit: 7, padding: 6 },
          title: { display: true, text: opts.xLabel || 't', padding: 0, font: { size: 11, style: 'italic' } },
        },
        y: {
          type: opts.log ? 'logarithmic' : 'linear',
          grid: { color: COLORS.grid, drawTicks: false },
          border: { display: false },
          ticks: { maxTicksLimit: 6, padding: 6, callback: opts.log ? (v) => fmtNum(+v) : tickFmt },
          grace: '6%',
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#23214a', padding: 8, displayColors: false,
          callbacks: {
            title: (items) => `t = ${(+items[0].parsed.x).toFixed(opts.discrete ? 0 : 1)}`,
            label: (it) => `${it.dataset.label}: ${fmtNum(it.parsed.y)}`,
          },
        },
        markers: { zero: !!opts.zero, lines: opts.lines || [] },
      },
    },
  });
}

// ───────────── диаграммы с подписями кривых (основная диаграмма, сходимость) ─────────────
// Подписи кривых рисуются на холсте цветом кривой, рядом с её концом, в свободном месте;
// подписи раздвигаются по вертикали, чтобы не налезать друг на друга. Без выносок.
const curveLabels = {
  id: 'curveLabels',
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea: a, scales } = chart;
    ctx.save();
    ctx.font = "600 12px 'Manrope', system-ui, sans-serif";
    // вертикальные и горизонтальные отметки
    let vl = 0;
    for (const m of opts.vlines || []) {
      if (m.x == null || m.x < scales.x.min || m.x > scales.x.max) continue;
      const x = scales.x.getPixelForValue(m.x);
      ctx.strokeStyle = m.color; ctx.lineWidth = 1.2; ctx.setLineDash(m.dash || [3, 4]);
      const yTop = m.yTo != null ? scales.y.getPixelForValue(m.yTo) : a.top;
      ctx.beginPath(); ctx.moveTo(x, a.bottom); ctx.lineTo(x, yTop); ctx.stroke();
      if (m.label) {
        ctx.setLineDash([]); ctx.fillStyle = m.color; ctx.textBaseline = 'bottom';
        const w = ctx.measureText(m.label).width;
        const lx = Math.min(x + 4, a.right - w - 2);
        ctx.fillText(m.label, lx, a.bottom - 4 - vl * 15);
        vl++;
      }
    }
    for (const m of opts.hlines || []) {
      if (m.y == null || m.y < scales.y.min || m.y > scales.y.max) continue;
      const y = scales.y.getPixelForValue(m.y);
      ctx.strokeStyle = m.color; ctx.lineWidth = 1.2; ctx.setLineDash(m.dash || [3, 4]);
      ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
    }
    ctx.setLineDash([]);
    // подписи кривых у правого конца видимой части
    const items = [];
    chart.data.datasets.forEach((ds, i) => {
      if (!ds.curveLabel || !chart.isDatasetVisible(i)) return;
      const pts = ds.data.filter((p) => p.x >= scales.x.min && p.x <= scales.x.max && p.y >= scales.y.min && p.y <= scales.y.max);
      if (!pts.length) return;
      const end = pts[pts.length - 1];
      const px = scales.x.getPixelForValue(end.x), py = scales.y.getPixelForValue(end.y);
      const w = ctx.measureText(ds.curveLabel).width;
      items.push({ text: ds.curveLabel, color: ds.borderColor, x: Math.min(px - w - 6, a.right - w - 4), y: py - 9, w });
    });
    items.sort((p, q) => p.y - q.y);
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 15) items[i].y = items[i - 1].y + 15;
    for (let i = items.length - 2; i >= 0; i--) if (items[i].y > items[i + 1].y - 15) items[i].y = items[i + 1].y - 15;
    ctx.textBaseline = 'middle';
    for (const it of items) {
      const y = Math.max(a.top + 7, Math.min(a.bottom - 7, it.y));
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(it.x - 2, y - 8, it.w + 4, 16);
      ctx.fillStyle = it.color; ctx.fillText(it.text, it.x, y);
    }
    ctx.restore();
  },
};

/**
 * series: [{ data: [[x,y]...], label, color, width, dash, points, pointRadius, curveLabel }]
 * opts: { xLabel, xmin, xmax, ymin, ymax, vlines: [{x, color, dash, label, yTo}], hlines: [{y, color, dash}], xFmt, discrete }
 */
export function drawDiagram(canvas, series, opts) {
  ensure();
  if (!Chart.registry.plugins.get('curveLabels')) Chart.register(curveLabels);
  const datasets = series.map((s) => ({
    label: s.label,
    data: s.data.map(([x, y]) => ({ x, y })),
    borderColor: s.color, backgroundColor: s.color,
    borderWidth: s.points ? 0 : (s.width ?? 2),
    borderDash: s.dash || [],
    showLine: !s.points,
    pointRadius: s.points ? (s.pointRadius ?? 3) : 0,
    pointHoverRadius: 4,
    tension: 0, fill: false,
    curveLabel: s.curveLabel,
    order: s.points ? 0 : 1,
  }));
  return new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      animation: false, responsive: true, maintainAspectRatio: false, parsing: false, normalized: true,
      interaction: { mode: 'nearest', intersect: false },
      layout: { padding: { top: 8, right: 8 } },
      scales: {
        x: {
          type: 'linear', min: opts.xmin ?? 0, max: opts.xmax,
          grid: { color: COLORS.grid, drawTicks: false }, border: { display: false },
          ticks: { maxTicksLimit: 8, padding: 6, callback: tickFmt },
          title: { display: true, text: opts.xLabel || 't', padding: 0, font: { size: 12, style: 'italic' } },
        },
        y: {
          type: 'linear', min: opts.ymin, max: opts.ymax,
          grid: { color: COLORS.grid, drawTicks: false }, border: { display: false },
          ticks: { maxTicksLimit: 7, padding: 6, callback: tickFmt },
          grace: opts.ymax == null ? '6%' : 0,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#23214a', padding: 8, displayColors: false,
          callbacks: {
            title: (items) => `${opts.xLabel || 't'} = ${(+items[0].parsed.x).toFixed(opts.discrete ? 0 : 2)}`,
            label: (it) => `${it.dataset.label}: ${fmtNum(it.parsed.y)}`,
          },
        },
        curveLabels: { vlines: opts.vlines || [], hlines: opts.hlines || [] },
      },
    },
  });
}
