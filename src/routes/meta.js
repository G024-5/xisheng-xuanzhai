'use strict';
const { db } = require('../db');
const settings = require('../services/settings');
const { sendJson } = require('../util/http');

const { version } = require('../../package.json');

async function health(_req, res) {
  return sendJson(res, 200, { ok: true, version });
}

async function bootstrap(_req, res) {
  const stats = {
    papers: db.prepare('SELECT COUNT(*) c FROM papers').get().c,
    pdfs: db.prepare('SELECT COUNT(DISTINCT paper_id) c FROM attachments').get().c,
    notes: db.prepare("SELECT COUNT(*) c FROM notes WHERE body != ''").get().c,
    treeNodes: db.prepare('SELECT COUNT(*) c FROM tree_nodes').get().c,
  };

  const counts = db.prepare('SELECT collection_id, COUNT(*) c FROM collection_items GROUP BY collection_id').all();
  const map = Object.fromEntries(counts.map((r) => [r.collection_id, r.c]));

  const collections = db.prepare('SELECT id, name, parent_id, sort_order FROM collections ORDER BY sort_order, name')
    .all()
    .map((c) => ({ ...c, count: map[c.id] || 0 }));

  return sendJson(res, 200, {
    version,
    stats,
    collections,
    settings: settings.publicView(),
  });
}

module.exports = function register(add) {
  add('GET', '/api/health', health);
  add('GET', '/api/bootstrap', bootstrap);
};
