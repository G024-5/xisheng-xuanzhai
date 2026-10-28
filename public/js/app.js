import { api } from './api.js';
import { $, esc, toast, mark, shortAuthors, debounce } from './ui.js';

const state = {
  q: '',
  sort: localStorage.getItem('pd.sort') || 'added_desc',
  stateFilter: '',
  filter: { type: 'all', id: null },
  papers: [],
  selectedId: null,
  collections: [],
  tree: { nodes: [], entries: [] },
  settings: { ai: { hasKey: false, model: 'deepseek-flash' } },
};

/* ==================== 侧栏 ==================== */

function renderStats(stats) {
  $('#stats').textContent =
    `${stats.papers} 篇 · ${stats.pdfs} 个 PDF · ${stats.notes} 条笔记 · ${stats.treeNodes} 个节点`;
}

function renderCollections() {
  const box = $('#collections');
  const byParent = new Map();
  for (const c of state.collections) {
    const k = c.parent_id ?? 0;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(c);
  }

  const rows = [`<div class="nav-item ${state.filter.type === 'all' ? 'active' : ''}" data-type="all">
      <span class="name">全部文献</span></div>`];

  const walk = (parent, depth) => {
    for (const c of byParent.get(parent) || []) {
      const active = state.filter.type === 'collection' && state.filter.id === c.id;
      rows.push(`<div class="nav-item depth-${Math.min(depth, 3)} ${active ? 'active' : ''}"
        data-type="collection" data-id="${c.id}" title="${esc(c.name)}">
        <span class="name">${esc(c.name)}</span><span class="count">${c.count || ''}</span></div>`);
      walk(c.id, depth + 1);
    }
  };
  walk(0, 1);

  box.innerHTML = rows.join('');
}

function treeChildren(parentId) {
  return state.tree.nodes
    .filter((n) => (n.parent_id ?? null) === (parentId ?? null))
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}

const entryCount = (nodeId) => state.tree.entries.filter((e) => e.node_id === nodeId).length;

