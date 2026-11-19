-- 摘要送进模型的实际字数：本机模型只吃 8k 字，
-- 界面需要如实显示「全文节选」而不是谎称「全文」。
ALTER TABLE ai_summaries ADD COLUMN sent_chars INTEGER;
