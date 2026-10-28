-- 002 · PDF 改用相对路径
-- 背景：abs_path 存的是绝对路径，项目目录一旦移动/重命名，
--       以及备份恢复到别的机器上，文件就全部失效。
-- 存储位置本就可以由 sha256 完全推导，因此改为 rel_path。

ALTER TABLE attachments ADD COLUMN rel_path TEXT;

UPDATE attachments
   SET rel_path = substr(sha256, 1, 2) || '/' || substr(sha256, 3, 2) || '/' || sha256 || '.pdf'
 WHERE rel_path IS NULL;

ALTER TABLE attachments DROP COLUMN abs_path;
