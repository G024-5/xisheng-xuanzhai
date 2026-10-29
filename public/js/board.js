/**
 * 文献拼图：自由画布
 *
 * 一张拼图 = 若干「文献卡」自由摆放 + 支链分组 + 卡片之间的连线。
 * 卡片内容（问题 / 方案 / 局限）完全由人填写，AI 不参与。
 */
import { $, esc, toast, confirmDialog, promptDialog } from './ui.js';

const COLORS = {
  emerald: '#0f7a5a',
  blue: '#2563eb',
  amber: '#b45309',
  rose: '#be123c',
  violet: '#6d28d9',
  slate: '#475569',
};

const COLOR_NAMES = {
  emerald: '祖母绿', blue: '蓝', amber: '琥珀', rose: '玫红', violet: '紫', slate: '灰',
};

const state = {
  maps: [],
  mapId: null,
  map: null,
  branches: [],
  cards: [],
  edges: [],
  papers: [],
  view: { x: 60, y: 60, k: 1 },
  selected: null,
  linking: null,
};

let patchTimer = null;
let patchQueue = {};

const req = async (path, method = 'GET', body) => {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
};

const cardEl = (id) => document.querySelector(`.bcard[data-id="${CSS.escape(id)}"]`);
const branchOf = (card) => state.branches.find((b) => b.id === card.branch_id);
const colorOf = (card) => COLORS[card.color] || COLORS[branchOf(card)?.color] || COLORS.emerald;

/* ---------------- 载入 ---------------- */

export async function open() {
  $('#boardOverlay').hidden = false;
  await refreshMaps();

  if (!state.maps.length) {
    await createMap();
  } else {
    const keep = state.mapId && state.maps.some((m) => m.id === state.mapId);
    await loadMap(keep ? state.mapId : state.maps[0].id);
  }
  fit();
}

export function close() {
  flushPatches();
  state.selected = null;
  state.linking = null;
  $('#boardOverlay').hidden = true;
}

async function refreshMaps() {
  const { items } = await req('/api/boards');
  state.maps = items;
  $('#boardMapSelect').innerHTML = items
    .map((m) => `<option value="${m.id}">${esc(m.title)}（${m.cards}）</option>`)
    .join('');
  if (state.mapId) $('#boardMapSelect').value = String(state.mapId);
}

async function createMap() {
  const title = await promptDialog('新建拼图', {
    placeholder: '例如：长文本生成综述',
    value: `拼图 ${state.maps.length + 1}`,
    okText: '创建',
  });
  if (title === null) return;
  const { id } = await req('/api/boards', 'POST', { title });
  state.mapId = id;
  await refreshMaps();
  await loadMap(id);
}

async function loadMap(id) {
  state.mapId = id;
  const data = await req(`/api/boards/${id}`);
  state.map = data.map;
  state.branches = data.branches;
  state.cards = data.cards;
  state.edges = data.edges;
  state.selected = null;
  state.linking = null;

  if (!state.papers.length) {
    try {
      const { items } = await req('/api/papers');
      state.papers = items;
    } catch { /* 没有文献也能用 */ }
  }

  $('#boardMapSelect').value = String(id);
  render();
}

/* ---------------- 渲染 ---------------- */

function render() {
  const world = $('#boardWorld');
  world.querySelectorAll('.bcard').forEach((el) => el.remove());

  for (const c of state.cards) {
    const el = document.createElement('div');
    el.className = 'bcard';
    el.dataset.id = c.id;
    if (state.selected === c.id) el.classList.add('sel');
    if (state.linking === c.id) el.classList.add('linking');
    el.style.left = `${c.x}px`;
    el.style.top = `${c.y}px`;
    el.style.setProperty('--c', colorOf(c));

    el.innerHTML = `
      <div class="bcard-head">
        <span class="bcard-branch">${esc(branchOf(c)?.name || '未分组')}</span>
        <button class="bcard-x" data-del title="删除卡片">×</button>
      </div>
      <div class="bcard-title ${c.paper_title ? '' : 'empty'}">${esc(c.paper_title || '未选择文献')}</div>
      ${section('问题', c.problem)}
      ${section('方案', c.solution)}
      ${section('局限', c.limitation)}
      <button class="bcard-port" data-port title="从这里连一条线到另一张卡"></button>
    `;
    world.appendChild(el);
  }

  $('#boardEmpty').hidden = state.cards.length > 0;
  applyTransform();
  requestAnimationFrame(drawEdges);
  renderSide();
}

const section = (label, text) => `<div class="bcard-sec"><i>${label}</i>${
  text ? `<p>${esc(text)}</p>` : '<p class="empty">—</p>'
}</div>`;