function renderTree() {
  const box = $('#tree');
  const roots = treeChildren(null);

  if (!roots.length) {
    box.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:10px 8px;line-height:1.6">
      还没有节点。<br>点右上角 ＋ 建一个，比如「毕业论文」。
    </div>`;
    return;
  }

  const renderLevel = (nodes) => nodes.map((n) => {
    const kids = treeChildren(n.id);
    const cnt = entryCount(n.id);
    const active = state.filter.type === 'node' && state.filter.id === n.id;
    return `<div class="tree-node">
      <div class="tree-row ${active ? 'active' : ''}" data-id="${n.id}">
        <span class="label" title="${esc(n.title)}">${esc(n.title)}${cnt ? ` <span class="muted">${cnt}</span>` : ''}</span>
        <span class="acts">
          <button data-act="add" title="添加子节点">＋</button>
          <button data-act="rename" title="重命名">✎</button>
          <button data-act="del" title="删除">✕</button>
        </span>
      </div>
      ${kids.length ? `<div class="tree-children">${renderLevel(kids)}</div>` : ''}
    </div>`;
  }).join('');

  box.innerHTML = renderLevel(roots);
}

async function refreshTree() {
  const t = await api.tree();
  state.tree = t;
  renderTree();
}

async function refreshAll() {
  const b = await api.bootstrap();
  state.collections = b.collections;
  state.settings = b.settings;
  renderStats(b.stats);
  renderCollections();
  await refreshTree();
}

/* ==================== 列表 ==================== */

async function loadPapers() {
  const params = { q: state.q, sort: state.sort, state: state.stateFilter };
  if (state.filter.type === 'collection') params.collectionId = state.filter.id;
  if (state.filter.type === 'node') params.nodeId = state.filter.id;

  const r = await api.papers(params);
  state.papers = r.items;
  renderList();
}

function renderList() {
  const box = $('#list');
  $('#listCount').textContent = state.q ? `${state.papers.length} 条结果` : `${state.papers.length} 篇`;

  if (!state.papers.length) {
    const msg = state.q
      ? '没有匹配的文献。'
      : state.filter.type === 'all'
        ? '库里还没有文献。<br>在项目目录运行：<br><code>node scripts/import-zotero.js</code>'
        : '这个分类下还没有文献。';
    box.innerHTML = `<div style="padding:32px 18px;text-align:center;color:var(--muted);font-size:12.5px;line-height:1.9">${msg}</div>`;
    return;
  }

  box.innerHTML = state.papers.map((p) => `
    <div class="list-item state-${p.read_state} ${p.id === state.selectedId ? 'active' : ''}" data-id="${p.id}">
      <div class="title">${mark(p.title, state.q)}</div>
      <div class="sub">
        ${p.has_pdf ? '<span class="pdf-dot"></span>' : ''}
        <span>${esc(shortAuthors(p.authors))}</span>
        ${p.year ? `<span>· ${p.year}</span>` : ''}
      </div>
    </div>`).join('');
}

/* ==================== 详情 ==================== */

async function openPaper(id) {
  if (state.selectedId !== id) await flushNote();
  state.selectedId = id;

  document.querySelectorAll('.list-item').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.id) === id);
  });

  let p;
  try {
    p = await api.paper(id);
  } catch (err) {
    toast(err.message);
    return;
  }

  $('#empty').hidden = true;
  $('#paperView').hidden = false;
  $('#pTitle').textContent = p.title;

  const bits = [];
  if (p.authors?.length) bits.push(esc(shortAuthors(p.authors.join(', '))));
  if (p.year) bits.push(p.year);
  if (p.venue) bits.push(esc(p.venue));
  const tags = (p.tags || []).slice(0, 8).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
  $('#pMeta').innerHTML = bits.join(' · ') + (tags ? `<div style="margin-top:5px">${tags}</div>` : '');

  $('#stateSeg').querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.state === p.read_state);
  });

  const pdf = $('#pdf');
  if (p.has_pdf) {
    pdf.style.display = '';
    $('#pdfEmpty').hidden = true;
    pdf.src = `/api/papers/${id}/file#toolbar=1&view=FitH`;
  } else {
    pdf.style.display = 'none';
    $('#pdfEmpty').hidden = false;
    pdf.src = 'about:blank';
  }

  $('#note').value = p.note?.body || '';
  $('#noteStatus').textContent = p.note?.updated_at ? '已保存' : '';

  if (p.summary?.tldr) {
    $('#aiBox').hidden = false;
    $('#aiBox').innerHTML = `<span class="ai-tag">AI 摘要 · ${esc(p.summary.model || '')}</span>${esc(p.summary.tldr)}`;
  } else {
    $('#aiBox').hidden = true;
    $('#aiBox').innerHTML = '';
  }

  history.replaceState(null, '', `#p${id}`);
}

/* ==================== 笔记（防抖 + 切篇先落盘）==================== */

let noteTimer = null;
let pendingNote = null;

async function flushNote() {
  if (!pendingNote) return;
  const { paperId, body } = pendingNote;
  pendingNote = null;
  clearTimeout(noteTimer);
  try {
    await api.saveNote(paperId, body);
    if (state.selectedId === paperId) $('#noteStatus').textContent = '已保存';
  } catch (err) {
    if (state.selectedId === paperId) {
      $('#noteStatus').textContent = '保存失败';
      toast(err.message);
    }
  }
}

/* ==================== 知识树操作 ==================== */

async function addNode(parentId, title) {
  await api.addNode(title, parentId);
  await refreshTree();
  await api.bootstrap().then((b) => renderStats(b.stats));
}

function openAttachModal() {
  if (!state.selectedId) return;
  const nodes = [];
  const walk = (parent, depth) => {
    for (const n of treeChildren(parent)) { nodes.push({ ...n, depth }); walk(n.id, depth + 1); }
  };
  walk(null, 0);

  const body = $('#modalBody');
  if (!nodes.length) {
    body.innerHTML = '<div class="empty-hint">知识树还是空的，先在左边建一个节点。</div>';
  } else {
    const attached = new Set(
      state.tree.entries
        .filter((e) => e.target_type === 'paper' && Number(e.target_id) === state.selectedId)
        .map((e) => e.node_id)
    );
    body.innerHTML = nodes.map((n) => `
      <div class="opt" data-id="${n.id}" style="padding-left:${10 + n.depth * 14}px">
        ${esc(n.title)} ${attached.has(n.id) ? '<span class="hint">· 已挂载</span>' : ''}
      </div>`).join('');
  }
  $('#modal').hidden = false;
}

/* ==================== 设置 ==================== */

