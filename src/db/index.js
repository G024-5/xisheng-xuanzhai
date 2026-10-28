'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = process.env.PAPERDESK_DATA || path.join(ROOT, 'data');
const STORAGE_DIR = path.join(DATA_DIR, 'storage');

fs.mkdirSync(STORAGE_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

module.exports = { db, ROOT, DATA_DIR, STORAGE_DIR };
