'use strict';
const { db } = require('../db');
const { sendJson, readBody } = require('../util/http');

async function listTree(_req, res) {
  const nodes = db.prepare('SELECT id, mind_id, parent_id, title, sort_order FROM tree_nodes ORDER BY sort_order, id').all();
  const entries = db.prepare(`
    SELECT te.id, te.node_id, te.target_type, te.target_id, p.title AS paper_title
    FROM tree_entries te
    LEFT JOIN papers p ON te.target_type = 'paper' AND p.id = CAST(te.target_id AS INTEGER)
    ORDER BY te.sort_order, te.id
  `).all();
  return sendJson(res, 200, { nodes, entries });
}

async function createNode(req, res) {
  const body = await readBody(req);
  const title = String(body.title || '').trim().slice(0, 80);
  if (!title) return sendJson(res, 400, { error: '节点名称不能为空' });
  const parentId = body.parentId ? Number(body.parentId) : null;
  if (parentId && !db.prepare('SELECT 1 FROM tree_nodes WHERE id = ?').get(parentId)) {
    return sendJson(res, 400, { error: '父节点不存在' });
  }
  const r = db.prepare('INSERT INTO tree_nodes (parent_id, title) VALUES (?, ?)').run(parentId, title);
  return sendJson(res, 200, { id: Number(r.lastInsertRowid) });
}

async function renameNode(req, res, params) {
  const body = await readBody(req);
  const title = String(body.title || '').trim().slice(0, 80);
  if (!title) return sendJson(res, 400, { error: '节点名称不能为空' });
  db.prepare('UPDATE tree_nodes SET title = ? WHERE id = ?').run(title, Number(params.id));
  return sendJson(res, 200, { ok: true });
}

async function deleteNode(_req, res, params) {
  db.prepare('DELETE FROM tree_nodes WHERE id = ?').run(Number(params.id));
  return sendJson(res, 200, { ok: true });
}

async function attach(req, res) {
  const body = await readBody(req);
  const nodeId = Number(body.nodeId);
  const paperId = Number(body.paperId);
  if (!nodeId || !paperId) return sendJson(res, 400, { error: '参数缺失' });
  db.prepare("INSERT OR IGNORE INTO tree_entries (node_id, target_type, target_id) VALUES (?, 'paper', ?)")
    .run(nodeId, String(paperId));
  return sendJson(res, 200, { ok: true });
}

async function detach(_req, res, _params, url) {
  const nodeId = Number(url.searchParams.get('nodeId'));
  const paperId = Number(url.searchParams.get('paperId'));
  db.prepare("DELETE FROM tree_entries WHERE node_id = ? AND target_type = 'paper' AND target_id = ?")
    .run(nodeId, String(paperId));
  return sendJson(res, 200, { ok: true });
}

/**
 * 导图整棵树同步。
 * 客户端以 mind_id 为稳定身份，服务端按 mind_id upsert；不在列表里的节点删除。
 * 先把 parent_id 全部置空再删，避免外键级联误删要保留的子树。
 */
async function syncTree(req, res) {
  const body = await readBody(req);
  const nodes = Array.isArray(body.nodes) ? body.nodes.slice(0, 2000) : [];
  const papers = Array.isArray(body.papers) ? body.papers.slice(0, 5000) : [];

  const clean = nodes
    .map((n) => ({
      mindId: String(n.mindId || '').slice(0, 64),
      title: String(n.title || '').trim().slice(0, 80),
      parentMindId: n.parentMindId ? String(n.parentMindId).slice(0, 64) : null,
    }))
    .filter((n) => n.mindId && n.title);

  db.exec('BEGIN');
  try {
    db.exec('UPDATE tree_nodes SET parent_id = NULL');

    const existing = new Map(
      db.prepare('SELECT id, mind_id FROM tree_nodes').all().map((r) => [r.mind_id || `n${r.id}`, r.id]),
    );
    const keep = new Set();

    for (const n of clean) {
      if (existing.has(n.mindId)) {
        db.prepare('UPDATE tree_nodes SET title = ? WHERE id = ?').run(n.title, existing.get(n.mindId));
      } else {
        const r = db.prepare('INSERT INTO tree_nodes (mind_id, title) VALUES (?, ?)').run(n.mindId, n.title);
        existing.set(n.mindId, Number(r.lastInsertRowid));
      }
      keep.add(n.mindId);
    }

    for (const [mindId, id] of existing) {
      if (!keep.has(mindId)) db.prepare('DELETE FROM tree_nodes WHERE id = ?').run(id);
    }

    for (const n of clean) {
      if (!n.parentMindId) continue;
      const id = existing.get(n.mindId);
      const parentId = existing.get(n.parentMindId);
      if (id && parentId && id !== parentId) {
        db.prepare('UPDATE tree_nodes SET parent_id = ? WHERE id = ?').run(parentId, id);
      }
    }

    // 文献挂载整表重建：导图是这一层的编辑入口
    db.exec("DELETE FROM tree_entries WHERE target_type = 'paper'");
    const seen = new Set();
    for (const p of papers) {
      const nodeId = existing.get(String(p.nodeMindId || ''));
      const paperId = Number(p.paperId);
      if (!nodeId || !paperId) continue;
      const key = `${nodeId}:${paperId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      db.prepare("INSERT INTO tree_entries (node_id, target_type, target_id) VALUES (?, 'paper', ?)")
        .run(nodeId, String(paperId));
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return sendJson(res, 200, { ok: true, nodes: clean.length });
}

module.exports = function register(add) {
  add('GET', '/api/tree', listTree);
  add('POST', '/api/tree/nodes', createNode);
  add('POST', '/api/tree/sync', syncTree);
  add('PATCH', '/api/tree/nodes/:id', renameNode);
  add('DELETE', '/api/tree/nodes/:id', deleteNode);
  add('POST', '/api/tree/entries', attach);
  add('DELETE', '/api/tree/entries', detach);
};
