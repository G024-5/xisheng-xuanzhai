'use strict';
/**
 * 从 Zotero 导入文献与 PDF（只读 Zotero，绝不写入）
 *
 *   node scripts/import-zotero.js ["C:\Users\你\Zotero"]
 *   或设置环境变量 ZOTERO_DIR
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { db, STORAGE_DIR } = require('../src/db');

const ZOT_DIR = process.argv[2] || process.env.ZOTERO_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'Zotero');
const ZOT_DB = path.join(ZOT_DIR, 'zotero.sqlite');

if (!fs.existsSync(ZOT_DB)) {
  console.error(`找不到 Zotero 数据库：${ZOT_DB}`);
  console.error('用法：node scripts/import-zotero.js "C:\\Users\\你\\Zotero"');
  process.exit(1);
}

const zdb = new DatabaseSync(ZOT_DB, { readOnly: true });
const stat = { papers: 0, skipped: 0, pdfs: 0, copiedMB: 0, collections: 0 };

const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// ---------- 条目 ----------
const items = zdb.prepare(`
  SELECT i.itemID, i.key, it.typeName
  FROM items i
  JOIN itemTypes it ON it.itemTypeID = i.itemTypeID
  WHERE it.typeName NOT IN ('attachment', 'note', 'annotation')
    AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
`).all();

const fieldsOf = new Map();
for (const r of zdb.prepare(`
  SELECT d.itemID, f.fieldName, v.value
  FROM itemData d
  JOIN fields f ON f.fieldID = d.fieldID
  JOIN itemDataValues v ON v.valueID = d.valueID
`).all()) {
  if (!fieldsOf.has(r.itemID)) fieldsOf.set(r.itemID, {});
  fieldsOf.get(r.itemID)[r.fieldName] = r.value;
}

const creatorsOf = new Map();
for (const r of zdb.prepare(`
  SELECT ic.itemID, c.firstName, c.lastName, c.fieldMode, ic.orderIndex
  FROM itemCreators ic JOIN creators c ON c.creatorID = ic.creatorID
  ORDER BY ic.itemID, ic.orderIndex
`).all()) {
  const name = r.fieldMode === 1
    ? (r.lastName || r.firstName || '').trim()
    : [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
  if (!name) continue;
  if (!creatorsOf.has(r.itemID)) creatorsOf.set(r.itemID, []);
  creatorsOf.get(r.itemID).push(name);
}

const tagsOf = new Map();
for (const r of zdb.prepare('SELECT it.itemID, t.name FROM itemTags it JOIN tags t ON t.tagID = it.tagID').all()) {
  if (!tagsOf.has(r.itemID)) tagsOf.set(r.itemID, []);
  tagsOf.get(r.itemID).push(r.name);
}

const pdfOf = new Map();
for (const r of zdb.prepare(`
  SELECT ia.parentItemID, ia.path, i.key AS attKey
  FROM itemAttachments ia
  JOIN items i ON i.itemID = ia.itemID
  WHERE ia.contentType = 'application/pdf'
    AND ia.parentItemID IS NOT NULL
    AND ia.path LIKE 'storage:%'
`).all()) {
  if (!pdfOf.has(r.parentItemID)) pdfOf.set(r.parentItemID, []);
  pdfOf.get(r.parentItemID).push(r);
}

// ---------- 集合 ----------
const zCols = zdb.prepare('SELECT collectionID, collectionName, parentCollectionID, key FROM collections').all();
const colKeyOf = new Map();
for (const c of zCols) {
  const exists = db.prepare('SELECT id FROM collections WHERE zotero_key = ?').get(c.key);
  if (exists) { colKeyOf.set(c.collectionID, exists.id); continue; }
  const r = db.prepare('INSERT INTO collections (zotero_key, name) VALUES (?, ?)').run(c.key, c.collectionName);
  colKeyOf.set(c.collectionID, Number(r.lastInsertRowid));
  stat.collections++;
}
for (const c of zCols) {
  if (c.parentCollectionID && colKeyOf.has(c.parentCollectionID)) {
    db.prepare('UPDATE collections SET parent_id = ? WHERE id = ?')
      .run(colKeyOf.get(c.parentCollectionID), colKeyOf.get(c.collectionID));
  }
}

const colItems = zdb.prepare('SELECT collectionID, itemID FROM collectionItems').all();
const zItemToLocal = new Map();

// ---------- 写入 ----------
const insPaper = db.prepare(`
  INSERT INTO papers (zotero_key, title, title_norm, abstract, year, venue, doi, url, item_type)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insAuthor = db.prepare('INSERT OR IGNORE INTO authors (name) VALUES (?)');
const getAuthor = db.prepare('SELECT id FROM authors WHERE name = ?');
const insPA = db.prepare('INSERT OR IGNORE INTO paper_authors (paper_id, author_id, position) VALUES (?, ?, ?)');
const insTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
const getTag = db.prepare('SELECT id FROM tags WHERE name = ?');
const insPT = db.prepare('INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES (?, ?)');
const insAtt = db.prepare('INSERT OR IGNORE INTO attachments (paper_id, sha256, rel_path, byte_size) VALUES (?, ?, ?, ?)');

for (const item of items) {
  const f = fieldsOf.get(item.itemID) || {};
  const title = (f.title || '').trim();
  if (!title) { stat.skipped++; continue; }

  const existing = db.prepare('SELECT id FROM papers WHERE zotero_key = ?').get(item.key);
  if (existing) { zItemToLocal.set(item.itemID, existing.id); stat.skipped++; continue; }

  const yearMatch = (f.date || '').match(/(?:19|20)\d{2}/);
  const r = insPaper.run(
    item.key,
    title,
    norm(title),
    (f.abstractNote || '').trim() || null,
    yearMatch ? Number(yearMatch[0]) : null,
    f.publicationTitle || f.bookTitle || f.proceedingsTitle || f.repository || f.university || null,
    f.DOI || null,
    f.url || null,
    item.typeName,
  );
  const paperId = Number(r.lastInsertRowid);
  zItemToLocal.set(item.itemID, paperId);
  stat.papers++;

  for (const [i, name] of (creatorsOf.get(item.itemID) || []).entries()) {
    insAuthor.run(name);
    const a = getAuthor.get(name);
    if (a) insPA.run(paperId, a.id, i);
  }

  for (const t of (tagsOf.get(item.itemID) || [])) {
    const name = t.slice(0, 60);
    insTag.run(name);
    const tg = getTag.get(name);
    if (tg) insPT.run(paperId, tg.id);
  }

  for (const att of (pdfOf.get(item.itemID) || [])) {
    const src = path.join(ZOT_DIR, 'storage', att.attKey, att.path.slice('storage:'.length));
    if (!fs.existsSync(src)) continue;
    try {
      const buf = fs.readFileSync(src);
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      const rel = `${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}.pdf`;
      const dst = path.join(STORAGE_DIR, sha.slice(0, 2), sha.slice(2, 4));
      fs.mkdirSync(dst, { recursive: true });
      const full = path.join(STORAGE_DIR, rel);
      if (!fs.existsSync(full)) fs.writeFileSync(full, buf);
      insAtt.run(paperId, sha, rel, buf.length);
      stat.pdfs++;
      stat.copiedMB += buf.length / 1048576;
      break; // 一篇只取第一个 PDF
    } catch (e) {
      console.warn(`  附件 ${att.attKey} 失败：${e.message}`);
    }
  }
}

for (const ci of colItems) {
  const pid = zItemToLocal.get(ci.itemID);
  const cid = colKeyOf.get(ci.collectionID);
  if (pid && cid) {
    db.prepare('INSERT OR IGNORE INTO collection_items (collection_id, paper_id) VALUES (?, ?)').run(cid, pid);
  }
}

console.log('导入完成');
console.log(`  文献  ${stat.papers} 篇新增，${stat.skipped} 已存在/跳过`);
console.log(`  PDF   ${stat.pdfs} 个，${stat.copiedMB.toFixed(1)} MB`);
console.log(`  集合  ${stat.collections} 个`);
console.log(`  合计  ${db.prepare('SELECT COUNT(*) c FROM papers').get().c} 篇，其中带 PDF ${db.prepare('SELECT COUNT(DISTINCT paper_id) c FROM attachments').get().c} 篇`);
