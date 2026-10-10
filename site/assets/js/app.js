import { MODELS, GLYPHS } from './models/registry.js';
import { drawChart, drawDiagram, COLORS } from './charts.js';
import { tex, texInline, rich } from './tex.js';

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

function glyph(name, w = 100, h = 64) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 64');
  svg.setAttribute('class', 'glyph');
  svg.setAttribute('width', w); svg.setAttribute('height', h);
  svg.setAttribute('aria-hidden', 'true');
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
  svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#b09cf5"/><stop offset="1" stop-color="#5aa9e6"/></linearGradient></defs>
    <path d="M6 58 H96" stroke="#e4e6f7" stroke-width="1.5"/><path d="M6 4 V58" stroke="#e4e6f7" stroke-width="1.5"/>
    <path d="${GLYPHS[name]}" fill="none" stroke="url(#${id})" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return svg;
}

// ───────────────────────────── каталог ─────────────────────────────

function renderTiles() {
  const box = $('#tiles');
  box.innerHTML = '';
  for (const m of MODELS) {
    const ready = !!m.load && !m.wip;
    box.append(el('article', { class: `tile${ready ? ' featured' : ''}` },
      el('div', { class: 'tile-top' }, glyph(m.glyph),
        el('span', { class: `status ${ready ? 'ready' : m.wip ? 'wip' : 'soon'}` }, ready ? 'Доступно' : m.wip ? 'В разработке' : 'Скоро')),
      el('h3', {}, m.title),
      el('div', { class: 'sub' }, m.subtitle),
      el('p', {}, m.blurb),
      el('div', { class: 'chips' }, m.tags.map((t) => el('span', { class: 'chip' }, t))),
      el('div', { class: 'tile-actions' },
        el('a', { class: 'btn btn-ghost btn-sm', href: `#${m.id}/about` }, 'О модели'),
        el('a', { class: `btn btn-sm ${ready ? 'btn-primary' : 'btn-ghost'}`, href: `#${m.id}` }, 'Симуляция')),
    ));
  }
}

// ───────────────────────────── состояние / URL ─────────────────────────────

