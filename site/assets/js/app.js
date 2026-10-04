import { MODELS, GLYPHS } from './models/registry.js';
import { drawChart, COLORS } from './charts.js';
/* global katex */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k instanceof Node ? k : document.createTextNode(k));
  return n;
};
const val = (x, s) => (typeof x === 'function' ? x(s) : x);

function tex(str, display = true) {
  const span = el('div', { class: display ? 'tex' : 'tex-inline' });
  if (typeof katex !== 'undefined') {
    katex.render(str, span, { displayMode: display, throwOnError: false, strict: 'ignore' });
  } else span.textContent = str;
  return span;
}
function texInline(str) {
  const s = el('span');
  if (typeof katex !== 'undefined') katex.render(str, s, { displayMode: false, throwOnError: false, strict: 'ignore' });
  else s.textContent = str;
  return s;
}

function glyph(name, w = 100, h = 64) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 64');
  svg.setAttribute('class', 'glyph');
  svg.setAttribute('width', w); svg.setAttribute('height', h);
  svg.setAttribute('aria-hidden', 'true');
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
  svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#8a6fe0"/><stop offset="1" stop-color="#19a99a"/></linearGradient></defs>
    <path d="M6 58 H96" stroke="#e4def6" stroke-width="1.5"/><path d="M6 4 V58" stroke="#e4def6" stroke-width="1.5"/>
    <path d="${GLYPHS[name]}" fill="none" stroke="url(#${id})" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return svg;
}

// ───────────────────────────── каталог ─────────────────────────────

function renderTiles() {
  const box = $('#tiles');
  box.innerHTML = '';
  for (const m of MODELS) {
    const ready = !!m.load;
    box.append(el('button', { class: `tile${ready ? ' featured' : ''}`, type: 'button', onclick: () => { location.hash = m.id; } },
      el('div', { class: 'tile-top' }, glyph(m.glyph),
        el('span', { class: `status ${ready ? 'ready' : 'soon'}` }, ready ? 'Доступна' : 'Скоро')),
      el('h3', {}, m.title),
      el('div', { class: 'sub' }, m.subtitle),
      el('p', {}, m.blurb),
      el('div', { class: 'chips' }, m.tags.map((t) => el('span', { class: 'chip' }, t))),
    ));
  }
}

// ───────────────────────────── состояние / URL ─────────────────────────────

