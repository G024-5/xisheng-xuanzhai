/**
 * PDF 阅读器（pdf.js）
 *
 * 职责：渲染页面、铺文本层、处理划词、画标注。
 * 任何一步失败都回退到 <iframe> 原生阅读器 —— 宁可少功能，不能白屏。
 */
const VERSION = 'pdfjs-4.10.38';
const COLORS = { yellow: '#ffe066', green: '#9ae6b4', blue: '#a5d8ff', pink: '#ffc9de' };

let lib = null;
let doc = null;
let host = null;
let paperId = null;
let scale = 1.15;
let pageEls = [];
let observer = null;
let rendered = new Set();
let annotations = [];
let onPageChange = () => {};
let toolbar = null;
let pendingSel = null;
let handlersAttached = false;

async function ensureLib() {
  if (lib) return lib;
  lib = await import('/vendor/pdfjs/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  return lib;
}

function el(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}

/* ---------------- 打开 / 关闭 ---------------- */

export async function open(id, hostEl, opts = {}) {
  close();
  paperId = id;
  host = hostEl;
  onPageChange = opts.onPageChange || (() => {});
  scale = Number(localStorage.getItem('pd.pdfScale')) || 1.15;

  host.innerHTML = '';
  host.classList.add('pdf-host-loading');

  try {
    const l = await ensureLib();
    doc = await l.getDocument({ url: `/api/papers/${id}/file` }).promise;

    annotations = await fetchAnnotations(id);
    await buildPages();
    host.classList.remove('pdf-host-loading');
    if (!handlersAttached) { attachSelectionHandlers(); handlersAttached = true; }
    syncZoomLabel();
    return { numPages: doc.numPages };
  } catch (err) {
    console.error('[reader] pdf.js 失败，回退到内置阅读器：', err);
    fallbackToIframe(id);
    return { numPages: 0, fallback: true };
  }
}

export function close() {
  if (observer) { observer.disconnect(); observer = null; }
  if (doc) { try { doc.destroy(); } catch { /* noop */ } doc = null; }
  rendered.clear();
  pageEls = [];
  annotations = [];
  paperId = null;
  hideToolbar();
  if (host) host.innerHTML = '';
  setPageInfo(0, 0);
}

function fallbackToIframe(id) {
  if (!host) return;
  host.innerHTML = '';
  const frame = el('iframe', 'pdf-fallback', host);
  frame.src = `/api/papers/${id}/file#toolbar=1&view=FitH`;
  frame.title = 'PDF 阅读';
  setPageInfo(0, 0);
}

/* ---------------- 页面骨架 ---------------- */

async function buildPages() {
  host.innerHTML = '';
  pageEls = [];

  const first = await doc.getPage(1);
  const baseView = first.getViewport({ scale });

  for (let n = 1; n <= doc.numPages; n++) {
    const pageEl = el('div', 'pdf-page', host);
    pageEl.dataset.page = String(n);
    pageEl.style.width = `${baseView.width}px`;
    pageEl.style.height = `${baseView.height}px`;

    el('div', 'pdf-canvas-wrap', pageEl);
    el('div', 'textLayer', pageEl).style.setProperty('--scale-factor', String(scale));
    el('div', 'hl-layer', pageEl);

    pageEls.push(pageEl);
  }

  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const n = Number(entry.target.dataset.page);
      if (!rendered.has(n)) renderPage(n);
    }
  }, { root: host, rootMargin: '800px 0px' });

  pageEls.forEach((p) => observer.observe(p));

  host.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function onScroll() {
  if (!host || !pageEls.length) return;
  const top = host.scrollTop + 60;
  let current = 1;
  for (const p of pageEls) {
    if (p.offsetTop <= top) current = Number(p.dataset.page);
    else break;
  }
  setPageInfo(current, pageEls.length);
  onPageChange(current);
}

async function renderPage(n) {
  rendered.add(n);
  const pageEl = pageEls[n - 1];
  if (!pageEl) return;

  try {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale });
    pageEl.style.width = `${viewport.width}px`;
    pageEl.style.height = `${viewport.height}px`;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const hiView = page.getViewport({ scale: scale * dpr });

    const wrap = pageEl.querySelector('.pdf-canvas-wrap');
    wrap.innerHTML = '';
    const canvas = el('canvas', null, wrap);
    canvas.width = Math.floor(hiView.width);
    canvas.height = Math.floor(hiView.height);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: hiView }).promise;

    const textDiv = pageEl.querySelector('.textLayer');
    textDiv.innerHTML = '';
    textDiv.style.setProperty('--scale-factor', String(scale));

    if (lib.setTextLayerDimensions) lib.setTextLayerDimensions(textDiv, viewport);
    else { textDiv.style.width = `${viewport.width}px`; textDiv.style.height = `${viewport.height}px`; }

    const tl = new lib.TextLayer({
      textContentSource: page.streamTextContent({ includeMarkedContent: true }),
      container: textDiv,
      viewport,
    });
    await tl.render();

    paintHighlights(n);
  } catch (err) {
    console.error('[reader] 渲染第', n, '页失败', err);
  }
}

/* ---------------- 标注 ---------------- */

