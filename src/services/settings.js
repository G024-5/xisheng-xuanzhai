'use strict';
const { db } = require('../db');

/** 可配置项及默认值。新增配置只需在这里加一行。 */
const DEFAULTS = {
  'ai.apiKey': '',
  'ai.model': 'deepseek-flash',
  'ai.baseUrl': 'https://api.deepseek.com',
  'ui.noteWidth': '380',
  'ui.theme': 'light',
};

function get(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : (DEFAULTS[key] ?? '');
}

function set(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, String(value ?? ''));
}

function update(patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (k in DEFAULTS) set(k, v);
  }
}

/** 环境变量优先于数据库，便于容器/CI 注入 */
const resolveApiKey = () => process.env.DEEPSEEK_API_KEY || get('ai.apiKey');
const resolveBaseUrl = () => (process.env.DEEPSEEK_BASE || get('ai.baseUrl')).replace(/\/+$/, '');
const resolveModel = () => process.env.DEEPSEEK_MODEL || get('ai.model');

/**
 * 本机端点（Ollama / LM Studio / vLLM / llama.cpp）不需要 Key。
 * 只认回环地址：局域网里别人的模型服务仍当作「需要 Key」处理，免得误判成免鉴权。
 */
function isLocalEndpoint(url) {
  try {
    const u = new URL(String(url || ''));
    return ['127.0.0.1', 'localhost', '0.0.0.0', '::1', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

/** 当前配置下 AI 能不能用：有 Key，或者指向本机端点 */
const isReady = () => Boolean(resolveApiKey()) || isLocalEndpoint(resolveBaseUrl());

function publicView() {
  const key = resolveApiKey();
  const baseUrl = resolveBaseUrl();
  const local = isLocalEndpoint(baseUrl);
  const all = {};
  for (const k of Object.keys(DEFAULTS)) all[k] = get(k);
  return {
    ai: {
      hasKey: Boolean(key),
      /** 本机端点免 Key，界面据此把「Key」标成可留空 */
      local,
      ready: Boolean(key) || local,
      /** 只回显尾部 4 位，前端永不接触完整 Key */
      keyMasked: key ? `${key.slice(0, 3)}••••••${key.slice(-4)}` : '',
      model: resolveModel(),
      baseUrl,
    },
    ui: {
      noteWidth: Number(get('ui.noteWidth')) || 380,
      theme: get('ui.theme') === 'dark' ? 'dark' : 'light',
    },
  };
}

module.exports = {
  get, set, update, publicView, isReady, isLocalEndpoint,
  resolveApiKey, resolveBaseUrl, resolveModel, DEFAULTS,
};
