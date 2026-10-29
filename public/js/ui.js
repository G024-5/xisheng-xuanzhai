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

/* ---------------- 应用内弹窗（替代原生 confirm / prompt） ---------------- */

let dlg = null;

function ensureDialog() {
  if (dlg) return dlg;
  dlg = {
    root: $('#dlg'),
    title: $('#dlgTitle'),
    text: $('#dlgText'),
    input: $('#dlgInput'),
    ok: $('#dlgOk'),
    cancel: $('#dlgCancel'),
  };
  return dlg;
}

export function dialog({ title = '确认', text = '', input = null, okText = '确定', danger = false } = {}) {
  const d = ensureDialog();

  return new Promise((resolve) => {
    d.title.textContent = title;
    d.text.textContent = text;
    d.text.hidden = !text;
    d.ok.textContent = okText;
    d.ok.classList.toggle('danger', danger);

    if (input) {
      d.input.hidden = false;
      d.input.value = input.value || '';
      d.input.placeholder = input.placeholder || '';
      d.input.classList.toggle('is-invalid', false);
    } else {
      d.input.hidden = true;
    }

    d.root.hidden = false;
    setTimeout(() => (input ? d.input : d.ok).focus(), 20);

    const done = (val) => {
      d.root.hidden = true;
      d.ok.onclick = null;
      d.cancel.onclick = null;
      d.root.onclick = null;
      document.removeEventListener('keydown', onKey, true);
      resolve(val);
    };

    const submit = () => {
      if (!input) return done(true);
      const v = d.input.value.trim();
      if (!v) { d.input.classList.add('is-invalid'); d.input.focus(); return; }
      done(v);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); done(null); }
      if (e.key === 'Enter') { e.stopPropagation(); submit(); }
    };

    d.ok.onclick = submit;
    d.cancel.onclick = () => done(null);
    d.root.onclick = (e) => { if (e.target === d.root) done(null); };
    document.addEventListener('keydown', onKey, true);
  });
}

export const confirmDialog = (text, opts = {}) =>
  dialog({ ...opts, text }).then((v) => v === true);

export const promptDialog = (title, { placeholder = '', value = '', okText = '确定' } = {}) =>
  dialog({ title, input: { placeholder, value }, okText }).then((v) => (typeof v === 'string' ? v : null));
