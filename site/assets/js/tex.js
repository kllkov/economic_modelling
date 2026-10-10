// Формулы через KaTeX: общий код для интерфейса (app.js) и подписей на графиках (charts.js).
/* global katex */

const hasKatex = () => typeof katex !== 'undefined';

function render(str, node, display) {
  if (hasKatex()) katex.render(str, node, { displayMode: display, throwOnError: false, strict: 'ignore' });
  else node.textContent = str;
  return node;
}

// выключная формула
export const tex = (str) => render(str, Object.assign(document.createElement('div'), { className: 'tex' }), true);
// строчная формула
export const texInline = (str) => render(str, document.createElement('span'), false);

// Текст с формулами между $…$
export function rich(str, tag = 'span', attrs = {}) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  String(str ?? '').split('$').forEach((part, i) => {
    if (!part) return;
    node.append(i % 2 === 1 ? texInline(part) : document.createTextNode(part));
  });
  return node;
}