async function fetchAnnotations(id) {
  try {
    const r = await fetch(`/api/papers/${id}/annotations`);
    const data = await r.json();
    return data.items || [];
  } catch {
    return [];
  }
}

function paintHighlights(n) {
  const pageEl = pageEls[n - 1];
  if (!pageEl) return;
  const layer = pageEl.querySelector('.hl-layer');
  layer.innerHTML = '';

  for (const a of annotations.filter((x) => x.page === n)) {
    for (const r of a.rects) {
      const d = el('div', 'hl', layer);
      d.style.left = `${r.x * 100}%`;
      d.style.top = `${r.y * 100}%`;
      d.style.width = `${r.w * 100}%`;
      d.style.height = `${r.h * 100}%`;
      d.style.background = COLORS[a.color] || COLORS.yellow;
      d.dataset.annId = a.id;
      d.title = a.quote.slice(0, 120);
    }
  }
}

function repaintAll() {
  for (const n of rendered) paintHighlights(n);
}

export async function reloadAnnotations() {
  if (!paperId) return;
  annotations = await fetchAnnotations(paperId);
  repaintAll();
  return annotations;
}

export function getAnnotations() {
  return annotations;
}

/* ---------------- 划词 ---------------- */

export function attachSelectionHandlers() {
  if (!host) return;
  host.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousedown', onDocMouseDown);
  window.addEventListener('scroll', hideToolbar, { passive: true });
}

function onDocMouseDown(e) {
  if (toolbar && !toolbar.contains(e.target)) hideToolbar();
}

function onMouseUp() {
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { hideToolbar(); return; }

    const text = sel.toString().replace(/\s+/g, ' ').trim();
    if (text.length < 2) { hideToolbar(); return; }

    const range = sel.getRangeAt(0);
    let node = range.commonAncestorContainer;
    if (node.nodeType === 3) node = node.parentNode;
    const pageEl = node.closest ? node.closest('.pdf-page') : null;
    if (!pageEl) { hideToolbar(); return; }

    const pageRect = pageEl.getBoundingClientRect();
    const rects = [];
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      rects.push({
        x: (r.left - pageRect.left) / pageRect.width,
        y: (r.top - pageRect.top) / pageRect.height,
        w: r.width / pageRect.width,
        h: r.height / pageRect.height,
      });
    }
    if (!rects.length) { hideToolbar(); return; }

    const last = rects[rects.length - 1];
    pendingSel = {
      page: Number(pageEl.dataset.page),
      quote: text.slice(0, 5000),
      rects,
      anchor: {
        left: pageRect.left + last.x * pageRect.width + (last.w * pageRect.width) / 2,
        top: pageRect.top + last.y * pageRect.height + last.h * pageRect.height,
      },
    };
    showToolbar(pendingSel.anchor);
  }, 10);
}

function showToolbar(anchor) {
  if (!toolbar) {
    toolbar = el('div', 'sel-toolbar');
    document.body.appendChild(toolbar);
    toolbar.innerHTML = `
      ${Object.keys(COLORS).map((c) => `<button class="sw" data-color="${c}" style="background:${COLORS[c]}" title="高亮"></button>`).join('')}
      <span class="tb-sep"></span>
      <button class="tb-quote" title="追加到笔记">引用到笔记</button>
    `;
  }
  toolbar.hidden = false;

  const w = toolbar.offsetWidth || 220;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, anchor.left - w / 2));
  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${Math.max(8, anchor.top + 10)}px`;
}

function hideToolbar() {
  if (toolbar) toolbar.hidden = true;
}

export function dismissToolbar() {
  hideToolbar();
  pendingSel = null;
}

export function onToolbarClick(handler) {
  document.addEventListener('click', (e) => {
    if (!toolbar || toolbar.hidden) return;
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.color) {
      handler({ type: 'highlight', color: btn.dataset.color, sel: pendingSel });
    } else if (btn.classList.contains('tb-quote')) {
      handler({ type: 'quote', sel: pendingSel });
    }
  });
}

/* ---------------- 导航 ---------------- */

export function jumpToPage(n) {
  const p = pageEls[n - 1];
  if (p && host) host.scrollTo({ top: p.offsetTop - 8, behavior: 'smooth' });
}

export function currentScale() {
  return scale;
}

export async function zoom(delta) {
  const anchorPage = (() => {
    if (!host || !pageEls.length) return 1;
    const top = host.scrollTop + 40;
    let cur = 1;
    for (const p of pageEls) { if (p.offsetTop <= top) cur = Number(p.dataset.page); else break; }
    return cur;
  })();

  scale = Math.max(0.5, Math.min(3, Number((scale + delta).toFixed(2))));
  localStorage.setItem('pd.pdfScale', String(scale));
  rendered.clear();
  await buildPages();
  jumpToPage(anchorPage);
  setZoomLabel();
}

function setPageInfo(cur, total) {
  const box = document.getElementById('pageInfo');
  if (box) box.textContent = total ? `${cur} / ${total}` : '';
}

function setZoomLabel() {
  const box = document.getElementById('zoomLevel');
  if (box) box.textContent = `${Math.round(scale * 100)}%`;
}

export function syncZoomLabel() {
  setZoomLabel();
}