function applyTransform() {
  const { x, y, k } = state.view;
  $('#boardWorld').style.transform = `translate(${x}px, ${y}px) scale(${k})`;
}

function drawEdges() {
  const parts = [];

  for (const e of state.edges) {
    const a = cardEl(e.from_id);
    const b = cardEl(e.to_id);
    if (!a || !b) continue;

    const x1 = a.offsetLeft + a.offsetWidth;
    const y1 = a.offsetTop + a.offsetHeight / 2;
    const x2 = b.offsetLeft;
    const y2 = b.offsetTop + b.offsetHeight / 2;
    const dx = Math.max(50, Math.abs(x2 - x1) * 0.45);

    parts.push(
      `<path class="bedge" data-id="${e.id}" marker-end="url(#arrow)" d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}"/>`,
    );
  }

  $('#boardEdges').innerHTML = `
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="#9aa5a1"/>
      </marker>
    </defs>
    ${parts.join('')}`;
}

/* ---------------- 侧栏编辑 ---------------- */

function renderSide() {
  const box = $('#boardSideBody');
  const card = state.cards.find((c) => c.id === state.selected);
  const titleEl = $('#bsTitle');

  if (!card) {
    if (titleEl) titleEl.textContent = '编辑';
    box.innerHTML = `
      <p class="bs-hint">选中一张卡片开始编辑。<br>拖动卡片摆位置；点卡片右下角小圆点，再点另一张卡即可连线。</p>
      <div class="bs-group">
        <div class="bs-sub">支链</div>
        ${state.branches.map((b) => `
          <div class="bs-branch" data-branch="${b.id}">
            <span class="dot" style="background:${COLORS[b.color] || COLORS.emerald}"></span>
            <span>${esc(b.name)}</span>
            <button class="bs-branch-del" data-delbranch="${b.id}" title="删除支链">×</button>
          </div>`).join('')}
        <button data-act="add-branch" class="btn ghost" style="width:100%;margin-top:8px">＋ 新建支链</button>
      </div>`;
    bindBranchList();
    return;
  }

  if (titleEl) {
    titleEl.innerHTML = `<span class="bs-title-name">${esc(card.paper_title || '未选择文献')}</span>`;
  }

  const branchOptions = state.branches
    .map((b) => `<option value="${b.id}" ${card.branch_id === b.id ? 'selected' : ''}>${esc(b.name)}</option>`)
    .join('');

  const paperOptions = state.papers
    .map((p) => `<option value="${p.id}" ${card.paper_id === p.id ? 'selected' : ''}>${esc(String(p.title).slice(0, 60))}</option>`)
    .join('');

  box.innerHTML = `
    <div class="bs-group">
      <label class="bs-label">关联文献</label>
      <select data-f="paper" class="bs-input">
        <option value="">（不关联）</option>
        ${paperOptions}
      </select>

      <label class="bs-label">支链</label>
      <select data-f="branch" class="bs-input">
        <option value="">（不分组）</option>
        ${branchOptions}
      </select>

      <label class="bs-label">颜色</label>
      <div class="bs-colors">
        ${Object.entries(COLORS).map(([k, v]) => `
          <button class="sw ${card.color === k ? 'on' : ''}" data-color="${k}" style="background:${v}" title="${COLOR_NAMES[k]}"></button>`).join('')}
        <button class="sw ${card.color ? '' : 'on'}" data-color="" style="background:#fff" title="跟随支链">A</button>
      </div>
    </div>

    <div class="bs-group">
      <label class="bs-label">解决问题</label>
      <textarea data-f="problem" class="bs-input" rows="3" placeholder="这篇在解决什么问题">${esc(card.problem || '')}</textarea>

      <label class="bs-label">解决方案</label>
      <textarea data-f="solution" class="bs-input" rows="3" placeholder="用了什么方法">${esc(card.solution || '')}</textarea>

      <label class="bs-label">留下局限</label>
      <textarea data-f="limitation" class="bs-input" rows="3" placeholder="还有什么没解决">${esc(card.limitation || '')}</textarea>
    </div>

    <button data-act="del-card" class="btn ghost danger" style="width:100%">删除这张卡</button>
  `;
  bindCardEditor(card);
}

