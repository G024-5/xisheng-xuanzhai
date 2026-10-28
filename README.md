# 溪声轩斋

> 一个跑在自己电脑上的文献管理与精读工具。**零依赖**——不需要 `npm install`，有 Node 就能开始。

**v0.1.0** ｜ Papers in, knowledge out.

「溪声」取流水不腐之意——文献要常读常新，知识要流动起来。

---

## 为什么做这个

Zotero 很适合**收集**文献，但不适合**组织**知识：分类是扁平的、笔记是分离的、知识体系只能靠脑子记。
Obsidian 很适合**写**笔记，但不懂文献——没有元数据、没有 PDF 标注、没有引用关系。

溪声轩斋试图把这两件事缝在一个界面里：**左边是分类和知识树，中间是文献，右边是 PDF 和笔记**。

## 特性

| | 状态 |
|---|---|
| 从 Zotero 导入（只读，绝不改动你的库） | ✅ |
| 内容寻址的 PDF 存储（sha256 命名，天然去重） | ✅ |
| 多层级分类 + 标签 | ✅ |
| 全文搜索：标题 / 摘要 / 作者 / 标签 / 笔记 | ✅ |
| 六种排序：导入时间、发表年份、标题 | ✅ |
| 阅读状态过滤：未读 / 在读 / 已读 | ✅ |
| 内置 PDF 阅读器（翻页、缩放、文内搜索） | ✅ |
| 每篇一个笔记面板，自动保存 | ✅ |
| 知识树：无限层级，一篇文献可挂多个节点 | ✅ |
| 专注模式：顶栏、列表、标题栏全部收起，PDF 占满窗口 | ✅ |
| 可拖拽的阅读 / 笔记分栏 | ✅ |
| AI 摘要（DeepSeek，可在界面里配置 Key） | ✅ |
| 数据库迁移 + 自动备份 | ✅ |
| PDF 高亮标注 | 🚧 计划中 |
| 笔记双向链接 | 🚧 计划中 |
| PDF 正文检索 | 🚧 计划中 |

## 快速开始

需要 **Node.js ≥ 22.5**（推荐 24，`node:sqlite` 已稳定）。

```bash
git clone https://github.com/<you>/xisheng-xuanzhai.git
cd xisheng-xuanzhai
node scripts/import-zotero.js "C:\Users\你\Zotero"   # 从 Zotero 导入，只需一次
node src/server.js                                   # 启动
```

打开 <http://127.0.0.1:5178>。

Windows 用户也可以直接双击 `start.bat`（首次运行会自动导入）。

没有 Zotero？直接 `node src/server.js` 起一个空库也能看界面。

## 配置 AI

两种方式，任选其一：

1. **界面**：右上角 ⚙ → 填入 DeepSeek API Key → 测试连接 → 保存
2. **环境变量**（优先级更高）：

```bash
DEEPSEEK_API_KEY=sk-xxx
```

Key 只保存在本机 `data/app.db`，不会上传任何地方。AI 摘要只用标题+摘要，单篇成本约 ¥0.0007。

## 快捷键

| 键 | 作用 |
|---|---|
| `Ctrl/Cmd + K` | 聚焦搜索框 |
| `Esc` | 关闭弹窗 / 退出专注模式 |

## 目录结构

```
xisheng-xuanzhai/
├─ src/
│  ├─ server.js           进程入口（含每日备份调度）
│  ├─ app.js              路由表（无框架，node:http）
│  ├─ db/
│  │  ├─ index.js         连接 + 执行迁移
│  │  ├─ migrate.js       迁移执行器（按序、事务、失败回滚）
│  │  ├─ backup.js        VACUUM INTO 快照 + 轮转清理
│  │  └─ migrations/      001_init.sql, 002_xxx.sql …
│  ├─ routes/             papers / notes / tree / settings / ai / meta
│  ├─ services/           llm / settings
│  └─ util/http.js        JSON、静态文件、Range 流
├─ scripts/
│  ├─ import-zotero.js    导入器
│  ├─ backup.js           手动备份
│  ├─ check-dom.js        前端 id / import 一致性
│  └─ verify.js           端到端自检
├─ public/                原生 JS，无构建步骤
│  ├─ index.html
│  ├─ style.css
│  ├─ favicon.svg
│  └─ js/{api,ui,app}.js
└─ data/                  app.db + storage/ + backups/（已 gitignore）
```

## 数据、备份与升级

所有数据都在 `data/`：一个 SQLite 文件、一堆按 sha256 命名的 PDF、若干备份。

**自动备份**：服务每天凌晨 3 点做一次 `VACUUM INTO` 快照，存到 `data/backups/`，保留最近 10 份。
手动备份：`npm run backup`。

> 不要直接复制 `app.db`。WAL 模式下会丢最近的写入，必须走 `VACUUM INTO`。

**升级**：直接 `git pull` 后重启，`src/db/migrations/` 里未执行的脚本会自动跑。执行前自动留一份 `pre-migrate` 备份；某一步失败会整体回滚并提示备份路径。

**给贡献者的迁移纪律**：

1. 已发布的迁移脚本永不修改，结构变更一律新增 `002_xxx.sql`
2. 迁移必须能在已有数据上安全执行（加列给默认值，不要删列）
3. 提交前用一份老数据库测一遍

## 一些设计取舍

- **零依赖**：没有构建、没有 `node_modules`、没有框架。代价是手写路由和 DOM 操作，收益是十年后还能跑起来。
- **不做向量库**：`deepseek-flash` 有 1M 上下文，一篇论文可以整篇塞进去问答，比 RAG 更准也更便宜。
- **知识树是树不是 DAG**：0.x 用单父节点，多父（DAG）等真正需要时再改。
- **PDF 用浏览器内置阅读器**：先验证"你会不会天天用它"，再决定要不要上 pdf.js 那套标注系统。
- **只监听 127.0.0.1**：不给手机用，就不用做登录、同步和 2FA。

## 路线图

- [ ] M3 pdf.js + 高亮标注（三层锚点：quote / 坐标 / 顺序）
- [ ] M3 笔记块级双向链接
- [ ] M4 知识树 DAG（一稿多父）
- [ ] M5 PDF 全文检索（FTS5）
- [ ] 批量导入 DOI / arXiv 链接
- [ ] 阅读统计

## 贡献

欢迎 issue 和 PR。提交前请跑一遍：

```bash
node scripts/check-dom.js   # 前端 id / import 一致性
node scripts/verify.js      # 接口端到端（需先启动服务）
```

## 许可

[MIT](LICENSE)
