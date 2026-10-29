'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { db, STORAGE_DIR } = require('../db');
const { extractFullText, looksGarbled } = require('./pdfmeta');

const MAX_PDF_BYTES = 80 * 1024 * 1024;
const MIN_USABLE_CHARS = 800;

/**
 * 取一篇文献的正文。按 sha256 缓存，重复调用不重复解析。
 * 抽不出来（扫描件、字体编码异常）时返回 null，调用方回退到摘要。
 */
function getPaperText(paperId) {
  const att = db.prepare('SELECT sha256, rel_path FROM attachments WHERE paper_id = ? ORDER BY id LIMIT 1')
    .get(paperId);
  if (!att) return null;

  const cached = db.prepare('SELECT sha256, text, chars FROM paper_text WHERE paper_id = ?').get(paperId);
  if (cached && cached.sha256 === att.sha256) {
    return { text: cached.text, chars: cached.chars, cached: true };
  }

  const file = path.join(STORAGE_DIR, att.rel_path);
  if (!fs.existsSync(file)) return null;

  try {
    if (fs.statSync(file).size > MAX_PDF_BYTES) return null;

    const { text, chars, pages } = extractFullText(fs.readFileSync(file));
    if (chars < MIN_USABLE_CHARS) return null;
    if (looksGarbled(text.slice(0, 3000))) return null;

    db.prepare(`
      INSERT INTO paper_text (paper_id, sha256, text, chars) VALUES (?, ?, ?, ?)
      ON CONFLICT(paper_id) DO UPDATE SET
        sha256 = excluded.sha256, text = excluded.text, chars = excluded.chars,
        created_at = datetime('now')
    `).run(paperId, att.sha256, text, chars);

    return { text, chars, pages, cached: false };
  } catch (err) {
    console.error('[pdftext] 抽取失败', paperId, err.message);
    return null;
  }
}

module.exports = { getPaperText };
