'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('./migrate');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * 数据目录优先级：
 *   1. XISHENG_DATA 环境变量（测试、便携、多实例都用它）
 *   2. 打包进 app.asar 的桌面版 → %APPDATA%\Xisheng\data（程序目录通常不可写）
 *   3. 源码运行 → 项目下的 data/
 */
function resolveDataDir() {
  if (process.env.XISHENG_DATA) return path.resolve(process.env.XISHENG_DATA);
  if (ROOT.includes('app.asar')) {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'Xisheng', 'data');
  }
  return path.join(ROOT, 'data');
}

const DATA_DIR = resolveDataDir();
const STORAGE_DIR = path.join(DATA_DIR, 'storage');

fs.mkdirSync(STORAGE_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));

// PRAGMA 必须在事务外执行，所以放在迁移之前
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

migrate(db, DATA_DIR);

module.exports = { db, ROOT, DATA_DIR, STORAGE_DIR };
