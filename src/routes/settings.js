'use strict';
const settings = require('../services/settings');
const llm = require('../services/llm');
const { sendJson, readBody } = require('../util/http');

async function get(_req, res) {
  return sendJson(res, 200, settings.publicView());
}

async function put(req, res) {
  const body = await readBody(req);
  const patch = {};

  if ('apiKey' in body) patch['ai.apiKey'] = String(body.apiKey || '').trim();
  if ('model' in body) {
    const m = String(body.model || '').trim();
    if (m) patch['ai.model'] = m;
  }
  if ('baseUrl' in body) {
    const u = String(body.baseUrl || '').trim();
    if (u) patch['ai.baseUrl'] = u;
  }
  if ('noteWidth' in body) patch['ui.noteWidth'] = String(Math.max(240, Math.min(900, Number(body.noteWidth) || 380)));
  // 主题只认两个值：拼错时退回浅色，别把界面弄成半黑半白
  if ('theme' in body) patch['ui.theme'] = body.theme === 'dark' ? 'dark' : 'light';

  settings.update(patch);
  return sendJson(res, 200, settings.publicView());
}

async function test(_req, res) {
  try {
    const r = await llm.testConnection();
    return sendJson(res, 200, r);
  } catch (e) {
    return sendJson(res, e.status && e.status >= 400 ? 200 : 500, {
      ok: false,
      error: e.message,
    });
  }
}

module.exports = function register(add) {
  add('GET', '/api/settings', get);
  add('PUT', '/api/settings', put);
  add('POST', '/api/settings/test', test);
};
