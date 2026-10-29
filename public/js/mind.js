/**
 * 知识树导图（mind-elixir 5.15.1，MIT）
 *
 * 职责只有三件：
 *   1. 把 tree_nodes / tree_entries 转成 mind-elixir 的节点树
 *   2. 编辑完把整棵树同步回 /api/tree/sync
 *   3. 提供几套起步模板
 * 拖拽、双击改名、撤销这些交互都交给库本身。
 */
import MindElixir from '/vendor/mind-elixir/MindElixir.js';
import { zh_CN } from '/vendor/mind-elixir/i18n.js';

const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

let mind = null;
let saveTimer = null;
let hooks = {};

const PAPER_STYLE = { fontSize: '11', background: '#eef7f3', color: '#0b6b4e' };
const TOPIC_STYLE = { fontSize: '13' };
const ROOT_STYLE = { fontSize: '15', background: '#0f7a5a', color: '#ffffff' };

/* ---------------- 数据转换 ---------------- */

function buildData(tree) {
  const items = new Map();
  for (const n of tree.nodes) {
    items.set(n.id, {
      id: n.mind_id || `n${n.id}`,
      topic: n.title,
      children: [],
      style: { ...TOPIC_STYLE },
    });
  }

  const root = { id: 'root', topic: '知识树', children: [], style: { ...ROOT_STYLE } };

  for (const n of tree.nodes) {
    const item = items.get(n.id);
    const parent = n.parent_id ? items.get(n.parent_id) : root;
    (parent || root).children.push(item);
  }

  for (const e of tree.entries) {
    const item = items.get(e.node_id);
    if (!item) continue;
    item.children.push({
      id: `p${e.target_id}_${e.id}`,
      topic: String(e.paper_title || `文献 ${e.target_id}`).slice(0, 34),
      style: { ...PAPER_STYLE },
    });
  }

  return { nodeData: root };
}

function collect() {
  const nodes = [];
  const papers = [];

  const walk = (node, parentMindId) => {
    for (const child of node.children || []) {
      const id = String(child.id);
      if (id.startsWith('p')) {
        const paperId = Number(id.slice(1).split('_')[0]);
        if (paperId) papers.push({ paperId, nodeMindId: parentMindId });
        continue;
      }
      nodes.push({ mindId: id, title: child.topic || '未命名', parentMindId });
      walk(child, id);
    }
  };

  walk(mind.getData().nodeData, null);
  return { nodes, papers };
}

/* ---------------- 保存 ---------------- */

async function save() {
  if (!mind) return;
  try {
    const res = await fetch('/api/tree/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collect()),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      hooks.onError?.(d.error || '导图保存失败');
      return;
    }
    hooks.onChange?.();
  } catch (err) {
    hooks.onError?.(err.message);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 600);
}

/* ---------------- 生命周期 ---------------- */

export async function open(hostEl, opts = {}) {
  hooks = opts;
  close();

  mind = new MindElixir({
    el: hostEl,
    direction: MindElixir.SIDE,
    editable: true,
    toolBar: false,
    keypress: true,
    allowUndo: true,
    contextMenu: { locale: zh_CN, focus: true, link: false },
  });

  mind.bus.addListener('operation', () => scheduleSave());

  const tree = await (await fetch('/api/tree')).json();
  mind.init(buildData(tree));
  setTimeout(() => { try { mind.toCenter(); } catch { /* noop */ } }, 80);
}

export function close() {
  clearTimeout(saveTimer);
  if (mind) {
    // 关闭前把没落盘的改动补上
    if (saveTimer) save();
    try { mind.destroy(); } catch { /* noop */ }
    mind = null;
  }
}

export function fit() {
  if (mind) mind.toCenter();
}

/* ---------------- 模板 ---------------- */

const n = (topic, children = []) => ({ topic, children });

export const TEMPLATES = [
  {
    id: 'survey',
    name: '文献综述',
    desc: '按主题拆解一个领域，最后落到研究空白',
    root: '综述',
    tree: [
      n('研究背景', [n('问题从哪来'), n('为什么重要')]),
      n('相关工作', [n('主要流派'), n('代表工作')]),
      n('方法分类', [n('类别 A'), n('类别 B')]),
      n('数据与评测', [n('数据集'), n('指标')]),
      n('研究空白', [n('尚未解决的问题')]),
    ],
  },
  {
    id: 'project',
    name: '课题推进',
    desc: '把一个问题拆成可执行的研究计划',
    root: '课题',
    tree: [
      n('问题定义', [n('要解决什么'), n('边界在哪')]),
      n('技术路线', [n('候选方案'), n('选型理由')]),
      n('实验设计', [n('数据'), n('baseline'), n('评测方式')]),
      n('时间节点', [n('阶段一'), n('阶段二')]),
      n('风险与备选', []),
    ],
  },
  {
    id: 'paper',
    name: '单篇精读',
    desc: '读一篇论文时的拆解骨架',
    root: '精读',
    tree: [
      n('背景', []),
      n('方法', [n('关键设计'), n('与已有工作的差别')]),
      n('实验', [n('设置'), n('主要结果')]),
      n('结论', []),
      n('局限', []),
      n('可借鉴', []),
    ],
  },
];

function templateToMind(tpl) {
  const convert = (item) => ({
    id: uid('t'),
    topic: item.topic,
    style: { ...TOPIC_STYLE },
    children: (item.children || []).map(convert),
  });

  return {
    nodeData: {
      id: 'root',
      topic: tpl.root,
      style: { ...ROOT_STYLE },
      children: tpl.tree.map(convert),
    },
  };
}

/** 用模板替换当前导图（会丢掉现有节点，调用方需先确认） */
export function applyTemplate(id) {
  const tpl = TEMPLATES.find((t) => t.id === id);
  if (!tpl || !mind) return false;
  mind.refresh(templateToMind(tpl));
  setTimeout(() => { try { mind.toCenter(); } catch { /* noop */ } }, 60);
  scheduleSave();
  return true;
}