function bindBranchList() {
  const add = $('[data-act="add-branch"]');
  if (add) {
    add.onclick = async () => {
      const name = await promptDialog('新建支链', { placeholder: '例如：检索增强路线', okText: '创建' });
      if (!name) return;
      await req(`/api/boards/${state.mapId}/branches`, 'POST', { name });
      await loadMap(state.mapId);
    };
  }

  document.querySelectorAll('[data-delbranch]').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const yes = await confirmDialog('删除这个支链？卡片会变成「未分组」，不会丢失。', {
        title: '删除支链', okText: '删除', danger: true,
      });
      if (!yes) return;
      await req(`/api/branches/${btn.dataset.delbranch}`, 'DELETE');
      await loadMap(state.mapId);
    };
  });
}

function bindCardEditor(card) {
  const apply = (fields, local) => {
    Object.assign(card, local);
    queuePatch(card.id, fields);

    const el = cardEl(card.id);
    if (!el) return;

    if ('color' in local || 'branch_id' in local) {
      el.style.setProperty('--c', colorOf(card));
      const chip = el.querySelector('.bcard-branch');
      if (chip) chip.textContent = branchOf(card)?.name || '未分组';
    }
    if ('paper_id' in local) {
      const p = state.papers.find((x) => x.id === local.paper_id);
      const title = el.querySelector('.bcard-title');
      if (title) {
        title.textContent = p?.title || '未选择文献';
        title.classList.toggle('empty', !p);
      }
      const head = document.querySelector('#bsTitle .bs-title-name');
      if (head) head.textContent = p?.title || '未选择文献';
    }
  };

  $('[data-f="paper"]').onchange = (e) => {
    const id = Number(e.target.value) || null;
    apply({ paperId: id }, { paper_id: id });
  };

  $('[data-f="branch"]').onchange = (e) => {
    const id = Number(e.target.value) || null;
    apply({ branchId: id }, { branch_id: id });
  };

  document.querySelectorAll('.bs-colors .sw').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.bs-colors .sw').forEach((b) => b.classList.toggle('on', b === btn));
      const color = btn.dataset.color || null;
      apply({ color }, { color });
    };
  });

  for (const key of ['problem', 'solution', 'limitation']) {
    const input = $(`[data-f="${key}"]`);
    input.oninput = () => {
      card[key] = input.value;
      queuePatch(card.id, { [key]: input.value });

      const node = cardEl(card.id);
      if (!node) return;
      const idx = key === 'problem' ? 0 : key === 'solution' ? 1 : 2;
      const p = node.querySelectorAll('.bcard-sec')[idx]?.querySelector('p');
      if (p) {
        p.textContent = input.value || '—';
        p.classList.toggle('empty', !input.value);
      }
    };
  }

  $('[data-act="del-card"]').onclick = async () => {
    const yes = await confirmDialog('删除这张卡？上面的文字会一起消失。', {
      title: '删除卡片', okText: '删除', danger: true,
    });
    if (!yes) return;
    try {
      await req(`/api/cards/${card.id}`, 'DELETE');
      state.selected = null;
      await loadMap(state.mapId);
      await refreshMaps();
    } catch (err) {
      toast(`删除失败：${err.message}`);
    }
  };
}

function queuePatch(id, fields) {
  patchQueue[id] = { ...(patchQueue[id] || {}), ...fields };
  clearTimeout(patchTimer);
  patchTimer = setTimeout(flushPatches, 500);
}

function flushPatches() {
  const entries = Object.entries(patchQueue);
  patchQueue = {};
  for (const [id, fields] of entries) {
    req(`/api/cards/${id}`, 'PATCH', fields).catch((e) => toast(e.message));
  }
}

/* ---------------- 画布交互 ---------------- */

