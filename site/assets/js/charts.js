// Обёртка над Chart.js: малые графики IRF и уровней переменных, диаграммы моделей.
// Всё, что является формулой (подписи осей и кривых, отметки, всплывающие подсказки), рисуется
// не на холсте, а HTML-слоем поверх него через KaTeX.
/* global Chart */
import { texInline, rich } from './tex.js';

export const COLORS = {
  path: '#3d8acb',
  base: '#aaa3dd',
  shock: '#7c62d8',
  announce: '#b09cf5',
  zero: '#cdd1f0',
  grid: '#eef0fa',
  tick: '#7d7ca5',
};

// ───────────── HTML-слой с формулами поверх холста ─────────────
// Элементы создаются один раз и переиспользуются при перерисовке (например, при изменении размера окна).
function layer(chart) {
  if (!chart.$tex) {
    const el = document.createElement('div');
    el.className = 'chart-tex';
    chart.canvas.parentNode.append(el);
    chart.$tex = { el, items: new Map() };
  }
  return chart.$tex;
}
function texItem(chart, key, src, cls = '') {
  const L = layer(chart);
  let it = L.items.get(key);
  if (!it || it.src !== src) {
    it?.node.remove();
    const node = texInline(src);
    node.className = `chart-tex-item ${cls}`;
    L.el.append(node);
    it = { node, src };
    L.items.set(key, it);
  }
  it.used = true;
  return it.node;
}
const place = (node, x, y, color) => {
  node.style.left = `${x}px`; node.style.top = `${y}px`;
  if (color) node.style.color = color;
};

// подпись оси x: формула по центру под осью (место под неё резервирует пустой заголовок Chart.js)
function axisLabel(chart, src) {
  const sx = chart.scales.x, n = texItem(chart, 'x-axis', src, 'axis');
  place(n, (sx.left + sx.right) / 2 - n.offsetWidth / 2, sx.bottom - n.offsetHeight + 2);
}

const texLayer = {
  id: 'texLayer',
  beforeDraw(chart) { if (chart.$tex) for (const it of chart.$tex.items.values()) it.used = false; },
  afterDraw(chart, _args, opts) {
    if (opts.xLabel) axisLabel(chart, opts.xLabel);
    opts.draw?.(chart);
    if (!chart.$tex) return;
    for (const [k, it] of chart.$tex.items) if (!it.used) { it.node.remove(); chart.$tex.items.delete(k); }
  },
  afterDestroy(chart) { chart.$tex?.el.remove(); chart.$tip?.remove(); },
};

// Всплывающая подсказка — HTML с формулами (заголовок и подписи серий могут содержать $…$)
function tooltip(ctx) {
  const { chart, tooltip: tt } = ctx;
  if (!chart.$tip) {
    chart.$tip = document.createElement('div');
    chart.$tip.className = 'chart-tip';
    chart.canvas.parentNode.append(chart.$tip);
  }
  const tip = chart.$tip;
  if (tt.opacity === 0) { tip.style.opacity = 0; return; }
  tip.replaceChildren(
    ...(tt.title || []).map((t) => rich(t, 'div', { class: 'tt' })),
    ...tt.body.flatMap((b) => b.lines).map((t) => rich(t, 'div')));
  tip.style.opacity = 1;
  const box = chart.canvas.parentNode.clientWidth;
  const x = Math.min(Math.max(tt.caretX + 10, 0), box - tip.offsetWidth);
  tip.style.left = `${x}px`;
  tip.style.top = `${Math.max(0, tt.caretY - tip.offsetHeight - 8)}px`;
}

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
  Chart.register(markers, texLayer, curveLines);
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

// общие настройки осей и подсказки; xTitleSize — высота места под подпись оси x
function axes(xTitleSize) {
  return {
    x: {
      type: 'linear',
      grid: { color: COLORS.grid, drawTicks: false },
      border: { display: false },
      // пустой заголовок только резервирует место: сама подпись — формула в HTML-слое
      title: { display: true, text: ' ', padding: 0, font: { size: xTitleSize } },
    },
    y: { grid: { color: COLORS.grid, drawTicks: false }, border: { display: false } },
  };
}
const tooltipOpts = (title) => ({
  enabled: false, external: tooltip,
  callbacks: { title, label: (it) => `${it.dataset.label}: ${fmtNum(it.parsed.y)}` },
});

/**
 * series: [{ data: [[x,y]...], label, kind: 'path' | 'base' }] — label может содержать формулы $…$
 * opts: { discrete, zero, lines, log, xmax, xLabel }
 */
export function drawChart(canvas, series, opts) {
  ensure();
  const xLabel = opts.xLabel || 't';
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
  const sc = axes(15);
  Object.assign(sc.x, { min: 0, max: opts.xmax, ticks: { maxTicksLimit: 7, padding: 6 } });
  Object.assign(sc.y, {
    type: opts.log ? 'logarithmic' : 'linear',
    ticks: { maxTicksLimit: 6, padding: 6, callback: opts.log ? (v) => fmtNum(+v) : tickFmt },
    grace: '6%',
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
      scales: sc,
      plugins: {
        legend: { display: false },
        tooltip: tooltipOpts((items) => `$${xLabel} = ${(+items[0].parsed.x).toFixed(opts.discrete ? 0 : 1)}$`),
        markers: { zero: !!opts.zero, lines: opts.lines || [] },
        texLayer: { xLabel },
      },
    },
  });
}