function parseHash() {
  const raw = decodeURIComponent(location.hash.slice(1));
  const [path, query = ''] = raw.split('?');
  const [id, page = 'sim'] = path.split('/');
  return { id, page, params: Object.fromEntries(new URLSearchParams(query)) };
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

let routeToken = 0; // номер последнего перехода: устаревшая асинхронная загрузка модели не рисуется
async function route() {
  const token = ++routeToken;
  const { id, page, params } = parseHash();
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
  window.scrollTo({ top: 0 });
  if (page === 'about') {
    document.title = `${model.title} — о модели`;
    current = null;
    renderAbout(model);
    return;
  }
  document.title = `${model.title} — симуляция`;
  if (!model.load) { renderStub(model); current = null; return; }
  $('#workspace .wrap').replaceChildren(); // не показываем прежнюю модель, пока грузится новая
  current = null;
  const mod = await model.load();
  if (token !== routeToken) return;
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

function wsHeader(model, page) {
  return el('div', { class: 'ws-head' },
    el('div', {},
      el('a', { class: 'back-link', href: 'models.html' }, '← Все модели'),
      el('h1', {}, model.title),
      el('div', { class: 'sub' }, model.subtitle)),
    el('div', { class: 'seg tabs' },
      el('a', { class: page === 'about' ? 'on' : '', href: `#${model.id}/about` }, 'О модели'),
      el('a', { class: page === 'sim' ? 'on' : '', href: `#${model.id}` }, 'Симуляция')));
}

function renderAbout(model) {
  const ws = $('#workspace .wrap');
  ws.innerHTML = '';
  ws.append(wsHeader(model, 'about'));
  if (!model.load) {
    ws.append(el('div', { class: 'block stub-visual', style: 'min-height:260px' },
      el('div', {}, glyph(model.glyph, 180, 110))));
    return;
  }
  const a = model.about;
  ws.append(el('div', { class: 'about' },
    el('section', { class: 'block about-lead' }, a.lead.map((p) => rich(p, 'p'))),
    ...a.sections.map((sec, i) => el('section', { class: 'block' },
      el('div', { class: 'block-head' }, el('h2', {}, el('span', { class: 'n' }, String(i + 1)), sec.title)),
      el('div', { class: 'sys' }, sec.eqs.map((e) => el('div', { class: 'sys-row' },
        rich(e.label, 'div', { class: 'lab' }), tex(e.tex)))))),
    el('section', { class: 'block refs' },
      el('div', { class: 'block-head' }, el('h2', {}, 'Исходные статьи')),
      el('ol', {}, a.refs.map((r) => el('li', { html: r })))),
    el('div', { class: 'about-cta' },
      el('a', { class: 'btn btn-primary', href: `#${model.id}` }, 'Перейти к симуляции →'))));
}

function renderStub(model) {
  const ws = $('#workspace .wrap');
  ws.innerHTML = '';
  ws.append(wsHeader(model, 'sim'));
  ws.append(el('div', { class: 'block stub' },
    el('div', {},
      el('div', { class: 'block-head' }, el('h2', {}, 'Что будет в симуляторе')),
      el('ul', { class: 'stub-list' }, model.planned.map(([k, v]) => el('li', {}, el('b', {}, k), rich(v))))),
    el('div', { class: 'stub-visual' },
      el('div', {}, glyph(model.glyph, 180, 110)))));
}

function renderWorkspace() {
  const { model } = current;
  const ws = $('#workspace .wrap');
  ws.innerHTML = '';
  ws.append(wsHeader(model, 'sim'));
  ws.append(el('div', { class: 'ws-grid' },
    el('aside', { class: 'panel', id: 'panel' }),
    el('div', { class: 'results', id: 'results' })));
  renderPanel();
}

function renderPanel() {
  const { mod, state } = current;
  const panel = $('#panel');
  const scroll = panel.scrollTop;
  panel.innerHTML = '';
  panel.append(el('div', { class: 'panel-title' }, el('h2', {}, 'Настройки симуляции')));
  let grid = null;
  for (const c of mod.controls) {
    if (c.section) { panel.append(el('div', { class: 'sec' }, c.section)); grid = null; continue; }
    if (c.show && !c.show(state)) continue;
    const node = control(c);
    if (c.type === 'number' && !c.slider) {
      if (!grid) { grid = el('div', { class: 'num-row' }); panel.append(grid); }
      grid.append(node);
    } else { grid = null; panel.append(node); }
  }
  panel.append(el('div', { class: 'panel-actions' },
    el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => {
      current.state = { ...mod.defaults }; renderPanel(); schedule(); } }, 'Сбросить'),
    el('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => run() }, 'Симулировать')));
  panel.scrollTop = scroll;
}

function control(c) {
  const { state } = current;
  const label = val(c.label, state);
  const hint = val(c.hint, state);
  const wrap = el('div', { class: 'ctl' });
  const id = `c-${c.id}`;
  if (c.type === 'segmented') {
    wrap.append(rich(label, 'div', { class: 'lbl' }));
    wrap.append(el('div', { class: 'seg', role: 'group' }, val(c.options, state).map((o) =>
      el('button', { type: 'button', class: state[c.id] === o.v ? 'on' : '', onclick: () => set(c.id, o.v) }, rich(o.l)))));
  } else if (c.type === 'select' && c.rich) {
    // выпадающий список с формулами в пунктах (нативный select их не рендерит)
    wrap.append(rich(label, 'div', { class: 'lbl' }));
    const opts = val(c.options, state);
    const cur = opts.find((o) => o.v === state[c.id]) || opts[0];
    const menu = el('div', { class: 'dd-menu', role: 'listbox' });
    let lastGroup = null;
    for (const o of opts) {
      const g = c.groupLabel ? c.groupLabel(o.v) : null;
      if (g && g !== lastGroup) { menu.append(el('div', { class: 'dd-group' }, g)); lastGroup = g; }
      menu.append(el('button', { type: 'button', role: 'option', class: `dd-item${o.v === state[c.id] ? ' on' : ''}`,
        onclick: (e) => { e.stopPropagation(); set(c.id, o.v); } }, rich(o.l)));
    }
    const dd = el('div', { class: 'dd' },
      el('button', { type: 'button', class: 'dd-btn', id, 'aria-haspopup': 'listbox',
        onclick: (e) => { e.stopPropagation(); const open = dd.classList.contains('open'); closeDropdowns(); if (!open) dd.classList.add('open'); } },
        rich(cur?.l ?? ''), el('span', { class: 'dd-chev', 'aria-hidden': 'true' }, '▾')),
      menu);
    wrap.append(dd);
  } else if (c.type === 'select') {
    wrap.append(rich(label, 'label', { for: id }));
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
    wrap.append(rich(label, 'label', { for: id }));
    // текстовое поле вместо type=number: браузер с русской локалью показывал бы десятичную запятую
    const step = +val(c.step, state) || 0.01;
    const dec = Math.max(0, (String(step).split('.')[1] || '').length);
    const show = (v) => String(+(+v).toFixed(Math.max(dec, 6)));
    const inp = el('input', { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', value: show(state[c.id]) });
    const parse = (t) => parseFloat(String(t).replace(',', '.').replace(/\s/g, ''));
    inp.addEventListener('input', () => {
      if (inp.value.includes(',')) { const pos = inp.selectionStart; inp.value = inp.value.replace(',', '.'); inp.setSelectionRange(pos, pos); }
    });
    const bump = (dir) => {
      let v = parse(inp.value); if (!Number.isFinite(v)) v = +state[c.id] || 0;
      v = +(v + dir * step).toFixed(Math.max(dec, 0));
      if (c.min != null) v = Math.max(c.min, v);
      if (c.max != null) v = Math.min(c.max, v);
      inp.value = show(v);
      inp.dispatchEvent(new Event('input')); inp.dispatchEvent(new Event('change'));
    };
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); bump(e.key === 'ArrowUp' ? 1 : -1); }
    });
    const numBox = el('div', { class: 'num-box' }, inp,
      el('div', { class: 'num-spin' },
        el('button', { type: 'button', tabindex: '-1', 'aria-label': 'больше', onclick: () => bump(1) }, '▴'),
        el('button', { type: 'button', tabindex: '-1', 'aria-label': 'меньше', onclick: () => bump(-1) }, '▾')));
    if (c.slider) {
      const range = el('input', { type: 'range', class: 'range', value: state[c.id], step: val(c.step, state), min: c.min, max: c.max,
        'aria-label': c.id });
      const paint = () => {
        const p = ((+range.value - c.min) / (c.max - c.min)) * 100;
        range.style.setProperty('--p', `${Math.max(0, Math.min(100, p))}%`);
      };
      paint();
      range.addEventListener('input', () => { inp.value = show(range.value); state[c.id] = +range.value; paint(); schedule(); });
      inp.addEventListener('input', () => {
        const v = parse(inp.value);
        if (Number.isFinite(v)) { state[c.id] = v; range.value = v; paint(); schedule(); }
      });
      wrap.append(el('div', { class: 'slider-row' }, range, numBox));
    } else {
      inp.addEventListener('input', () => { const v = parse(inp.value); if (Number.isFinite(v)) { state[c.id] = v; schedule(); } });
      inp.addEventListener('change', () => { const v = parse(inp.value); if (Number.isFinite(v)) set(c.id, v); });
      wrap.append(numBox);
    }
  }
  if (hint) wrap.append(rich(hint, 'div', { class: 'hint' }));
  return wrap;
}

function closeDropdowns() { document.querySelectorAll('.dd.open').forEach((d) => d.classList.remove('open')); }
document.addEventListener('click', closeDropdowns);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdowns(); });

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

