// Обёртка над Chart.js: малые графики IRF и уровней переменных.
/* global Chart */

export const COLORS = {
  path: '#11887d',
  pathFill: 'rgba(25, 169, 154, .08)',
  base: '#9b8fd0',
  shock: '#3f2f80',
  announce: '#a68ef0',
  zero: '#cfc5ef',
  grid: '#efebfa',
  tick: '#7a7398',
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
      ctx.strokeStyle = m.color; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]);
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
          backgroundColor: '#1f1b38', padding: 8, displayColors: false,
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
