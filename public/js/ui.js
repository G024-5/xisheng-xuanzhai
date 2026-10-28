/** 与框架无关的小工具 */

export const $ = (sel, el = document) => el.querySelector(sel);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export function toast(msg, ms = 1800) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

/** 在已转义的 HTML 文本里高亮查询词 */
export function mark(text, q) {
  const safe = esc(text);
  if (!q) return safe;
  const needle = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return safe.replace(new RegExp(needle, 'gi'), (m) => `<mark>${m}</mark>`);
  } catch {
    return safe;
  }
}

export function shortAuthors(s) {
  if (!s) return '未知作者';
  const arr = s.split(', ');
  return arr.length > 3 ? `${arr[0]} 等 ${arr.length} 人` : s;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
