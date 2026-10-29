-- 006 · 导图节点的稳定身份
-- mind_id 由前端生成，节点的增删改重排都靠它对齐，不再依赖自增 id
ALTER TABLE tree_nodes ADD COLUMN mind_id TEXT;

UPDATE tree_nodes SET mind_id = 'n' || id WHERE mind_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tree_mind ON tree_nodes(mind_id) WHERE mind_id IS NOT NULL;
