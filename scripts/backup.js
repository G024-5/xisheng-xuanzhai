'use strict';
/** 手动备份：node scripts/backup.js */
const path = require('node:path');
const { db, DATA_DIR } = require('../src/db');
const { backup, prune } = require('../src/db/backup');

const file = backup(db, DATA_DIR, 'manual');
const removed = prune(DATA_DIR, 10);

console.log(`已备份 → ${file}`);
if (removed.length) console.log(`清理旧备份 ${removed.length} 个`);
