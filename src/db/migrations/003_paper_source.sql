-- 003 · 文献来源与 arXiv 标识
-- source: manual=手填 / upload=上传 PDF / doi / arxiv / zotero
ALTER TABLE papers ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE papers ADD COLUMN arxiv_id TEXT;

CREATE INDEX IF NOT EXISTS idx_papers_source ON papers(source);
CREATE UNIQUE INDEX IF NOT EXISTS ux_papers_arxiv ON papers(arxiv_id) WHERE arxiv_id IS NOT NULL;
