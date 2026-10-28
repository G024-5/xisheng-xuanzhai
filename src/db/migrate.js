'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { backup, prune } = require('./backup');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * 顺序执行 migrations/*.sql，已执行的记录在 _migrations 表里。
 *
 * 纪律：
 *   1. 已发布的迁移脚本永不修改，只追加新的
 *   2. 有变更时先自动备份，失败则整体回滚
 *   3. 新库与老库走同一条路径（001 全是 IF NOT EXISTS，可安全重放）
 */
function migrate(db, dataDir, { log = true } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set(db.prepare('SELECT id FROM _migrations').all().map((r) => r.id));
  const pending = files.filter((f) => !done.has(f));

  if (!pending.length) return { applied: [], backupFile: null };

  // 全新安装没有东西可丢，不必留空快照
  const hasData = db.prepare(`
    SELECT COUNT(*) c FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_migrations'
  `).get().c > 0;

  const backupFile = hasData ? backup(db, dataDir, 'pre-migrate') : null;

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (id) VALUES (?)').run(file);
      db.exec('COMMIT');
      if (log) console.log(`  ✓ 迁移 ${file}`);
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(
        `迁移 ${file} 失败：${err.message}\n已回滚。` +
        (backupFile ? `备份在 ${backupFile}` : '（全新库，无需备份）'),
      );
    }
  }

  prune(dataDir, 10);
  return { applied: pending, backupFile };
}

module.exports = { migrate, MIGRATIONS_DIR };
