// Переключатель светлой/тёмной темы: выбор хранится в localStorage, по умолчанию светлая.
const KEY = 'theme';
export const isDark = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';

const ICONS = `<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z"/></svg>
  <svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>`;

function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try { window.localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch { /* хранилище недоступно */ }
  const b = document.querySelector('.theme-toggle');
  if (b) { b.setAttribute('aria-pressed', String(dark)); b.title = dark ? 'Светлая тема' : 'Тёмная тема'; b.setAttribute('aria-label', b.title); }
  window.dispatchEvent(new Event('themechange'));
}

const nav = typeof document !== 'undefined' ? document.querySelector('.nav') : null;
if (nav) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'theme-toggle'; b.innerHTML = ICONS;
  b.addEventListener('click', () => setTheme(!isDark()));
  nav.append(b);
  b.setAttribute('aria-pressed', String(isDark())); b.title = isDark() ? 'Светлая тема' : 'Тёмная тема'; b.setAttribute('aria-label', b.title);
}