async function openSettings() {
  const s = await api.settings();
  state.settings = s;

  $('#setKey').value = '';
  $('#setKey').placeholder = s.ai.hasKey ? `${s.ai.keyMasked}（留空不修改）` : 'sk-...';
  $('#setKeyHint').textContent = s.ai.hasKey
    ? '已配置。留空表示保持不变，输入新值则覆盖。'
    : '尚未配置，AI 摘要不可用。可在 platform.deepseek.com 申请。';

  const sel = $('#setModel');
  if (![...sel.options].some((o) => o.value === s.ai.model)) {
    sel.add(new Option(s.ai.model, s.ai.model));
  }
  sel.value = s.ai.model;
  $('#setBase').value = s.ai.baseUrl;

  $('#testResult').hidden = true;
  $('#settingsModal').hidden = false;
  $('#setKey').focus();
}

/* ==================== 专注 / 分栏 ==================== */

function setFocus(on) {
  document.body.classList.toggle('focus', on);
  $('#exitFocus').hidden = !on;
}

function initSplitter() {
  const saved = Number(localStorage.getItem('pd.noteW'));
  if (saved >= 240) document.body.style.setProperty('--note-w', `${saved}px`);

  const sp = $('#splitter');
  let dragging = false;

  sp.addEventListener('mousedown', (e) => {
    dragging = true;
    sp.classList.add('dragging');
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = $('#reader').getBoundingClientRect();
    const w = Math.max(240, Math.min(Math.min(900, rect.width - 320), rect.right - e.clientX));
    document.body.style.setProperty('--note-w', `${w}px`);
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    sp.classList.remove('dragging');
    document.body.style.userSelect = '';
    const w = parseInt(getComputedStyle(document.body).getPropertyValue('--note-w'), 10);
    if (w) localStorage.setItem('pd.noteW', String(w));
  });
}

/* ==================== 事件绑定 ==================== */

$('#collections').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  const type = item.dataset.type;
  state.filter = type === 'all' ? { type: 'all', id: null } : { type: 'collection', id: Number(item.dataset.id) };
  $('#listTitle').textContent = item.querySelector('.name').textContent;
  renderCollections();
  renderTree();
  loadPapers();
});

$('#tree').addEventListener('click', async (e) => {
  const row = e.target.closest('.tree-row');
  if (!row) return;
  const id = Number(row.dataset.id);
  const act = e.target.closest('button')?.dataset.act;

  if (act === 'add') {
    const title = prompt('子节点名称');
    if (title) await addNode(id, title);
    return;
  }
  if (act === 'rename') {
    const cur = state.tree.nodes.find((n) => n.id === id)?.title || '';
    const title = prompt('新名称', cur);
    if (title && title !== cur) {
      await api.renameNode(id, title);
      await refreshTree();
    }
    return;
  }
  if (act === 'del') {
    if (!confirm('删除这个节点？挂在下面的文献不会被删除。')) return;
    await api.deleteNode(id);
    if (state.filter.type === 'node' && state.filter.id === id) {
      state.filter = { type: 'all', id: null };
      loadPapers();
    }
    await refreshTree();
    return;
  }

  state.filter = { type: 'node', id };
  $('#listTitle').textContent = state.tree.nodes.find((n) => n.id === id)?.title || '知识树';
  renderTree();
  renderCollections();
  loadPapers();
});

$('#addRoot').addEventListener('click', async () => {
  const title = prompt('根节点名称，例如「毕业论文」或「LLM 基础」');
  if (title) await addNode(null, title);
});

$('#list').addEventListener('click', (e) => {
  const item = e.target.closest('.list-item');
  if (item) openPaper(Number(item.dataset.id));
});

$('#q').addEventListener('input', debounce((e) => {
  state.q = e.target.value.trim();
  loadPapers();
}, 220));

$('#sort').addEventListener('change', (e) => {
  state.sort = e.target.value;
  localStorage.setItem('pd.sort', state.sort);
  loadPapers();
});

$('#chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  state.stateFilter = chip.dataset.state || '';
  $('#chips').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === chip));
  loadPapers();
});

$('#stateSeg').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || !state.selectedId) return;
  await api.setReadState(state.selectedId, b.dataset.state);
  $('#stateSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  const p = state.papers.find((x) => x.id === state.selectedId);
  if (p) p.read_state = b.dataset.state;
  renderList();
});

