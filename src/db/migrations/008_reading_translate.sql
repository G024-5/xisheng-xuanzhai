-- 阅读进度：一篇文献只记最后停留页，翻页时覆盖，不存历史轨迹
CREATE TABLE IF NOT EXISTS reading_progress (
  paper_id INTEGER PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  page INTEGER NOT NULL DEFAULT 1,
  page_count INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 翻译缓存：同一段文字 + 同一目标语言只翻一次。
-- 翻译是纯函数式调用，缓存命中率高（同一篇反复读、同一句反复选），能省下大量 token / 本地算力。
CREATE TABLE IF NOT EXISTS translations (
  hash TEXT PRIMARY KEY,
  target TEXT NOT NULL,
  source TEXT NOT NULL,
  result TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
