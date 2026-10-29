'use strict';
const crypto = require('node:crypto');
const { db } = require('../db');
const { sendJson, readBody } = require('../util/http');

const COLORS = new Set(['yellow', 'green', 'blue', 'pink']);

function normalizeRects(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 200)
    .map((r) => ({
      x: Math.min(1, Math.max(0, Number(r.x) || 0)),
      y: Math.min(1, Math.max(0, Number(r.y) || 0)),
      w: Math.min(1, Math.max(0, Number(r.w) || 0)),
      h: Math.min(1, Math.max(0, Number(r.h) || 0)),
    }))
    .filter((r) => r.w > 0.001 && r.h > 0.001);
}

async function list(_req, res, params) {
  const rows = db.prepare(`
    SELECT id, page, color, quote, prefix, suffix, rects, note, created_at
    FROM annotations WHERE paper_id = ? ORDER BY page, created_at
  `).all(Number(params.id));

  return sendJson(res, 200, {
    items: rows.map((r) => ({ ...r, rects: JSON.parse(r.rects || '[]') })),
  });
}

async function create(req, res, params) {
  const paperId = Number(params.id);
  if (!db.prepare('SELECT 1 FROM papers WHERE id = ?').get(paperId)) {
    return sendJson(res, 404, { error: '文献不存在' });
  }

  const body = await readBody(req);
  const quote = String(body.quote || '').trim().slice(0, 5000);
  if (!quote) return sendJson(res, 400, { error: '没有选中文字' });

  const page = Math.max(1, Math.min(20000, Number(body.page) || 1));
  const color = COLORS.has(body.color) ? body.color : 'yellow';
  const rects = normalizeRects(body.rects);
  if (!rects.length) return sendJson(res, 400, { error: '坐标无效' });

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO annotations (id, paper_id, page, color, quote, prefix, suffix, rects, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, paperId, page, color, quote,
    String(body.prefix || '').slice(0, 200) || null,
    String(body.suffix || '').slice(0, 200) || null,
    JSON.stringify(rects),
    body.note ? String(body.note).slice(0, 2000) : null,
  );

  return sendJson(res, 200, { id });
}

async function patch(req, res, params) {
  const body = await readBody(req);
  const sets = [];
  const vals = [];

  if (body.color !== undefined && COLORS.has(body.color)) {
    sets.push('color = ?');
    vals.push(body.color);
  }
  if (body.note !== undefined) {
    sets.push('note = ?');
    vals.push(String(body.note).slice(0, 2000) || null);
  }
  if (!sets.length) return sendJson(res, 400, { error: '没有要改的字段' });

  db.prepare(`UPDATE annotations SET ${sets.join(', ')} WHERE id = ?`).run(...vals, params.id);
  return sendJson(res, 200, { ok: true });
}

async function remove(_req, res, params) {
  db.prepare('DELETE FROM annotations WHERE id = ?').run(params.id);
  return sendJson(res, 200, { ok: true });
}

/** 把一段引文追加到该文献的笔记里 */
async function appendToNote(req, res, params) {
  const paperId = Number(params.id);
  const body = await readBody(req);
  const text = String(body.text || '').trim().slice(0, 5000);
  if (!text) return sendJson(res, 400, { error: '内容为空' });

  const row = db.prepare('SELECT body FROM notes WHERE paper_id = ?').get(paperId);
  const prev = row?.body || '';
  const next = prev ? `${prev}\n\n${text}` : text;

  db.prepare(`
    INSERT INTO notes (paper_id, body, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(paper_id) DO UPDATE SET body = excluded.body, updated_at = datetime('now')
  `).run(paperId, next);

  return sendJson(res, 200, { ok: true, body: next });
}

module.exports = function register(add) {
  add('GET', '/api/papers/:id/annotations', list);
  add('POST', '/api/papers/:id/annotations', create);
  add('POST', '/api/papers/:id/note/append', appendToNote);
  add('PATCH', '/api/annotations/:id', patch);
  add('DELETE', '/api/annotations/:id', remove);
};
