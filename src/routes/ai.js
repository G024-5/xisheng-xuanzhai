'use strict';
const crypto = require('node:crypto');
const { db } = require('../db');
const llm = require('../services/llm');
const settings = require('../services/settings');
const { getPaperText } = require('../services/pdftext');
const { sendJson, readBody } = require('../util/http');

async function status(_req, res) {
  return sendJson(res, 200, {
    ready: settings.isReady(),
    local: settings.isLocalEndpoint(settings.resolveBaseUrl()),
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
      INSERT INTO ai_summaries (paper_id, tldr, model, scope, sent_chars) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(paper_id) DO UPDATE SET
        tldr = excluded.tldr, model = excluded.model, scope = excluded.scope,
        sent_chars = excluded.sent_chars, created_at = datetime('now')
    `).run(id, r.content, r.model, r.scope, r.sentChars || null);

    return sendJson(res, 200, {
      tldr: r.content,
      model: r.model,
      scope: r.scope,
      chars: full?.chars || 0,
      sentChars: r.sentChars || 0,
      totalChars: r.totalChars || 0,
      usage: r.usage,
    });
  } catch (e) {
    return sendJson(res, e.status || 500, { error: e.message });
  }
}

/**
 * 划词翻译。同一段文字重复选中时直接吃缓存 —— 读者常反复回看同一句，
 * 缓存既省钱也省本机显卡。refresh=1 可强制重译。
 */
async function translate(req, res) {
  const body = await readBody(req);
  const text = String(body.text || '').trim();
  const target = String(body.target || 'zh').slice(0, 8);

  if (!text) return sendJson(res, 400, { error: '没有可翻译的文字' });
  if (text.length > 4000) return sendJson(res, 413, { error: '选中的文字太长，请分段翻译（限 4000 字）' });

  // 「看原文」不花一次请求，也不必进缓存
  if (target === 'original') return sendJson(res, 200, { text, translation: text, model: 'none', cached: true });

  const hash = crypto.createHash('sha256').update(`${target}\n${text}`).digest('hex');

  if (!body.refresh) {
    const hit = db.prepare('SELECT result, model FROM translations WHERE hash = ?').get(hash);
    if (hit) return sendJson(res, 200, { text, translation: hit.result, model: hit.model, cached: true });
  }

  try {
    const r = await llm.translate(text, { target });
    db.prepare(`
      INSERT INTO translations (hash, target, source, result, model) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(hash) DO UPDATE SET result = excluded.result, model = excluded.model, created_at = datetime('now')
    `).run(hash, target, text, r.translation, r.model);

    return sendJson(res, 200, { text, translation: r.translation, model: r.model, cached: false });
  } catch (e) {
    return sendJson(res, e.status || 500, { error: e.message });
  }
}

module.exports = function register(add) {
  add('GET', '/api/ai/status', status);
  add('POST', '/api/ai/summary', summary);
  add('POST', '/api/ai/translate', translate);
};
