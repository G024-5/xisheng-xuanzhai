# 溪声轩斋

> 一个跑在自己电脑上的文献管理与精读工具。**零依赖**——不需要 `npm install`，有 Node 就能开始；
> 不想装 Node 也行，直接双击桌面版安装包。

**当前版本：v0.6.0-beta.1（内测 · 首个桌面版）** ｜ Papers in, knowledge out.

「溪声」取流水不腐之意——文献要常读常新，知识要流动起来。

> ⚠️ **内测版说明**：功能已闭环，但数据库结构、接口、界面仍可能变。升级前请先备份 `data/`。

---

## 界面

```
┌───────────────────────────────────────────────────────────────────┐
│ 溪声轩斋   侧栏|列表|信息    搜索…              拼图      设置     │
├─────────┬───────────────┬─────────────────────────────────────────┤
│ 分类     │ 文献列表        │ 标题 / 作者 / 标签                      │
│ 知识树   │ 最近导入 ▾      │ [未读|在读|已读]  AI 摘要   挂到知识树  │
│          │               ├──────────────────────────┬──────────────┤
│          │               │  PDF（pdf.js，可划词）    │ 笔记 / 标注   │
└─────────┴───────────────┴──────────────────────────┴──────────────┘
```

左侧栏、文献列表、文献信息栏三块可以**分别收起**，阅读区随之自动放大。

## 这是什么

Zotero 适合**收集**文献，但不适合**组织**知识；Obsidian 适合**写**笔记，但不懂文献。
溪声轩斋把这两件事放进一个界面：分类与知识树在左，文献列表在中，PDF 与笔记在右。

另有一个独立功能——**文献拼图**：读完几篇之后，把每篇写成一张卡（问题 / 方案 / 局限），
在自由画布上摆位置、分颜色、连成支链。它不自动排版，布局本身就是你的表达。

## 功能

**入库**

- 拖入 PDF 直接入库：自动算 sha256 去重、从正文识别标题与作者（实测 91% 命中）
- 粘贴 DOI / arXiv 号抓元数据，arXiv 顺带下载 PDF
- 从 Zotero 批量导入（只读，绝不改动你的库）；Zotero 不是必需的

**组织**

- 多层级分类 + 标签；六种排序；未读 / 在读 / 已读筛选
- 全文搜索：标题 / 摘要 / 作者 / 标签 / 笔记
- 知识树：无限层级，一篇文献可挂多个节点
- **文献拼图**：自由画布、卡片三段式、六色、支链、连线、多张拼图并存

**阅读**

- 内置 pdf.js 阅读器：连续滚动、按容器宽度自动缩放、高清屏适配
- 划词高亮（四色）、引用到笔记；标注列表可跳转、可删除
- 划词**翻译**：选中一句 → 译；点下方译文可换语言（中 / 英 / 日 / 原文）
- **PDF 内查找**（Ctrl+F）：全文匹配、上下条跳转、页码指示
- **阅读进度记忆**：关掉再打开回到上次那一页，顶栏给「继续读」提示
- **夜间模式**：一键切换，记住选择，跟随系统也行
- 每篇一个笔记面板，自动保存

**引文**

- 一键生成 **BibTeX** / **GB/T 7714-2015** / **RIS**，复制即可粘进 LaTeX 或 Word
- 支持单篇（含「复制引文」按钮）与多篇（列表右键 / 勾选批量）

**AI（可选，任何 OpenAI 兼容服务）**

- 读**全文**生成四段摘要：背景 / 方法 / 结论 / 局限
- 局限只写作者原文提到的，没有就写「正文未提及」——不替作者编造
- 模型名、接口地址、Key 都在设置里填；预设 DeepSeek / 硅基流动 / Ollama / LM Studio
- **免费路线**：本机 Ollama 跑 Qwen2.5，或硅基流动的免费额度，都不花钱
- 网络抖动自动重试；分块翻译结果写库缓存，同一句不重复花钱

**工程**

- 零 npm 依赖：pdf.js 与 SQLite 驱动都内置或随仓库分发
- 数据库迁移：按序执行、失败回滚、迁移前自动快照
- 每日自动备份，保留最近 10 份
- 单文件 SQLite，备份 = 拷一个目录

## 你需要准备什么

| 你需要 | 必需？ | 说明 |
|---|---|---|
| Node.js ≥ 22.5 | **必需** | 唯一的运行时依赖，不需要 `npm install` |
| 文献 PDF | **必需** | 自己上传，或用 DOI / arXiv 号让程序去抓 |
| Zotero | 可选 | 有一整个库想搬过来时才用 |
| DeepSeek API Key | 可选 | 不配置只是没有 AI 摘要 |

