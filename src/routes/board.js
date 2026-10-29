'use strict';
const crypto = require('node:crypto');
const { db } = require('../db');
const { sendJson, readBody } = require('../util/http');

const COLORS = new Set(['emerald', 'blue', 'amber', 'rose', 'violet', 'slate']);
const clampColor = (c) => (COLORS.has(c) ? c : null);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const txt = (v, n) => (v === null || v === undefined ? null : String(v).slice(0, n));

/* ---------------- 画布 ---------------- */

async function listMaps(_req, res) {
  const rows = db.prepare(`
    SELECT m.id, m.title, m.updated_at,
           (SELECT COUNT(*) FROM map_cards c WHERE c.map_id = m.id) AS cards
    FROM maps m ORDER BY m.updated_at DESC
  `).all();
  return sendJson(res, 200, { items: rows });
}

async function createMap(req, res) {
  const body = await readBody(req);
  const title = String(body.title || '').trim().slice(0, 60) || '未命名拼图';
  const r = db.prepare('INSERT INTO maps (title) VALUES (?)').run(title);
  const id = Number(r.lastInsertRowid);

  // 顺手给三条通用支链，省得用户从零开始
  const seeds = [
    ['问题域', 'emerald'],
    ['方法路线', 'blue'],
    ['局限与空白', 'amber'],
  ];
  for (const [name, color] of seeds) {
    db.prepare('INSERT INTO map_branches (map_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(id, name, color, seeds.findIndex((s) => s[0] === name));
  }

  return sendJson(res, 200, { id });
}

async function deleteMap(_req, res, params) {
  db.prepare('DELETE FROM maps WHERE id = ?').run(Number(params.id));
  return sendJson(res, 200, { ok: true });
}

async function getMap(_req, res, params) {
  const id = Number(params.id);
  const map = db.prepare('SELECT id, title FROM maps WHERE id = ?').get(id);
  if (!map) return sendJson(res, 404, { error: '拼图不存在' });

  const branches = db.prepare('SELECT id, name, color, sort_order FROM map_branches WHERE map_id = ? ORDER BY sort_order, id')
    .all(id);
  const cards = db.prepare(`
    SELECT c.*, p.title AS paper_title, p.year AS paper_year
    FROM map_cards c LEFT JOIN papers p ON p.id = c.paper_id
    WHERE c.map_id = ? ORDER BY c.created_at
  `).all(id);
  const edges = db.prepare('SELECT id, from_id, to_id, label FROM map_edges WHERE map_id = ?').all(id);

  return sendJson(res, 200, { map, branches, cards, edges });
}

/* ---------------- 支链 ---------------- */

async function createBranch(req, res, params) {
  const mapId = Number(params.id);
  const body = await readBody(req);
  const name = String(body.name || '').trim().slice(0, 40);
  if (!name) return sendJson(res, 400, { error: '支链需要一个名字' });

  const r = db.prepare('INSERT INTO map_branches (map_id, name, color) VALUES (?, ?, ?)')
    .run(mapId, name, clampColor(body.color) || 'emerald');
  return sendJson(res, 200, { id: Number(r.lastInsertRowid) });
}

async function patchBranch(req, res, params) {
  const body = await readBody(req);
  const sets = [];
  const vals = [];
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 40);
    if (!name) return sendJson(res, 400, { error: '支链需要一个名字' });
    sets.push('name = ?');
    vals.push(name);
  }
  if (clampColor(body.color)) {
    sets.push('color = ?');
    vals.push(body.color);
  }
  if (!sets.length) return sendJson(res, 400, { error: '没有要改的字段' });

  db.prepare(`UPDATE map_branches SET ${sets.join(', ')} WHERE id = ?`).run(...vals, Number(params.id));
  return sendJson(res, 200, { ok: true });
}

async function deleteBranch(_req, res, params) {
  db.prepare('DELETE FROM map_branches WHERE id = ?').run(Number(params.id));
  return sendJson(res, 200, { ok: true });
}

