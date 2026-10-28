'use strict';
const { db } = require('../db');
const llm = require('../services/llm');
const settings = require('../services/settings');
const { sendJson, readBody } = require('../util/http');

async function status(_req, res) {
  return sendJson(res, 200, {
    ready: Boolean(settings.resolveApiKey()),
    model: settings.resolveModel(),
  });
}

async function summary(req, res) {
  const body = await readBody(req);
  const id = Number(body.paperId);
  const paper = db.prepare('SELECT id, title, abstract, venue, year FROM papers WHERE id = ?').get(id);
  if (!paper) return sendJson(res, 404, { error: '文献不存在' });

  try {
    const r = await llm.summarise(paper);
    db.prepare(`
      INSERT INTO ai_summaries (paper_id, tldr, model) VALUES (?, ?, ?)
      ON CONFLICT(paper_id) DO UPDATE SET tldr = excluded.tldr, model = excluded.model, created_at = datetime('now')
    `).run(id, r.content, r.model);

    return sendJson(res, 200, { tldr: r.content, model: r.model, usage: r.usage });
  } catch (e) {
    return sendJson(res, e.status || 500, { error: e.message });
  }
}

module.exports = function register(add) {
  add('GET', '/api/ai/status', status);
  add('POST', '/api/ai/summary', summary);
};