function parseHash() {
  const raw = decodeURIComponent(location.hash.slice(1));
  const [id, query = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return { id, params };
}

function writeHash(id, state, defaults) {
  const diff = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (defaults[k] !== v) diff.set(k, v);
  const q = diff.toString();
  history.replaceState(null, '', `#${id}${q ? `?${q}` : ''}`);
}

// ───────────────────────────── рабочая область ─────────────────────────────

let current = null; // { model, mod, state, charts: [] }
const view = { levelUnits: 'worker', levelScale: 'linear' };

async function route() {
  const { id, params } = parseHash();
  const model = MODELS.find((m) => m.id === id);
  destroyCharts();
  if (!model) {
    current = null;
    $('#catalog').classList.remove('hidden');
    $('#workspace').classList.add('hidden');
    document.title = 'Модели — Экономическое моделирование';
    return;
  }
  $('#catalog').classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  document.title = `${model.title} — симулятор`;
  window.scrollTo({ top: 0 });
  if (!model.load) { renderStub(model); current = null; return; }
  const mod = await model.load();
  const state = { ...mod.defaults };
  for (const [k, v] of Object.entries(params)) {
    if (!(k in state)) continue;
    state[k] = typeof mod.defaults[k] === 'number' ? Number(v) : v;
  }
  mod.normalize(state);
  current = { model, mod, state, charts: [] };
  renderWorkspace();
  run();
}

function wsHeader(model, extra) {
  return el('div', { class: 'ws-head' },
    el('div', {},
      el('button', { class: 'back-link', type: 'button', onclick: () => { history.pushState(null, '', location.pathname); route(); } },
        '← Все модели'),
      el('h1', {}, model.title),
      el('div', { class: 'sub' }, model.subtitle)),
    extra || null);
}

function renderStub(model) {
  const ws = $('#workspace .wrap');
  ws.innerHTML = '';
  ws.append(wsHeader(model, el('span', { class: 'chip' }, 'Модель в разработке')));
  ws.append(el('div', { class: 'block stub' },
    el('div', {},
      el('div', { class: 'block-head' }, el('h2', {}, 'Что будет в симуляторе')),
      el('ul', { class: 'stub-list' }, model.planned.map(([k, v]) => el('li', {}, el('b', {}, k), el('span', {}, v))))),
    el('div', { class: 'stub-visual' },
      el('div', {}, glyph(model.glyph, 180, 110),
        el('p', { style: 'margin:0' }, 'Симулятор появится после того, как заработает модель Рамсея.'),
        el('p', { style: 'margin:8px 0 0' }, el('a', { href: '#ramsey' }, 'Открыть модель Рамсея →'))))));
}

function renderWorkspace() {
  const { model } = current;
  const ws = $('#workspace .wrap');
  ws.innerHTML = '';
  ws.append(wsHeader(model, el('span', { class: 'chip teal' }, 'Perfect foresight · численное решение')));
  ws.append(el('div', { class: 'ws-grid' },
    el('aside', { class: 'panel', id: 'panel' }),
    el('div', { class: 'results', id: 'results' })));
  renderPanel();
}

function renderPanel() {
  const { mod, state } = current;
  const panel = $('#panel');
  panel.innerHTML = '';
  panel.append(el('div', { class: 'panel-title' }, el('h2', {}, 'Настройки симуляции')));
  let grid = null;
  for (const c of mod.controls) {
    if (c.section) { panel.append(el('div', { class: 'sec' }, c.section)); grid = null; continue; }
    if (c.show && !c.show(state)) continue;
    const node = control(c);
    if (c.type === 'number') {
      if (!grid) { grid = el('div', { class: 'num-row' }); panel.append(grid); }
      grid.append(node);
    } else { grid = null; panel.append(node); }
  }
  panel.append(el('div', { class: 'panel-actions' },
    el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => {
      current.state = { ...mod.defaults }; renderPanel(); schedule(); } }, 'Сбросить'),
    el('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => run() }, 'Симулировать')));
}

function control(c) {
  const { state } = current;
  const label = val(c.label, state);
  const hint = val(c.hint, state);
  const wrap = el('div', { class: 'ctl' });
  const id = `c-${c.id}`;
  if (c.type === 'segmented') {
    wrap.append(el('div', { class: 'lbl' }, label));
    wrap.append(el('div', { class: 'seg', role: 'group' }, val(c.options, state).map((o) =>
      el('button', { type: 'button', class: state[c.id] === o.v ? 'on' : '', onclick: () => set(c.id, o.v) }, o.l))));
  } else if (c.type === 'select') {
    wrap.append(el('label', { for: id }, label));
    const sel = el('select', { id, onchange: (e) => set(c.id, e.target.value) });
    const opts = val(c.options, state);
    if (c.groupLabel) {
      const groups = new Map();
      for (const o of opts) {
        const g = c.groupLabel(o.v);
        if (!groups.has(g)) groups.set(g, el('optgroup', { label: g }));
        groups.get(g).append(el('option', { value: o.v, selected: state[c.id] === o.v }, o.l));
      }
      groups.forEach((g) => sel.append(g));
    } else for (const o of opts) sel.append(el('option', { value: o.v, selected: state[c.id] === o.v }, o.l));
    if (opts.length < 2) sel.disabled = true;
    wrap.append(sel);
  } else if (c.type === 'number') {
    wrap.append(el('label', { for: id }, label));
    const inp = el('input', { id, type: 'number', value: state[c.id], step: val(c.step, state), min: c.min, max: c.max,
      oninput: (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { state[c.id] = v; schedule(); } },
      onchange: (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) set(c.id, v); } });
    wrap.append(inp);
  }
  if (hint) wrap.append(el('div', { class: 'hint' }, hint));
  return wrap;
}

function set(key, v) {
  current.state[key] = v;
  current.mod.normalize(current.state, key);
  renderPanel();
  schedule();
}

let timer = null;
function schedule() { clearTimeout(timer); timer = setTimeout(run, 160); }

// ───────────────────────────── результаты ─────────────────────────────

function destroyCharts() {
  if (current?.charts) current.charts.forEach((c) => c.destroy());
  if (current) current.charts = [];
}

function block(n, title, note, ...body) {
  return el('section', { class: 'block' },
    el('div', { class: 'block-head' }, el('h2', {}, el('span', { class: 'n' }, String(n)), title), note || null),
    ...body);
}

function run() {
  if (!current) return;
  const { mod, state, model } = current;
  writeHash(model.id, state, mod.defaults);
  const out = $('#results');
  destroyCharts();
  out.innerHTML = '';
  const F = mod.formulas(state);
  const cen = state.version === 'centralized';

  // 1. оптимизационная задача
  const groups = cen ? F.cen : F.dec;
  const cls = (a) => (a.startsWith('Домох') ? 'hh' : a.startsWith('Фирм') ? 'firm' : a.startsWith('Рынк') ? 'mkt' : 'plan wide');
  out.append(block(1, 'Оптимизационная задача', el('span', { class: 'note' }, cen ? 'Централизованная версия' : 'Децентрализованная версия'),
    el('div', { class: 'agents' }, groups.map((g) =>
      el('div', { class: `agent ${cls(g.agent)}` }, el('h3', {}, g.agent), g.items.map((t) => tex(t)))))));

  // 2. равновесие и шок
  const sys = el('div', { class: 'sys' },
    F.system.map((r) => el('div', { class: 'sys-row' }, el('div', { class: 'lab' }, r.label), tex(r.tex))),
    el('div', { class: 'sys-row shock' }, el('div', { class: 'lab' }, 'Шок'), tex(F.shock[0])));
  out.append(block(2, 'Условия равновесия', null, sys,
    el('div', { class: 'callout' }, F.shockInfo,
      cen ? ' Уравнения динамики совпадают с децентрализованной версией — траектории идентичны.' : '')));

  const res = mod.solve(state);
  if (!res.ok) {
    out.append(el('div', { class: 'callout err' }, el('b', {}, 'Не удалось решить модель. '), res.errors.join(' ')));
    return;
  }

  // 3. стационар
  const rows = mod.steadyTable(state, res);
  const showAfter = rows.some((r) => r.after !== r.before);
  const table = el('table', { class: 'ss' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Величина'), el('th', {}, 'Смысл'),
      el('th', { class: 'v' }, showAfter ? 'до шока' : 'значение'), showAfter ? el('th', { class: 'v' }, 'после шока') : null)),
    el('tbody', {}, rows.map((r) => el('tr', {},
      el('td', {}, texInline(r.sym)), el('td', { class: 'name' }, r.name),
      el('td', { class: 'v' }, r.before),
      showAfter ? el('td', { class: `v${r.after !== r.before ? ' chg' : ''}` }, r.after) : null))));
  out.append(block(3, 'Стационарное состояние', el('span', { class: 'note' }, showAfter ? 'Перманентный шок сдвигает стационар'
      : res.permanentChange ? 'В единицах на эффективного работника стационар не меняется' : 'Шок не меняет стационар'),
    el('div', { class: 'ss-grid' }, el('div', {}, F.ss.map((t) => tex(t))), el('div', { style: 'overflow-x:auto' }, table))));

  // 4. IRF и 5. уровни
  const specs = mod.chartSpecs(state);
  const discrete = state.time === 'discrete';
  const lines = [];
  if (res.marks.t0 != null) lines.push({ x: res.marks.t0, color: COLORS.announce });
  lines.push({ x: res.marks.tHat, color: COLORS.shock });
  const legendItems = (withBase) => el('div', { class: 'chart-legend' },
    el('span', {}, el('i', { style: `border-color:${COLORS.path}` }), withBase ? 'траектория после шока' : 'отклик'),
    withBase ? el('span', {}, el('i', { class: 'dot', style: `border-color:${COLORS.base}` }), 'базовый путь без шока') : null,
    res.marks.t0 != null ? el('span', {}, el('i', { class: 'v', style: `border-color:${COLORS.announce}` }), `объявление t₀ = ${res.marks.t0}`) : null,
    el('span', {}, el('i', { class: 'v', style: `border-color:${COLORS.shock}` }), `шок t̂ = ${res.marks.tHat}`));

  const flat = specs.every((sp) => res.irf[sp.id].every((v) => Math.abs(v) < 1e-7));
  const irfGrid = el('div', { class: 'charts' });
  out.append(block(4, `Импульсные отклики (IRF), ${discrete ? 'дискретное' : 'непрерывное'} время`,
    el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => downloadCSV(res, specs) }, 'Скачать CSV'),
    legendItems(false),
    flat ? el('div', { class: 'callout warn', style: 'margin:0 0 12px' }, 'Шок не выводит экономику из стационара: при текущих параметрах он не меняет ни стационарное состояние, ни условия оптимальности на траектории. Например, σ влияет на стационар только при g > 0.') : null,
    irfGrid));

  const lvlGrid = el('div', { class: 'charts' });
  const effPossible = specs.some((s) => s.effAvailable);
  if (!effPossible) view.levelUnits = 'worker';
  const toggles = el('div', { class: 'toggles' },
    effPossible ? el('div', { class: 'seg' },
      el('button', { type: 'button', class: view.levelUnits === 'worker' ? 'on' : '', onclick: () => { view.levelUnits = 'worker'; run(); } }, 'на работника'),
      el('button', { type: 'button', class: view.levelUnits === 'eff' ? 'on' : '', onclick: () => { view.levelUnits = 'eff'; run(); } }, 'на эфф. работника')) : null,
    el('div', { class: 'seg' },
      el('button', { type: 'button', class: view.levelScale === 'linear' ? 'on' : '', onclick: () => { view.levelScale = 'linear'; run(); } }, 'линейная'),
      el('button', { type: 'button', class: view.levelScale === 'log' ? 'on' : '', onclick: () => { view.levelScale = 'log'; run(); } }, 'лог-шкала')));
  out.append(block(5, 'Динамика переменных во времени', toggles, legendItems(true), lvlGrid));

  const xmax = state.horizon;
  const pairs = (ys) => res.t.map((t, i) => [t, ys[i]]);
  for (const sp of specs) {
    // IRF
    const c1 = el('canvas');
    irfGrid.append(el('div', { class: 'chart-card' },
      el('div', { class: 'ct' }, el('span', {}, `${sp.title}, `, texInline(sp.sym)), el('span', { class: 'u' }, sp.irfUnit)),
      el('div', { class: 'chart-box' }, c1)));
    current.charts.push(drawChart(c1, [{ label: sp.irfUnit === 'п.п.' ? 'откл., п.п.' : 'откл., %', data: pairs(res.irf[sp.id]) }],
      { discrete, zero: true, lines, xmax }));

    // уровни
    const useEff = view.levelUnits === 'eff' && sp.effAvailable;
    const y = useEff ? res.eff[sp.id] : res.levels[sp.id];
    const b = useEff ? res.baseEff[sp.id] : res.baseLevels[sp.id];
    const unit = sp.lvlUnit || (useEff ? 'на эфф. работника' : 'на работника');
    const sym = useEff ? sp.sym.replace(/^([a-z])/, '\\tilde $1') : sp.sym;
    const c2 = el('canvas');
    lvlGrid.append(el('div', { class: 'chart-card' },
      el('div', { class: 'ct' }, el('span', {}, `${sp.title}, `, texInline(sym)), el('span', { class: 'u' }, unit)),
      el('div', { class: 'chart-box' }, c2)));
    const positive = y.every((v) => v > 0) && b.every((v) => v > 0);
    current.charts.push(drawChart(c2, [
      { label: 'базовый путь', kind: 'base', data: pairs(b) },
      { label: 'после шока', data: pairs(y) },
    ], { discrete, lines, xmax, log: view.levelScale === 'log' && positive && !sp.lvlUnit }));
  }
}

function downloadCSV(res, specs) {
  const head = ['t', ...specs.map((s) => `irf_${s.id}`), ...specs.map((s) => `level_${s.id}`)];
  const lines = [head.join(',')];
  res.t.forEach((t, i) => {
    lines.push([t, ...specs.map((s) => res.irf[s.id][i]), ...specs.map((s) => res.levels[s.id][i])].join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `${current.model.id}-simulation.csv` });
  document.body.append(a); a.click(); a.remove();
}

renderTiles();
window.addEventListener('hashchange', route);
route();
