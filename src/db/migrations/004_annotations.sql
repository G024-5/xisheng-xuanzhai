-- 004 · 标注
-- rects 存归一化坐标（0..1，相对页面宽高），换设备/缩放都不会跑位
CREATE TABLE IF NOT EXISTS annotations (
  id         TEXT PRIMARY KEY,
  paper_id   INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page       INTEGER NOT NULL,
  color      TEXT NOT NULL DEFAULT 'yellow',
  quote      TEXT NOT NULL,
  prefix     TEXT,
  suffix     TEXT,
  rects      TEXT NOT NULL DEFAULT '[]',
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ann_paper ON annotations(paper_id, page);
