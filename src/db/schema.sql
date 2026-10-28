-- 文献台 PaperDesk · 数据库结构
-- SQLite 3.37+，由 src/db/index.js 在启动时执行（幂等）

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- ============ 文献 ============
CREATE TABLE IF NOT EXISTS papers (
  id          INTEGER PRIMARY KEY,
  zotero_key  TEXT UNIQUE,
  title       TEXT NOT NULL,
  title_norm  TEXT NOT NULL DEFAULT '',
  abstract    TEXT,
  year        INTEGER,
  venue       TEXT,
  doi         TEXT,
  url         TEXT,
  item_type   TEXT,
  read_state  TEXT NOT NULL DEFAULT 'unread',   -- unread | reading | read
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_papers_year  ON papers(year DESC);
CREATE INDEX IF NOT EXISTS idx_papers_state ON papers(read_state);
CREATE INDEX IF NOT EXISTS idx_papers_added ON papers(added_at DESC);

CREATE TABLE IF NOT EXISTS authors (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS paper_authors (
  paper_id  INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (paper_id, author_id)
);

-- ============ 分类与标签 ============
CREATE TABLE IF NOT EXISTS collections (
  id         INTEGER PRIMARY KEY,
  zotero_key TEXT UNIQUE,
  name       TEXT NOT NULL,
  parent_id  INTEGER REFERENCES collections(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  paper_id      INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, paper_id)
);
CREATE INDEX IF NOT EXISTS idx_ci_paper ON collection_items(paper_id);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS paper_tags (
  paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (paper_id, tag_id)
);

-- ============ 附件 ============
CREATE TABLE IF NOT EXISTS attachments (
  id         INTEGER PRIMARY KEY,
  paper_id   INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  sha256     TEXT NOT NULL,
  abs_path   TEXT NOT NULL,
  byte_size  INTEGER NOT NULL,
  page_count INTEGER,
  UNIQUE (paper_id, sha256)
);
CREATE INDEX IF NOT EXISTS idx_att_sha ON attachments(sha256);

-- ============ 笔记 ============
CREATE TABLE IF NOT EXISTS notes (
  paper_id   INTEGER PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  body       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ 知识树 ============
CREATE TABLE IF NOT EXISTS tree_nodes (
  id         INTEGER PRIMARY KEY,
  parent_id  INTEGER REFERENCES tree_nodes(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tree_parent ON tree_nodes(parent_id);

CREATE TABLE IF NOT EXISTS tree_entries (
  id          INTEGER PRIMARY KEY,
  node_id     INTEGER NOT NULL REFERENCES tree_nodes(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL DEFAULT 'paper',
  target_id   TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (node_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_entry_node ON tree_entries(node_id);

-- ============ AI ============
CREATE TABLE IF NOT EXISTS ai_summaries (
  paper_id   INTEGER PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  tldr       TEXT NOT NULL,
  model      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ 设置（键值）============
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