/* ---------------- 卡片 ---------------- */

async function createCard(req, res, params) {
  const mapId = Number(params.id);
  const body = await readBody(req);

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO map_cards (id, map_id, paper_id, branch_id, x, y, color, problem, solution, limitation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, mapId,
    body.paperId ? Number(body.paperId) : null,
    body.branchId ? Number(body.branchId) : null,
    num(body.x), num(body.y),
    clampColor(body.color),
    txt(body.problem, 2000), txt(body.solution, 2000), txt(body.limitation, 2000),
  );

  db.prepare("UPDATE maps SET updated_at = datetime('now') WHERE id = ?").run(mapId);
  return sendJson(res, 200, { id });
}

async function patchCard(req, res, params) {
  const body = await readBody(req);
  const sets = [];
  const vals = [];

  if (body.x !== undefined) { sets.push('x = ?'); vals.push(num(body.x)); }
  if (body.y !== undefined) { sets.push('y = ?'); vals.push(num(body.y)); }
  if (body.paperId !== undefined) { sets.push('paper_id = ?'); vals.push(body.paperId ? Number(body.paperId) : null); }
  if (body.branchId !== undefined) { sets.push('branch_id = ?'); vals.push(body.branchId ? Number(body.branchId) : null); }
  if (body.color !== undefined) { sets.push('color = ?'); vals.push(clampColor(body.color)); }
  for (const key of ['problem', 'solution', 'limitation']) {
    if (body[key] !== undefined) { sets.push(`${key} = ?`); vals.push(txt(body[key], 2000)); }
  }

  if (!sets.length) return sendJson(res, 400, { error: '没有要改的字段' });
  sets.push("updated_at = datetime('now')");

  db.prepare(`UPDATE map_cards SET ${sets.join(', ')} WHERE id = ?`).run(...vals, params.id);
  return sendJson(res, 200, { ok: true });
}

async function deleteCard(_req, res, params) {
  db.prepare('DELETE FROM map_cards WHERE id = ?').run(params.id);
  db.prepare('DELETE FROM map_edges WHERE from_id = ? OR to_id = ?').run(params.id, params.id);
  return sendJson(res, 200, { ok: true });
}

/* ---------------- 连线 ---------------- */

async function createEdge(req, res, params) {
  const mapId = Number(params.id);
  const body = await readBody(req);
  const from = String(body.from || '');
  const to = String(body.to || '');
  if (!from || !to || from === to) return sendJson(res, 400, { error: '连线两端不合法' });

  const exists = db.prepare('SELECT 1 FROM map_edges WHERE map_id = ? AND from_id = ? AND to_id = ?')
    .get(mapId, from, to);
  if (exists) return sendJson(res, 200, { id: exists.id, duplicate: true });

  const id = crypto.randomUUID();
  db.prepare('INSERT INTO map_edges (id, map_id, from_id, to_id, label) VALUES (?, ?, ?, ?, ?)')
    .run(id, mapId, from, to, txt(body.label, 80));
  return sendJson(res, 200, { id });
}

async function deleteEdge(_req, res, params) {
  db.prepare('DELETE FROM map_edges WHERE id = ?').run(params.id);
  return sendJson(res, 200, { ok: true });
}

module.exports = function register(add) {
  add('GET', '/api/boards', listMaps);
  add('POST', '/api/boards', createMap);
  add('GET', '/api/boards/:id', getMap);
  add('DELETE', '/api/boards/:id', deleteMap);

  add('POST', '/api/boards/:id/branches', createBranch);
  add('PATCH', '/api/branches/:id', patchBranch);
  add('DELETE', '/api/branches/:id', deleteBranch);

  add('POST', '/api/boards/:id/cards', createCard);
  add('PATCH', '/api/cards/:id', patchCard);
  add('DELETE', '/api/cards/:id', deleteCard);

  add('POST', '/api/boards/:id/edges', createEdge);
  add('DELETE', '/api/edges/:id', deleteEdge);
};