$('#note').addEventListener('input', () => {
  if (!state.selectedId) return;
  $('#noteStatus').textContent = '保存中…';
  pendingNote = { paperId: state.selectedId, body: $('#note').value };
  clearTimeout(noteTimer);
  noteTimer = setTimeout(flushNote, 700);
});

$('#btnAi').addEventListener('click', async () => {
  if (!state.selectedId) return;
  if (!state.settings.ai.hasKey) {
    toast('先在右上角 ⚙ 里配置 API Key');
    openSettings();
    return;
  }

  const btn = $('#btnAi');
  const box = $('#aiBox');
  btn.disabled = true;
  btn.textContent = '生成中…';
  box.hidden = false;
  box.innerHTML = '<span class="ai-tag">AI</span>正在阅读摘要…';

  try {
    const r = await api.summarize(state.selectedId);
    box.innerHTML = `<span class="ai-tag">AI 摘要 · ${esc(r.model)}</span>${esc(r.tldr)}`;
  } catch (err) {
    box.innerHTML = `<span class="ai-tag">AI</span>失败：${esc(err.message)}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'AI 摘要';
  }
});

$('#btnAttach').addEventListener('click', openAttachModal);

$('#modalBody').addEventListener('click', async (e) => {
  const opt = e.target.closest('.opt');
  if (!opt) return;
  await api.attach(Number(opt.dataset.id), state.selectedId);
  $('#modal').hidden = true;
  await refreshTree();
  toast('已挂到知识树');
});

$('#modalClose').addEventListener('click', () => { $('#modal').hidden = true; });
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('#modal').hidden = true; });

$('#btnNotes').addEventListener('click', () => {
  const hidden = document.body.classList.toggle('hide-notes');
  $('#btnNotes').classList.toggle('off', hidden);
});

$('#btnFocus').addEventListener('click', () => setFocus(true));
$('#exitFocus').addEventListener('click', () => setFocus(false));

$('#btnSettings').addEventListener('click', openSettings);
$('#settingsClose').addEventListener('click', () => { $('#settingsModal').hidden = true; });
$('#settingsModal').addEventListener('click', (e) => { if (e.target.id === 'settingsModal') $('#settingsModal').hidden = true; });

$('#btnSaveSettings').addEventListener('click', async () => {
  const patch = { model: $('#setModel').value, baseUrl: $('#setBase').value.trim() };
  const key = $('#setKey').value.trim();
  if (key) patch.apiKey = key;

  try {
    state.settings = await api.saveSettings(patch);
    $('#setKey').value = '';
    $('#setKey').placeholder = state.settings.ai.hasKey
      ? `${state.settings.ai.keyMasked}（留空不修改）`
      : 'sk-...';
    toast('设置已保存');
  } catch (err) {
    toast(err.message);
  }
});

$('#btnTest').addEventListener('click', async () => {
  const btn = $('#btnTest');
  const out = $('#testResult');
  btn.disabled = true;
  btn.textContent = '测试中…';
  out.hidden = false;
  out.className = 'test-result';
  out.textContent = '正在请求 DeepSeek…';
  try {
    const r = await api.testConnection();
    out.className = 'test-result ok';
    out.textContent = r.ok
      ? `连接正常 · 模型 ${r.model} · ${r.latencyMs} ms`
      : `失败：${r.error}`;
  } catch (err) {
    out.className = 'test-result err';
    out.textContent = `失败：${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '测试连接';
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('#q').focus();
    $('#q').select();
  }
  if (e.key === 'Escape') {
    if (!$('#settingsModal').hidden) { $('#settingsModal').hidden = true; return; }
    if (!$('#modal').hidden) { $('#modal').hidden = true; return; }
    if (document.body.classList.contains('focus')) setFocus(false);
  }
});

/* ==================== 启动 ==================== */

async function boot() {
  const b = await api.bootstrap();
  state.collections = b.collections;
  state.settings = b.settings;
  $('#sort').value = state.sort;

  renderStats(b.stats);
  renderCollections();
  await refreshTree();
  await loadPapers();
  initSplitter();

  const m = location.hash.match(/^#p(\d+)$/);
  if (m) openPaper(Number(m[1]));
}

boot().catch((err) => {
  document.body.innerHTML = `<pre style="padding:24px;font:13px monospace;color:#b00">启动失败：${esc(err.message)}</pre>`;
});