// формула + та же формула в числах при текущих параметрах
function eqWithNum(t, num) {
  return el('div', { class: 'eq' }, tex(t), num ? el('div', { class: 'eq-num' }, tex(num)) : null);
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
  const groups = F.problem || (cen ? F.cen : F.dec);
  const cls = (a) => (a.startsWith('Домох') ? 'hh' : a.startsWith('Фирм') ? 'firm' : a.startsWith('Рынк') ? 'mkt' : 'plan wide');
  out.append(block(1, F.problemTitle || 'Оптимизационная задача', null,
    el('div', { class: 'agents' }, groups.map((g) =>
      el('div', { class: `agent ${cls(g.agent)}` }, el('h3', {}, g.agent),
        g.system ? tex(`\\left\\{\\begin{aligned}&${g.items.join('\\\\[6pt]&')}\\end{aligned}\\right.`) : g.items.map((t) => tex(t)),
        (g.notes || []).map((t) => tex(t)))))));

  // 2. равновесие и шок
  const sys = el('div', { class: 'sys' },
    F.system.map((r) => el('div', { class: 'sys-row' }, el('div', { class: 'lab' }, r.label), eqWithNum(r.tex, r.num))),
    el('div', { class: 'sys-row shock' }, el('div', { class: 'lab' }, 'Шок'), eqWithNum(F.shock[0].tex, F.shock[0].num)));
  out.append(block(2, F.systemTitle || 'Условия равновесия', el('span', { class: 'note' }, 'серым — при текущих значениях параметров'), sys));

  const res = mod.solve(state);
  if (!res.ok) {
    const box = el('div', { class: 'callout err' }, el('b', {}, 'Не удалось решить модель. '));
    res.errors.forEach((e) => box.append(rich(`${e} `)));
    out.append(box);
    return;
  }

  // 3. стационар
  const rows = mod.steadyTable(state, res);
  const showAfter = rows.some((r) => r.after !== r.before);
  const table = el('table', { class: 'ss' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Величина'), el('th', {}, 'Смысл'),
      el('th', { class: 'v' }, showAfter ? (F.ssCols?.[0] || 'до шока') : 'значение'), showAfter ? el('th', { class: 'v' }, F.ssCols?.[1] || 'после шока') : null)),
    el('tbody', {}, rows.map((r) => el('tr', {},
      el('td', {}, texInline(r.sym)), rich(r.name, 'td', { class: 'name' }),
      el('td', { class: 'v' }, r.before),
      showAfter ? el('td', { class: `v${r.after !== r.before ? ' chg' : ''}` }, r.after) : null))));
  let num = 3;
  const extraDraws = [];
  const addExtra = (X) => {
    const grid = el('div', { class: `charts${X.diagram ? ' diagram' : ''}` });
    const legend = el('div', { class: 'chart-legend' }, X.legend.map((L) => el('span', {},
      L.point ? el('i', { class: 'pt', style: `background:${L.color}` })
        : el('i', { class: L.dash ? 'dash' : '', style: `border-color:${L.color}` }),
      rich(L.label))));
    out.append(block(num++, X.title, null, legend, grid));
    for (const C of X.charts) {
      const cv = el('canvas');
      grid.append(el('div', { class: 'chart-card' },
        C.title ? el('div', { class: 'ct' }, el('span', {}, C.sym ? `${C.title}, ` : C.title, C.sym ? texInline(C.sym) : null), el('span', { class: 'u' }, C.unit || '')) : null,
        el('div', { class: 'chart-box' }, cv)));
      extraDraws.push(() => current.charts.push(drawDiagram(cv, C.series, C.opts)));
    }
  };
  const extras = mod.extraBlocks ? mod.extraBlocks(state, res) : [];
  extras.filter((X) => X.beforeSS).forEach(addExtra);

  out.append(block(num++, F.ssTitle || 'Стационарное состояние', el('span', { class: 'note' }, F.ssNote ? F.ssNote(showAfter) : showAfter ? 'Перманентный шок сдвигает стационар'
      : res.permanentChange ? 'В единицах на эффективного работника стационар не меняется' : 'Шок не меняет стационар'),
    el('div', { class: 'ss-grid' }, el('div', {}, F.ss.map((r) => eqWithNum(r.tex, r.num))), el('div', { style: 'overflow-x:auto' }, table))));

  // 4. IRF и 5. уровни
  const specs = mod.chartSpecs(state);
  const discrete = state.time === 'discrete';
  const lines = [];
  const DASH_INFO = [9, 3, 2, 3], DASH_SHOCK = [5, 4];   // объявление — штрихпунктир, шок — пунктир
  if (res.marks.t0 != null) lines.push({ x: res.marks.t0, color: COLORS.announce, dash: DASH_INFO });
  lines.push({ x: res.marks.tHat, color: COLORS.shock, dash: DASH_SHOCK });
  const vMark = (color, dash) => {
    const sp = document.createElement('span'); sp.className = 'vmark';
    sp.innerHTML = `<svg width="4" height="16" viewBox="0 0 4 16" aria-hidden="true"><line x1="2" x2="2" y1="0" y2="16" stroke="${color}" stroke-width="2" stroke-dasharray="${dash.map((d) => d * 0.75).join(' ')}"/></svg>`;
    return sp;
  };
  const legendItems = (withBase) => el('div', { class: 'chart-legend' },
    el('span', {}, el('i', { style: `border-color:${COLORS.path}` }), withBase ? 'траектория после шока' : 'отклик'),
    withBase ? el('span', {}, el('i', { class: 'dot', style: `border-color:${COLORS.base}` }), 'базовый путь без шока') : null,
    res.marks.t0 != null ? el('span', {}, vMark(COLORS.announce, DASH_INFO), rich(`объявление $t_0 = ${res.marks.t0}$`)) : null,
    el('span', {}, vMark(COLORS.shock, DASH_SHOCK), rich(`шок $\\hat t = ${res.marks.tHat}$`)));

  const flat = specs.every((sp) => res.irf[sp.id].every((v) => Math.abs(v) < 1e-7));
  const irfGrid = el('div', { class: 'charts' });
  out.append(block(num++, 'Импульсные отклики (IRF)',
    el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => downloadCSV(res, specs) }, 'Скачать CSV'),
    legendItems(false),
    flat ? rich(F.flatNote || 'Шок не выводит экономику из стационара: при текущих параметрах он не меняет ни стационарное состояние, ни условия оптимальности на траектории. Например, $\\sigma$ влияет на стационар только при $g > 0$.', 'div', { class: 'callout warn', style: 'margin:0 0 12px' }) : null,
    irfGrid));

  const lvlGrid = el('div', { class: 'charts' });
  const effPossible = specs.some((s) => s.effAvailable);
  const aggPossible = specs.some((s) => s.aggSym);
  if (!effPossible && view.levelUnits === 'eff') view.levelUnits = 'worker';
  const unitBtn = (v, label) => el('button', { type: 'button', class: view.levelUnits === v ? 'on' : '', onclick: () => { view.levelUnits = v; run(); } }, label);
  const toggles = el('div', { class: 'toggles' },
    aggPossible ? el('div', { class: 'seg' }, unitBtn('agg', 'в уровнях'), unitBtn('worker', 'на работника'), effPossible ? unitBtn('eff', 'на эфф. работника') : null) : null,
    el('div', { class: 'seg' },
      el('button', { type: 'button', class: view.levelScale === 'linear' ? 'on' : '', onclick: () => { view.levelScale = 'linear'; run(); } }, 'линейная'),
      el('button', { type: 'button', class: view.levelScale === 'log' ? 'on' : '', onclick: () => { view.levelScale = 'log'; run(); } }, 'лог-шкала')));
  out.append(block(num++, 'Траектории переменных', toggles, legendItems(true), lvlGrid));

  // дополнительные блоки модели (например, основная диаграмма и сходимость у Солоу)
  extras.filter((X) => !X.beforeSS).forEach(addExtra);
  extraDraws.forEach((f) => f());


  const xmax = state.horizon;
  const pairs = (ys) => res.t.map((t, i) => [t, ys[i]]);
  for (const sp of specs) {
    const c1 = el('canvas');
    irfGrid.append(el('div', { class: 'chart-card' },
      el('div', { class: 'ct' }, el('span', {}, `${sp.title}, `, texInline(sp.sym)), rich(sp.irfUnit, 'span', { class: 'u' })),
      el('div', { class: 'chart-box' }, c1)));
    current.charts.push(drawChart(c1, [{ label: sp.irfUnit.includes('п.п.') ? '$\\Delta$ (п.п.)' : '$\\Delta$ (%)', data: pairs(res.irf[sp.id]) }],
      { discrete, zero: true, lines, xmax }));

    const useEff = view.levelUnits === 'eff' && sp.effAvailable;
    const useAgg = view.levelUnits === 'agg' && sp.aggSym;
    const y = useEff ? res.eff[sp.id] : useAgg ? res.agg[sp.id] : res.levels[sp.id];
    const b = useEff ? res.baseEff[sp.id] : useAgg ? res.baseAgg[sp.id] : res.baseLevels[sp.id];
    const unit = sp.lvlUnit || '';
    const sym = useEff ? sp.sym.replace(/^([a-z])/, '\\tilde $1') : useAgg ? sp.aggSym : sp.sym;
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
