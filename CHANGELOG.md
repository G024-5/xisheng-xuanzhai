# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 与 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

## [0.1.0] - 2026-10-28

首个可用版本。

### 新增

- 从 Zotero 只读导入文献、作者、标签、集合与 PDF（绝不改动原库）
- 内容寻址的 PDF 存储：按 sha256 命名，天然去重
- 多层级分类树 + 知识树（节点可挂载文献，一篇可挂多个节点）
- 全文搜索（标题 / 摘要 / 作者 / 标签 / 笔记）与六种排序（导入时间、年份、标题）
- 阅读状态过滤：未读 / 在读 / 已读
- 内置 PDF 阅读器、专注模式（PDF 占满窗口）、可拖拽的阅读与笔记分栏
- 每篇一个自动保存的笔记面板
- DeepSeek AI 摘要，API Key 可在界面配置且只回显掩码
- 数据库迁移机制：按序执行、单条事务、失败整体回滚、迁移前自动快照
- 每日自动备份（凌晨 3 点，保留 10 份）与 `npm run backup` 手动备份

### 变更

- 项目更名为「溪声轩斋」，主题色改为祖母绿
- 目录重组为 `src/{routes,services,db,util}` + `scripts` + `public/js`
- PDF 路径改为相对路径（由 sha256 推导），项目目录移动 / 重命名后不再失效

### 文档

- README 明确开源边界：仓库只发布框架，Zotero 环境与 API Key 由使用者自备
- 新增 `SECURITY.md`：数据存放位置、Key 的处理方式、不要暴露到公网

[0.1.0]: https://github.com/<you>/xisheng-xuanzhai/releases/tag/v0.1.0
