'use strict';
const { db } = require('../db');
const { sendJson, readBody, sendFile } = require('../util/http');

/** 排序白名单：只允许这几个，避免 SQL 注入 */
const SORTS = {
  added_desc: 'p.added_at DESC, p.id DESC',
  added_asc: 'p.added_at ASC, p.id ASC',
  year_desc: 'IFNULL(p.year, 0) DESC, p.added_at DESC',
  year_asc: 'IFNULL(p.year, 9999) ASC, p.added_at DESC',
  title_asc: 'p.title COLLATE NOCASE ASC',
  title_desc: 'p.title COLLATE NOCASE DESC',
};

function buildWhere({ q, collectionId, nodeId, state }) {
  const where = ['1=1'];
  const params = [];

  if (q) {
    const like = `%${q}%`;
    where.push(`(
      p.title LIKE ? OR IFNULL(p.abstract, '') LIKE ?
      OR EXISTS (SELECT 1 FROM paper_authors pa JOIN authors a ON a.id = pa.author_id
                 WHERE pa.paper_id = p.id AND a.name LIKE ?)
      OR EXISTS (SELECT 1 FROM paper_tags pt JOIN tags t ON t.id = pt.tag_id
                 WHERE pt.paper_id = p.id AND t.name LIKE ?)
      OR EXISTS (SELECT 1 FROM notes n WHERE n.paper_id = p.id AND n.body LIKE ?)
    )`);
    params.push(like, like, like, like, like);
  }
  if (collectionId) {
    where.push('EXISTS (SELECT 1 FROM collection_items ci WHERE ci.paper_id = p.id AND ci.collection_id = ?)');
    params.push(collectionId);
  }
  if (nodeId) {
    where.push(`EXISTS (SELECT 1 FROM tree_entries te
                 WHERE te.target_type = 'paper' AND te.node_id = ? AND CAST(te.target_id AS INTEGER) = p.id)`);
    params.push(nodeId);
  }
  if (state) {
    where.push('p.read_state = ?');
    params.push(state);
  }
  return { sql: where.join(' AND '), params };
}

async function list(req, res, _params, url) {
  const q = (url.searchParams.get('q') || '').trim();
  const sort = SORTS[url.searchParams.get('sort')] ? url.searchParams.get('sort') : 'added_desc';
  const collectionId = url.searchParams.get('collectionId');
  const nodeId = url.searchParams.get('nodeId');
  const state = url.searchParams.get('state') || '';

  const { sql, params } = buildWhere({
    q,
    collectionId: collectionId ? Number(collectionId) : null,
    nodeId: nodeId ? Number(nodeId) : null,
    state,
  });

  const items = db.prepare(`
    SELECT p.id, p.title, p.year, p.venue, p.read_state, p.added_at,
           (SELECT group_concat(a.name, ', ') FROM paper_authors pa
              JOIN authors a ON a.id = pa.author_id
             WHERE pa.paper_id = p.id ORDER BY pa.position) AS authors,
           (SELECT COUNT(*) FROM attachments t WHERE t.paper_id = p.id) AS has_pdf
    FROM papers p
    WHERE ${sql}
    ORDER BY ${SORTS[sort]}
    LIMIT 1000
  `).all(...params);

  const counts = {};
  for (const r of db.prepare('SELECT read_state, COUNT(*) c FROM papers GROUP BY read_state').all()) {
    counts[r.read_state] = r.c;
  }

  return sendJson(res, 200, { items, sort, counts, total: items.length });
}

async function detail(req, res, params) {
  const id = Number(params.id);
  const paper = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM attachments t WHERE t.paper_id = p.id) AS has_pdf
    FROM papers p WHERE p.id = ?
  `).get(id);
  if (!paper) return sendJson(res, 404, { error: '文献不存在' });

  paper.authors = db.prepare(`
    SELECT a.name FROM paper_authors pa JOIN authors a ON a.id = pa.author_id
    WHERE pa.paper_id = ? ORDER BY pa.position
  `).all(id).map((r) => r.name);

  paper.tags = db.prepare(`
    SELECT t.name FROM paper_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.paper_id = ?
  `).all(id).map((r) => r.name);

  paper.collections = db.prepare(`
    SELECT c.id, c.name FROM collection_items ci JOIN collections c ON c.id = ci.collection_id
    WHERE ci.paper_id = ?
  `).all(id);

  paper.note = db.prepare('SELECT body, updated_at FROM notes WHERE paper_id = ?').get(id)
    || { body: '', updated_at: null };

  paper.summary = db.prepare('SELECT tldr, model, created_at FROM ai_summaries WHERE paper_id = ?').get(id)
    || null;

  paper.treeNodes = db.prepare(`
    SELECT te.node_id, n.title FROM tree_entries te JOIN tree_nodes n ON n.id = te.node_id
    WHERE te.target_type = 'paper' AND te.target_id = ?
  `).all(String(id));

  return sendJson(res, 200, paper);
}

async function patch(req, res, params) {
  const id = Number(params.id);
  const body = await readBody(req);
  if (body.read_state && ['unread', 'reading', 'read'].includes(body.read_state)) {
    db.prepare("UPDATE papers SET read_state = ?, updated_at = datetime('now') WHERE id = ?")
      .run(body.read_state, id);
  }
  return sendJson(res, 200, { ok: true });
}

async function file(req, res, params) {
  const att = db.prepare('SELECT abs_path FROM attachments WHERE paper_id = ? ORDER BY id LIMIT 1')
    .get(Number(params.id));
  if (!att) return sendJson(res, 404, { error: '这篇文献没有 PDF' });
  return sendFile(req, res, att.abs_path, { type: 'application/pdf', inline: true });
}

module.exports = function register(add) {
  add('GET', '/api/papers', list);
  add('GET', '/api/papers/:id', detail);
  add('PATCH', '/api/papers/:id', patch);
  add('GET', '/api/papers/:id/file', file);
};
