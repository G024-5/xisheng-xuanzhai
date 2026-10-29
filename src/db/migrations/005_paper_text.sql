-- 005 · 正文缓存与摘要作用域
-- paper_text：抽取结果按 sha256 缓存，重复摘要不重复解析
CREATE TABLE IF NOT EXISTS paper_text (
  paper_id   INTEGER PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  sha256     TEXT NOT NULL,
  text       TEXT NOT NULL,
  chars      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- scope: fulltext=读全文，abstract=只有摘要
ALTER TABLE ai_summaries ADD COLUMN scope TEXT;
