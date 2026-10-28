'use strict';
const { db } = require('../db');
const { sendJson, readBody } = require('../util/http');

async function save(req, res, params) {
  const id = Number(params.id);
  const body = await readBody(req);
  const text = String(body.body ?? '');
  if (text.length > 200000) return sendJson(res, 413, { error: '笔记过长' });

  db.prepare(`
    INSERT INTO notes (paper_id, body, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(paper_id) DO UPDATE SET body = excluded.body, updated_at = datetime('now')
  `).run(id, text);

  return sendJson(res, 200, { ok: true, updated_at: new Date().toISOString() });
}

module.exports = function register(add) {
  add('PUT', '/api/papers/:id/note', save);
};