// ───────────── диаграммы с подписями кривых (основная диаграмма, сходимость) ─────────────
// Линии отметок рисуются на холсте; их подписи и подписи кривых — формулы в HTML-слое,
// цветом кривой, над правым концом её видимой части, раздвинутые по вертикали, без выносок.
const curveLines = {
  id: 'curveLines',
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx, chartArea: a, scales } = chart;
    ctx.save();
    for (const m of opts.vlines || []) {
      if (m.x == null || m.x < scales.x.min || m.x > scales.x.max) continue;
      const x = scales.x.getPixelForValue(m.x);
      ctx.strokeStyle = m.color; ctx.lineWidth = 1.2; ctx.setLineDash(m.dash || [3, 4]);
      const yTop = m.yTo != null ? scales.y.getPixelForValue(m.yTo) : a.top;
      ctx.beginPath(); ctx.moveTo(x, a.bottom); ctx.lineTo(x, yTop); ctx.stroke();
    }
    for (const m of opts.hlines || []) {
      if (m.y == null || m.y < scales.y.min || m.y > scales.y.max) continue;
      const y = scales.y.getPixelForValue(m.y);
      ctx.strokeStyle = m.color; ctx.lineWidth = 1.2; ctx.setLineDash(m.dash || [3, 4]);
      ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
    }
    ctx.restore();
  },
};

function curveLabels(chart, vlines) {
  const { chartArea: a, scales } = chart;
  // подписи вертикальных отметок — у оси x, друг над другом; их прямоугольники подписи кривых обходят
  const taken = [];
  vlines.forEach((m, i) => {
    if (!m.label || m.x == null || m.x < scales.x.min || m.x > scales.x.max) return;
    const n = texItem(chart, `v${i}`, m.label, 'mark');
    const w = n.offsetWidth, h = n.offsetHeight;
    const x = Math.min(scales.x.getPixelForValue(m.x) + 4, a.right - w - 2), y = a.bottom - 4 - h - taken.length * (h + 1);
    place(n, x, y, m.color);
    taken.push({ x, y, w, h });
  });
  // подписи кривых у правого конца видимой части
  const items = [];
  chart.data.datasets.forEach((ds, i) => {
    if (!ds.curveLabel || !chart.isDatasetVisible(i)) return;
    const pts = ds.data.filter((p) => p.x >= scales.x.min && p.x <= scales.x.max && p.y >= scales.y.min && p.y <= scales.y.max);
    if (!pts.length) return;
    const end = pts[pts.length - 1];
    const n = texItem(chart, `c${i}`, ds.curveLabel, 'curve');
    const w = n.offsetWidth, h = n.offsetHeight;
    const px = scales.x.getPixelForValue(end.x), x = Math.min(px - w - 6, a.right - w - 4);
    // над своей кривой: нижний край подписи выше кривой на всём отрезке под подписью
    let top = scales.y.getPixelForValue(end.y);
    for (const p of pts) {
      const qx = scales.x.getPixelForValue(p.x);
      if (qx >= x - 2 && qx <= x + w + 2) top = Math.min(top, scales.y.getPixelForValue(p.y));
    }
    items.push({ n, color: ds.borderColor, x, y: top - h - 3, w, h });
  });
  // снизу вверх: если подпись налезает на уже поставленную (или на подпись отметки), поднимаем её выше
  const placed = [...taken];
  items.sort((p, q) => q.y - p.y);
  for (const it of items) {
    let y = Math.min(a.bottom - it.h, it.y);
    for (let k = 0; k < placed.length + 1; k++) {
      const r = placed.find((q) => it.x < q.x + q.w && q.x < it.x + it.w && y < q.y + q.h && q.y < y + it.h);
      if (!r) break;
      y = r.y - it.h - 1;
    }
    y = Math.max(a.top, y);
    place(it.n, it.x, y, it.color);
    placed.push({ x: it.x, y, w: it.w, h: it.h });
  }
}

/**
 * series: [{ data: [[x,y]...], label, color, width, dash, points, pointRadius, curveLabel }]
 *   label — текст с формулами $…$ (для подсказки), curveLabel — формула TeX у кривой
 * opts: { xLabel, xmin, xmax, ymin, ymax, vlines: [{x, color, dash, label, yTo}], hlines: [{y, color, dash}], discrete }
 *   xLabel и label отметок — формулы TeX
 */
export function drawDiagram(canvas, series, opts) {
  ensure();
  const xLabel = opts.xLabel || 't';
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
  const sc = axes(16);
  Object.assign(sc.x, { min: opts.xmin ?? 0, max: opts.xmax, ticks: { maxTicksLimit: 8, padding: 6, callback: tickFmt } });
  Object.assign(sc.y, {
    type: 'linear', min: opts.ymin, max: opts.ymax,
    ticks: { maxTicksLimit: 7, padding: 6, callback: tickFmt },
    grace: opts.ymax == null ? '6%' : 0,
  });
  const vlines = opts.vlines || [];
  return new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      animation: false, responsive: true, maintainAspectRatio: false, parsing: false, normalized: true,
      interaction: { mode: 'nearest', intersect: false },
      layout: { padding: { top: 8, right: 8 } },
      scales: sc,
      plugins: {
        legend: { display: false },
        tooltip: tooltipOpts((items) => `$${xLabel} = ${(+items[0].parsed.x).toFixed(opts.discrete ? 0 : 2)}$`),
        curveLines: { vlines, hlines: opts.hlines || [] },
        texLayer: { xLabel, draw: (chart) => curveLabels(chart, vlines) },
      },
    },
  });
}