仓库里**没有**：任何文献 / PDF / 笔记（`data/` 全在 `.gitignore` 里）、任何 API Key。

## 两种用法

**A. 桌面版**（不想碰命令行选这个）— Windows 10/11 x64

| 文件 | 说明 | 大小 |
|---|---|---|
| `XishengXuanzhai-0.6.0-win64.zip` | **推荐**：解压后双击 `溪声轩斋.exe`，不走安装器 | ~151 MB |
| `XishengXuanzhai-Setup-0.6.0.exe` | 安装到本机，开始菜单 / 桌面快捷方式 | ~116 MB |
| `XishengXuanzhai-Portable-0.6.0.exe` | 免安装单文件，每次启动自解压 | ~106 MB |

- 不需要装 Node，也不占一个浏览器标签页；关窗口就是退出
- 数据在 `%APPDATA%\Xisheng\data`（可从窗口标题栏的 ⚙ 看到实际路径）
- 首次运行 Windows 可能弹「已保护你的电脑」→ **更多信息 → 仍要运行**。安装包没做代码签名
- 安装器若报 `Error writing temporary file`：中文用户名下 NSIS 建临时目录会失败，**换 zip 版**

**B. 源码版**（想改代码、或不是 Windows 选这个）—— 见下面的「从源码运行」。

## 快速开始

> 完全没配过环境？看 **[安装与使用指南（图文版）](docs/安装指南.md)** ／ 下载后可直接双击 `docs/安装指南.html`。
> 从装 Node.js 到第一篇文献，一步步来，10 分钟。

```bash
git clone https://github.com/<you>/xisheng-xuanzhai.git
cd xisheng-xuanzhai
node src/server.js        # 打开 http://127.0.0.1:5178
```

Windows 用户直接双击 `start.bat`。

首次启动会在 `data/` 下建库、跑迁移；之后点左上角「＋」添加第一篇文献。

> ⚠️ **`start.bat` 打开的命令行窗口不要关**——它就是服务本身，关掉网页就断了。

### 打开网页显示「无法访问」

按顺序检查：

1. **窗口里有没有红字报错**——`start.bat` 现在出错不会立刻关窗，会停在原地让你看
2. **端口被占用**：报 `EADDRINUSE` 说明已经开着一个实例，直接访问 <http://127.0.0.1:5178> 即可；
   要换端口：`set PORT=5179 && node src/server.js`
3. **Node 版本太低**：`node -v` 必须是 22.5 以上（`node:sqlite` 需要）
4. **在压缩包里直接双击**：请先解压到本地目录，不要在 ZIP 预览窗口里运行 `start.bat`

还是不行就双击 **`doctor.bat`**，它会把环境、文件完整性、数据库、端口状态列出来，把输出整段贴出来即可定位。

**已有 Zotero 库？** 一次性搬过来（只读）：

```bash
node scripts/import-zotero.js "C:\Users\<你>\Zotero"
```

## 配置 AI（可选）

右上角 ⚙ → 选一个预设（或自己填地址与模型）→ 填 Key → 测试连接 → 保存。

| 路线 | 接口地址 | 模型 | 花钱吗 |
|---|---|---|---|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-flash` | 约 ¥0.017/篇 |
| 硅基流动 | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | 有免费额度 |
| 本机 Ollama | `http://127.0.0.1:11434/v1` | `xisheng-qwen:7b` | 免费，一篇 10–25 秒 |
| LM Studio | `http://127.0.0.1:1234/v1` | 看你加载了什么 | 免费 |

本机服务（127.0.0.1 / localhost）不需要填 Key。

用 Ollama 的话多做一步：它的默认上下文只有 4k，长篇论文会被截断到中段、模型开始瞎编。
执行 `ollama create xisheng-qwen:7b -f scripts/ollama/Modelfile` 把上下文抬到 16k 再用
（细节见 [安装指南](docs/安装指南.md) 第六节）。

Key 只存在本机 `data/app.db`，除发往你配置的 API 地址外不会发往任何地方。
云端摘要一次约 1.6 万 tokens（全文），成本约 ¥0.017/篇；本机模型只读正文前 8000 字，
设 `XISHENG_AI_MAXCHARS` 可放宽。

## 数据与备份

所有数据都在 `data/`：`app.db`、按 sha256 命名的 PDF、`backups/` 快照。
（桌面版的数据目录在 `%APPDATA%\Xisheng\data`，内容完全一样；想搬就整个目录拷过去。）

- 自动备份：每天 03:00 一次，保留 10 份
- 手动备份：`npm run backup`
- 整机迁移：复制整个 `data/` 即可，路径全部相对

