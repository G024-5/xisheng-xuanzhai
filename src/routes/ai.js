'use strict';
const { db } = require('../db');
const llm = require('../services/llm');
const settings = require('../services/settings');
const { getPaperText } = require('../services/pdftext');
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

  // 有 PDF 就先抽全文；抽不出来（扫描件 / 字体异常）再退回摘要
  const full = getPaperText(id);

  try {
    const r = await llm.summarise({ ...paper, body: full?.text || null });

    db.prepare(`
      INSERT INTO ai_summaries (paper_id, tldr, model, scope) VALUES (?, ?, ?, ?)
      ON CONFLICT(paper_id) DO UPDATE SET
        tldr = excluded.tldr, model = excluded.model, scope = excluded.scope,
        created_at = datetime('now')
    `).run(id, r.content, r.model, r.scope);

    return sendJson(res, 200, {
      tldr: r.content,
      model: r.model,
      scope: r.scope,
      chars: full?.chars || 0,
      usage: r.usage,
    });
  } catch (e) {
    return sendJson(res, e.status || 500, { error: e.message });
  }
}

module.exports = function register(add) {
  add('GET', '/api/ai/status', status);
  add('POST', '/api/ai/summary', summary);
};
