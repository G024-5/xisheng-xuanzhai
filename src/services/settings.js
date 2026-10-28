'use strict';
const { db } = require('../db');

/** 可配置项及默认值。新增配置只需在这里加一行。 */
const DEFAULTS = {
  'ai.apiKey': '',
  'ai.model': 'deepseek-flash',
  'ai.baseUrl': 'https://api.deepseek.com',
  'ui.noteWidth': '380',
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

function publicView() {
  const key = resolveApiKey();
  const all = {};
  for (const k of Object.keys(DEFAULTS)) all[k] = get(k);
  return {
    ai: {
      hasKey: Boolean(key),
      /** 只回显尾部 4 位，前端永不接触完整 Key */
      keyMasked: key ? `${key.slice(0, 3)}••••••${key.slice(-4)}` : '',
      model: resolveModel(),
      baseUrl: resolveBaseUrl(),
    },
    ui: { noteWidth: Number(get('ui.noteWidth')) || 380 },
  };
}

module.exports = { get, set, update, publicView, resolveApiKey, resolveBaseUrl, resolveModel, DEFAULTS };
