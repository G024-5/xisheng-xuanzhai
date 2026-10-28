'use strict';
const fs = require('node:fs');
const path = require('node:path');

/**
 * 在线备份：用 VACUUM INTO 生成一致性快照。
 * 直接复制 app.db 在 WAL 模式下会丢最近事务，必须走这里。
 */
function backup(db, dataDir, reason = 'manual') {
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });

  const ts = new Date()
    .toISOString()
    .replace(/T/, '-')
    .replace(/:/g, '')
    .slice(0, 15); // 2026-10-28-1724

  const file = path.join(dir, `app-${ts}-${reason}.db`);
  const escaped = file.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}'`);
  return file;
}

/** 只保留最近 keep 个备份，避免磁盘悄悄被吃满 */
function prune(dataDir, keep = 10) {
  const dir = path.join(dataDir, 'backups');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  const removed = [];
  for (const { f } of files.slice(keep)) {
    fs.unlinkSync(path.join(dir, f));
    removed.push(f);
  }
  return removed;
}

module.exports = { backup, prune };
