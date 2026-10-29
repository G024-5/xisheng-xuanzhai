'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, DATA_DIR, STORAGE_DIR } = require('../db');
const { sendJson, readBody, sendFile } = require('../util/http');
const { savePdfStream, isPdfFile } = require('../util/upload');
const { createPaper, norm } = require('../services/ingest');
const { extractPdfMeta, looksGarbled } = require('../services/pdfmeta');
const { parseIdentifier, fetchArxiv, fetchDoi, downloadArxivPdf } = require('../services/metadata');

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

  paper.summary = db.prepare('SELECT tldr, model, scope, created_at FROM ai_summaries WHERE paper_id = ?').get(id)
    || null;

  paper.treeNodes = db.prepare(`
    SELECT te.node_id, n.title FROM tree_entries te JOIN tree_nodes n ON n.id = te.node_id
    WHERE te.target_type = 'paper' AND te.target_id = ?
  `).all(String(id));

  return sendJson(res, 200, paper);
}

async function patch(req, res, params) {
  const id = Number(params.id);
  if (!db.prepare('SELECT 1 FROM papers WHERE id = ?').get(id)) {
    return sendJson(res, 404, { error: '文献不存在' });
  }

  const body = await readBody(req);
  const sets = [];
  const vals = [];

  if (body.read_state && ['unread', 'reading', 'read'].includes(body.read_state)) {
    sets.push('read_state = ?');
    vals.push(body.read_state);
  }

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return sendJson(res, 400, { error: '标题不能为空' });
    sets.push('title = ?', 'title_norm = ?');
    vals.push(title, norm(title));
  }

  if (body.year !== undefined) {
    const y = body.year === null || body.year === '' ? null : Number(body.year);
    if (y !== null && (!Number.isInteger(y) || y < 1000 || y > 2999)) {
      return sendJson(res, 400, { error: '年份看起来不对' });
    }
    sets.push('year = ?');
    vals.push(y);
  }

  if (body.venue !== undefined) {
    sets.push('venue = ?');
    vals.push(String(body.venue).trim() || null);
  }

  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    db.prepare(`UPDATE papers SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  }

  if (body.authors !== undefined) {
    const names = (Array.isArray(body.authors) ? body.authors : String(body.authors).split(/[,，;；]/))
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 30);

    db.prepare('DELETE FROM paper_authors WHERE paper_id = ?').run(id);
    names.forEach((name, i) => {
      db.prepare('INSERT OR IGNORE INTO authors (name) VALUES (?)').run(name);
      const a = db.prepare('SELECT id FROM authors WHERE name = ?').get(name);
      if (a) {
        db.prepare('INSERT OR IGNORE INTO paper_authors (paper_id, author_id, position) VALUES (?, ?, ?)')
          .run(id, a.id, i);
      }
    });
  }

  return sendJson(res, 200, { ok: true });
}

/** 删除文献：连带笔记、知识树挂载、附件记录；PDF 只在无人引用时删文件 */
async function remove(req, res, params) {
  const id = Number(params.id);
  const paper = db.prepare('SELECT id, title FROM papers WHERE id = ?').get(id);
  if (!paper) return sendJson(res, 404, { error: '文献不存在' });

  const atts = db.prepare('SELECT sha256, rel_path FROM attachments WHERE paper_id = ?').all(id);
  const noteCount = db.prepare('SELECT COUNT(*) c FROM notes WHERE paper_id = ?').get(id).c;
  const treeCount = db.prepare("SELECT COUNT(*) c FROM tree_entries WHERE target_type = 'paper' AND target_id = ?")
    .get(String(id)).c;

  db.exec('BEGIN');
  try {
    db.prepare("DELETE FROM tree_entries WHERE target_type = 'paper' AND target_id = ?").run(String(id));
    db.prepare('DELETE FROM papers WHERE id = ?').run(id); // 其余靠外键级联
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  let files = 0;
  for (const att of atts) {
    const stillUsed = db.prepare('SELECT 1 FROM attachments WHERE sha256 = ? LIMIT 1').get(att.sha256);
    if (stillUsed) continue;
    const full = path.join(STORAGE_DIR, att.rel_path);
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      files++;
    }
  }

  return sendJson(res, 200, {
    ok: true,
    removed: { notes: noteCount, treeEntries: treeCount, files },
  });
}

async function file(req, res, params) {
  const att = db.prepare('SELECT rel_path FROM attachments WHERE paper_id = ? ORDER BY id LIMIT 1')
    .get(Number(params.id));
  if (!att) return sendJson(res, 404, { error: '这篇文献没有 PDF' });
  // 路径由 sha256 推导，跟着 data/ 走，项目目录改名也不失效
  return sendFile(req, res, path.join(STORAGE_DIR, att.rel_path), { type: 'application/pdf', inline: true });
}

/* ---------------- 入库 ---------------- */

const TMP_DIR = path.join(DATA_DIR, 'tmp');
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

/** POST /api/uploads —— 裸二进制 PDF，返回 uploadId 供下一步建条目 */
async function upload(req, res, _params, url) {
  const rawName = url.searchParams.get('filename') || '';
  const filename = decodeURIComponent(rawName).slice(0, 200);

  fs.mkdirSync(TMP_DIR, { recursive: true });
  const uploadId = `${crypto.randomUUID()}.pdf`;
  const tmpFile = path.join(TMP_DIR, uploadId);

  const { bytes, sha256 } = await savePdfStream(req, tmpFile);
  if (!bytes) {
    fs.unlinkSync(tmpFile);
    return sendJson(res, 400, { error: '没有收到文件内容' });
  }
  if (!isPdfFile(tmpFile)) {
    fs.unlinkSync(tmpFile);
    return sendJson(res, 400, { error: '这不是一个 PDF 文件' });
  }

  // 同一份文件已经入过库，直接告诉前端是哪一篇
  const dup = db.prepare('SELECT paper_id FROM attachments WHERE sha256 = ? LIMIT 1').get(sha256);
  if (dup) {
    fs.unlinkSync(tmpFile);
    return sendJson(res, 200, { duplicate: true, paperId: dup.paper_id, sha256, bytes });
  }

  const base = filename.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim();

  // 从 PDF 里猜元数据（只对 40MB 以内的文件做，避免为了几个字读爆内存）
  let suggest = { title: '', authors: [], arxivId: null, doi: null };
  if (bytes <= 40 * 1024 * 1024) {
    try {
      const meta = extractPdfMeta(fs.readFileSync(tmpFile));

      const rawTitle = meta.infoTitle || meta.xmpTitle || meta.guessTitle || '';
      const authors = meta.infoAuthor
        ? meta.infoAuthor.split(/[;,，；]/).map((s) => s.trim()).filter(Boolean)
        : meta.guessAuthors;

      suggest = {
        title: looksGarbled(rawTitle) ? '' : rawTitle,
        authors: authors.filter((a) => !looksGarbled(a)),
        arxivId: meta.identifiers.arxivId,
        // 上传时不猜 DOI：正文里引用的 DOI 太容易认错，让用户自己粘
        doi: null,
      };

      // 认出了 arXiv 水印就查权威接口，比任何启发式都准
      if (suggest.arxivId) {
        try {
          const exact = await fetchArxiv(suggest.arxivId, 6000);
          suggest = { title: exact.title, authors: exact.authors, arxivId: suggest.arxivId, doi: exact.doi || null };
        } catch { /* 网络慢或失败就用本地猜的 */ }
      }
    } catch { /* 提取失败不影响上传 */ }
  }

  return sendJson(res, 200, {
    uploadId,
    sha256,
    bytes,
    suggestedTitle: (suggest.title || base).slice(0, 300) || '未命名文献',
    suggestedAuthors: suggest.authors.slice(0, 20),
    arxivId: suggest.arxivId,
    doi: suggest.doi,
  });
}

/** POST /api/papers —— 用 uploadId 或纯元数据建条目 */
async function create(req, res) {
  const body = await readBody(req);

  let tmpFile = null;
  if (body.uploadId) {
    if (!UPLOAD_ID.test(String(body.uploadId))) return sendJson(res, 400, { error: '无效的 uploadId' });
    tmpFile = path.join(TMP_DIR, body.uploadId);
    if (!fs.existsSync(tmpFile)) return sendJson(res, 400, { error: '上传已过期，请重新选择文件' });
  }

  const result = createPaper({
    title: body.title,
    abstract: body.abstract,
    year: body.year,
    venue: body.venue,
    doi: body.doi,
    arxivId: body.arxivId,
    authors: Array.isArray(body.authors)
      ? body.authors
      : String(body.authors || '').split(/[,，;；]/),
    source: body.uploadId ? 'upload' : 'manual',
    sha256: body.sha256 || null,
    tmpFile,
    size: body.bytes || null,
    itemType: body.itemType || 'article',
  });

  return sendJson(res, 200, result);
}

/** POST /api/papers/import —— 粘贴 DOI / arXiv 自动抓取 */
async function importByIdentifier(req, res) {
  const body = await readBody(req);
  const parsed = parseIdentifier(body.identifier);
  if (!parsed) {
    return sendJson(res, 400, {
      error: '没认出这是 DOI 还是 arXiv 号。示例：10.1038/s41586-020-2649-2 或 2301.12345',
    });
  }

  const meta = parsed.type === 'arxiv'
    ? await fetchArxiv(parsed.id)
    : await fetchDoi(parsed.id);

  let pdf = null;
  let tmpFile = null;
  let sha256 = null;

  if (parsed.type === 'arxiv') {
    pdf = await downloadArxivPdf(parsed.id);
    if (pdf) {
      sha256 = crypto.createHash('sha256').update(pdf).digest('hex');
      fs.mkdirSync(TMP_DIR, { recursive: true });
      tmpFile = path.join(TMP_DIR, `${crypto.randomUUID()}.pdf`);
      fs.writeFileSync(tmpFile, pdf);
    }
  }

  const result = createPaper({
    ...meta,
    source: parsed.type,
    sha256,
    tmpFile,
    size: pdf ? pdf.length : null,
    itemType: parsed.type === 'arxiv' ? 'preprint' : 'article',
  });

  return sendJson(res, 200, { ...result, hasPdf: Boolean(pdf), meta: { title: meta.title, year: meta.year } });
}

module.exports = function register(add) {
  add('GET', '/api/papers', list);
  add('GET', '/api/papers/:id', detail);
  add('PATCH', '/api/papers/:id', patch);
  add('DELETE', '/api/papers/:id', remove);
  add('GET', '/api/papers/:id/file', file);
  add('POST', '/api/uploads', upload);
  add('POST', '/api/papers', create);
  add('POST', '/api/papers/import', importByIdentifier);
};
