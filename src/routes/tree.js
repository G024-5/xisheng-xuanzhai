'use strict';
const { db } = require('../db');
const { sendJson, readBody } = require('../util/http');

async function listTree(_req, res) {
  const nodes = db.prepare('SELECT id, parent_id, title, sort_order FROM tree_nodes ORDER BY sort_order, id').all();
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

module.exports = function register(add) {
  add('GET', '/api/tree', listTree);
  add('POST', '/api/tree/nodes', createNode);
  add('PATCH', '/api/tree/nodes/:id', renameNode);
  add('DELETE', '/api/tree/nodes/:id', deleteNode);
  add('POST', '/api/tree/entries', attach);
  add('DELETE', '/api/tree/entries', detach);
};
