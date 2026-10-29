-- 007 · 文献拼图（自由画布）
-- 一张拼图 = 多个「文献卡」自由摆放 + 若干「支链」分组 + 卡片之间的连线

CREATE TABLE IF NOT EXISTS maps (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS map_branches (
  id         INTEGER PRIMARY KEY,
  map_id     INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'emerald',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_branch_map ON map_branches(map_id);

CREATE TABLE IF NOT EXISTS map_cards (
  id         TEXT PRIMARY KEY,
  map_id     INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  paper_id   INTEGER REFERENCES papers(id) ON DELETE SET NULL,
  branch_id  INTEGER REFERENCES map_branches(id) ON DELETE SET NULL,
  x          REAL NOT NULL DEFAULT 0,
  y          REAL NOT NULL DEFAULT 0,
  color      TEXT,
  problem    TEXT,
  solution   TEXT,
  limitation TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_card_map ON map_cards(map_id);

CREATE TABLE IF NOT EXISTS map_edges (
  id      TEXT PRIMARY KEY,
  map_id  INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL,
  to_id   TEXT NOT NULL,
  label   TEXT
);
CREATE INDEX IF NOT EXISTS idx_edge_map ON map_edges(map_id);
