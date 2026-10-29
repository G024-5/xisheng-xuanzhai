# mind-elixir（第三方）

本目录是 [Mind Elixir Core](https://github.com/SSShooter/mind-elixir-core) 的构建产物，原样分发，未做修改。

- 版本：**5.15.1**
- 来源：`npm pack mind-elixir@5.15.1` 的 `dist/`
- 许可：MIT（见同目录 `LICENSE`）

包含：

| 文件 | 用途 |
|---|---|
| `MindElixir.js` | ESM 主包（118KB），含拖拽、双击编辑、撤销、快捷键 |
| `MindElixir.css` | 样式，全部选择器限定在 `.map-container` 下，不会污染宿主页面 |
| `i18n.js` | 多语言文案，本项目用 `zh_CN` |

主题色通过 CSS 变量覆盖（`--main-color` / `--root-bgcolor` 等），见 `public/style.css` 的 `.mind-overlay`。
