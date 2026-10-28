'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { db, STORAGE_DIR } = require('../db');

const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const storageRel = (sha) => `${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}.pdf`;
const storageFull = (sha) => path.join(STORAGE_DIR, storageRel(sha));

/** 按 arxiv_id → doi → sha256 → 标题+年份 的顺序查重 */
function findExisting({ arxivId, doi, sha256, titleNorm, year }) {
  if (arxivId) {
    const r = db.prepare('SELECT id FROM papers WHERE arxiv_id = ?').get(arxivId);
    if (r) return r;
  }
  if (doi) {
    const r = db.prepare('SELECT id FROM papers WHERE doi = ?').get(doi);
    if (r) return r;
  }
  if (sha256) {
    const r = db.prepare('SELECT paper_id AS id FROM attachments WHERE sha256 = ? LIMIT 1').get(sha256);
    if (r) return r;
  }
  const r = db.prepare('SELECT id FROM papers WHERE title_norm = ? AND IFNULL(year, -1) = ?')
    .get(titleNorm, year ?? -1);
  return r || null;
}

function attachFile(paperId, { sha256, tmpFile, size }) {
  if (!sha256 || !tmpFile) return false;
  if (db.prepare('SELECT 1 FROM attachments WHERE paper_id = ? AND sha256 = ?').get(paperId, sha256)) {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    return false;
  }

  const full = storageFull(sha256);
  fs.mkdirSync(path.dirname(full), { recursive: true });

  if (fs.existsSync(full)) fs.unlinkSync(tmpFile); // 同一份 PDF 已经存过
  else fs.renameSync(tmpFile, full);

  db.prepare('INSERT INTO attachments (paper_id, sha256, rel_path, byte_size) VALUES (?, ?, ?, ?)')
    .run(paperId, sha256, storageRel(sha256), size || 0);
  return true;
}

/**
 * 创建（或命中已有的）文献条目。
 * 所有入库路径——上传、DOI、arXiv、手填——最终都走这里，保证查重规则只有一份。
 */
function createPaper(input) {
  const title = String(input.title || '').trim();
  if (!title) throw Object.assign(new Error('标题不能为空'), { status: 400 });

  const titleNorm = norm(title);
  const year = input.year ? Number(input.year) : null;
  const doi = input.doi ? String(input.doi).trim().toLowerCase() : null;
  const arxivId = input.arxivId ? String(input.arxivId).trim() : null;

  const found = findExisting({ arxivId, doi, sha256: input.sha256, titleNorm, year });

  let id;
  let deduped = false;

  if (found) {
    id = found.id;
    deduped = true;
    // 已有条目缺 PDF 时补上
    db.prepare(`UPDATE papers SET
        abstract = COALESCE(abstract, ?),
        doi = COALESCE(doi, ?),
        arxiv_id = COALESCE(arxiv_id, ?),
        updated_at = datetime('now')
      WHERE id = ?`).run(input.abstract || null, doi, arxivId, id);
  } else {
    const r = db.prepare(`
      INSERT INTO papers (title, title_norm, abstract, year, venue, doi, arxiv_id, url, item_type, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, titleNorm, input.abstract || null, year, input.venue || null,
      doi, arxivId, input.url || null, input.itemType || 'article', input.source || 'manual',
    );
    id = Number(r.lastInsertRowid);
  }

  const names = (input.authors || [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 30);

  names.forEach((name, i) => {
    db.prepare('INSERT OR IGNORE INTO authors (name) VALUES (?)').run(name);
    const a = db.prepare('SELECT id FROM authors WHERE name = ?').get(name);
    if (a) {
      db.prepare('INSERT OR IGNORE INTO paper_authors (paper_id, author_id, position) VALUES (?, ?, ?)')
        .run(id, a.id, i);
    }
  });

  const attached = attachFile(id, input);
  return { id, deduped, attached };
}

module.exports = { createPaper, storageRel, storageFull, norm };