export function bindCanvas() {
  const canvas = $('#boardCanvas');

  canvas.addEventListener('pointerdown', (e) => {
    const cardNode = e.target.closest('.bcard');

    if (cardNode) {
      if (e.target.closest('button')) return;
      const card = state.cards.find((c) => c.id === cardNode.dataset.id);
      if (!card) return;

      if (state.linking && state.linking !== card.id) {
        const from = state.linking;
        state.linking = null;
        createEdge(from, card.id);
        return;
      }

      state.selected = card.id;
      document.querySelectorAll('.bcard').forEach((n) => n.classList.toggle('sel', n === cardNode));
      renderSide();

      const start = { x: e.clientX, y: e.clientY, cx: card.x, cy: card.y, moved: false };
      const move = (ev) => {
        const dx = (ev.clientX - start.x) / state.view.k;
        const dy = (ev.clientY - start.y) / state.view.k;
        if (!start.moved && Math.abs(dx) + Math.abs(dy) > 2) {
          start.moved = true;
          cardNode.classList.add('dragging');
        }
        card.x = Math.round(start.cx + dx);
        card.y = Math.round(start.cy + dy);
        cardNode.style.left = `${card.x}px`;
        cardNode.style.top = `${card.y}px`;
        drawEdges();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        cardNode.classList.remove('dragging');
        if (start.moved) queuePatch(card.id, { x: card.x, y: card.y });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }

    if (e.target.closest('.board-side') || e.target.closest('.board-head')) return;

    state.selected = null;
    document.querySelectorAll('.bcard').forEach((n) => n.classList.remove('sel'));
    renderSide();

    const start = { x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y };
    const move = (ev) => {
      state.view.x = start.vx + (ev.clientX - start.x);
      state.view.y = start.vy + (ev.clientY - start.y);
      applyTransform();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const k2 = Math.min(2.4, Math.max(0.3, state.view.k * (e.deltaY < 0 ? 1.12 : 0.89)));
    state.view.x = mx - (mx - state.view.x) * (k2 / state.view.k);
    state.view.y = my - (my - state.view.y) * (k2 / state.view.k);
    state.view.k = k2;
    applyTransform();
  }, { passive: false });

  canvas.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      const id = del.closest('.bcard').dataset.id;
      const yes = await confirmDialog('删除这张卡？上面的文字会一起消失。', {
        title: '删除卡片', okText: '删除', danger: true,
      });
      if (!yes) return;
      try {
        await req(`/api/cards/${id}`, 'DELETE');
        state.selected = null;
        await loadMap(state.mapId);
        await refreshMaps();
      } catch (err) {
        toast(`删除失败：${err.message}`);
      }
      return;
    }

    const port = e.target.closest('[data-port]');
    if (port) {
      state.linking = port.closest('.bcard').dataset.id;
      document.querySelectorAll('.bcard').forEach((n) => n.classList.toggle('linking', n.dataset.id === state.linking));
      toast('再点另一张卡完成连线（Esc 取消）', 2600);
    }
  });

  $('#boardEdges').addEventListener('click', async (e) => {
    const path = e.target.closest('.bedge');
    if (!path) return;
    const yes = await confirmDialog('删除这条连线？', { title: '删除连线', okText: '删除', danger: true });
    if (!yes) return;
    try {
      await req(`/api/edges/${path.dataset.id}`, 'DELETE');
      state.edges = state.edges.filter((x) => x.id !== path.dataset.id);
      drawEdges();
    } catch (err) {
      toast(`删除失败：${err.message}`);
    }
  });
}

async function createEdge(from, to) {
  try {
    await req(`/api/boards/${state.mapId}/edges`, 'POST', { from, to });
    const data = await req(`/api/boards/${state.mapId}`);
    state.edges = data.edges;
    drawEdges();
    document.querySelectorAll('.bcard').forEach((n) => n.classList.remove('linking'));
  } catch (err) {
    toast(err.message);
  }
}

/* ---------------- 工具条 ---------------- */

export function bindToolbar() {
  $('#boardAddCard').onclick = async () => {
    const { id } = await req(`/api/boards/${state.mapId}/cards`, 'POST', {
      x: Math.round(-state.view.x + 160 + Math.random() * 60),
      y: Math.round(-state.view.y + 120 + Math.random() * 60),
      branchId: state.branches[0]?.id || null,
    });
    await loadMap(state.mapId);
    state.selected = id;
    render();
    await refreshMaps();
  };

  $('#boardNew').onclick = async () => {
    await createMap();
    fit();
  };

  $('#boardMapSelect').onchange = async (e) => {
    await loadMap(Number(e.target.value));
    fit();
  };

  $('#boardFit').onclick = () => fit();

  document.addEventListener('keydown', (e) => {
    if ($('#boardOverlay').hidden) return;
    if (e.key === 'Escape' && state.linking) {
      state.linking = null;
      document.querySelectorAll('.bcard').forEach((n) => n.classList.remove('linking'));
    }
  });
}

export function fit() {
  const box = $('#boardCanvas');
  if (!state.cards.length) {
    state.view = { x: 60, y: 60, k: 1 };
    applyTransform();
    return;
  }

  const minX = Math.min(...state.cards.map((c) => c.x));
  const minY = Math.min(...state.cards.map((c) => c.y));
  const maxX = Math.max(...state.cards.map((c) => c.x + 240));
  const maxY = Math.max(...state.cards.map((c) => c.y + 220));

  const pad = 40;
  const w = box.clientWidth - pad * 2;
  const h = box.clientHeight - pad * 2;
  const k = Math.min(1.4, Math.max(0.4, Math.min(w / (maxX - minX || 1), h / (maxY - minY || 1))));

  state.view = { x: pad - minX * k, y: pad - minY * k, k };
  applyTransform();
}
