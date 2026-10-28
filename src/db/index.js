'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { migrate } = require('./migrate');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = process.env.XISHENG_DATA || path.join(ROOT, 'data');
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