> 不要直接复制 `app.db`。WAL 模式下会丢最近事务，必须走 `VACUUM INTO`（备份脚本已处理）。

## 目录结构

```
xisheng-xuanzhai/
├─ electron/
│  └─ main.js             桌面外壳：拉起本地服务 + 开窗口（开发时 electron .）
├─ src/
│  ├─ server.js           进程入口（含每日备份调度）
│  ├─ app.js              路由表（node:http，无框架）
│  ├─ db/                 连接、迁移器、备份、migrations/*.sql
│  ├─ routes/             papers / notes / tree / board / annotations / settings / ai / meta
│  ├─ services/           llm / pdfmeta / pdftext / ingest / metadata / settings
│  └─ util/               http（Range 流）/ upload（流式落盘）/ port（端口探测）
├─ scripts/               导入器、备份、自检（doctor.js）、就绪探测、图标、文档生成
├─ build/                 icon.png / icon.ico（脚本生成，进版本库）
├─ docs/                  安装与使用指南（.md 源 + 可双击的 .html）
├─ public/                原生 JS，无构建步骤
│  ├─ js/{api,ui,app,reader,board}.js
│  └─ vendor/pdfjs/       pdf.js 4.10.38（Apache-2.0，原样分发）
├─ start.bat              启动（先自检，再等服务就绪后开浏览器）
├─ doctor.bat             打不开时先跑这个
└─ data/                  app.db + storage/ + backups/（gitignore）
```

## 一些设计取舍

- **零依赖**：没有构建、没有 `node_modules`。代价是手写路由和 DOM，收益是十年后还能跑。
- **不做向量库**：`deepseek-flash` 有 1M 上下文，一篇论文整篇塞进去问答，比 RAG 更准也更便宜。
- **拼图不自动排版**：位置由人决定。自动布局会把你摆好的对比关系冲掉。
- **AI 不写笔记**：只读、只总结，卡片内容永远是人填的。
- **只监听 127.0.0.1**：本地工具，没有登录与权限，**不要直接暴露到公网**。

## 已知限制

- 扫描件 / 字体编码异常的 PDF 抽不出正文，AI 摘要会自动退回「只读摘要」，界面会标注
- 中文 PDF 的正文抽取尚不可靠（字体映射问题）
- 知识树是单父层级；拼图里同一篇文献在多个支链下会各显示一次
- 没有回收站，删除即消失

## 路线图

- [x] Windows 桌面版（安装包 + 免安装版），不用装 Node
- [x] 划词翻译、PDF 内查找、阅读进度记忆、夜间模式
- [x] BibTeX / GB/T 7714 引文导出，模型可自选（含免费路线）
- [ ] 面板宽度可拖拽并记忆
- [ ] PDF 正文全文检索（`paper_text` 已缓存全文，接 FTS5 即可）
- [ ] 拼图导出为图片 / Markdown
- [ ] 卡片反向跳转到原文
- [ ] 安装包代码签名（免去「已保护你的电脑」提示）

## 自己打包桌面版

需要 Node ≥ 22.5，首次会装开发依赖（Electron 本体约 240 MB，只在打包机上下载，不进仓库）。

```bash
npm install                     # 只装 electron + electron-builder，运行时不依赖它们

npm run app                     # 开发模式：开一个桌面窗口，跳过浏览器
npm run dist                    # 出安装包与免安装版到 release/
npm run dist:dir                # 只出解包目录，调试用，快得多
npm run icon                    # 重新生成 build/icon.png 与 build/icon.ico（纯 Node 画）
node scripts/verify-electron.js # 无头验证桌面外壳：拉服务、开窗口、健康检查
```

国内网络下 `electron` 与 NSIS 的下载容易卡住，打包前设两个镜像：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
```

> 桌面版和源码版共用同一份 `src/` 与 `public/`，界面代码零改动——窗口只是把
> `http://127.0.0.1:<port>` 装进一个浏览器壳里。端口 5178 被占时会自动往后找空位。

## 贡献

欢迎 issue 和 PR。提交前请跑一遍：

```bash
node scripts/check-dom.js       # 前端 id / import 一致性（不需要服务）
node scripts/verify.js          # 接口端到端（先启动服务；对着当前库跑，库里要有文献）
node scripts/verify-electron.js # 桌面外壳（不需要图形界面）
```

改了 `docs/安装指南.md` 之后，跑 `node scripts/build-guide.js` 重新生成 HTML（根目录与 `docs/` 各一份，同一份源）。

## 许可

[MIT](LICENSE)。随仓库分发的 pdf.js 为 Apache-2.0，见 `public/vendor/pdfjs/LICENSE`。
