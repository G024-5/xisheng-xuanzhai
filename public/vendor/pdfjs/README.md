# pdf.js（第三方）

本目录是 [Mozilla pdf.js](https://github.com/mozilla/pdf.js) 的构建产物，原样分发，未做修改。

- 版本：**4.10.38**
- 来源：`https://unpkg.com/pdfjs-dist@4.10.38/build/`
- 许可：Apache License 2.0（见同目录 `LICENSE`）

为什么直接放进仓库，而不是让用户 `npm install`：

这个项目的卖点是**零依赖、克隆下来就能跑**。为了一个阅读器引入 `node_modules` 和构建步骤，代价远大于 1.7MB 的静态文件。

未包含（按需可自行补充）：

- `cmaps/`：部分中日韩 PDF 需要预定义 CMap 才能正确取字
- `standard_fonts/`：未内嵌字体的 PDF 会退回到系统字体
