'use strict';
/**
 * 把 docs/安装指南.md 转成可以双击打开的离线 HTML（零依赖）。
 *   node scripts/build-guide.js
 * 只支持文档里实际用到的那部分 Markdown：标题、段落、列表、表格、代码块、引用、分隔线、行内代码/粗体/链接。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'docs', '安装指南.md');
const OUT = path.join(ROOT, 'docs', '安装指南.html');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function inline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return s;
}

function convert(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 表格
    if (/^\|/.test(line) && /^\|[\s:|-]+\|?$/.test(lines[i + 1] || '')) {
      const head = line.split('|').slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      out.push(
        `<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${
          rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')
        }</tbody></table>`,
      );
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // 分隔线
    if (/^---+\s*$/.test(line)) {
      out.push('<hr />');
      i++;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // 列表
    if (/^\s*-\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && (/^\s*-\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*(?:-\s+|\d+\.\s+)/, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }

    // 空行
    if (!line.trim()) { i++; continue; }

    // 段落（连续非空行合并）
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|>|\||---+\s*$|\s*-\s|\s*\d+\.\s)/.test(lines[i])) {
      buf.push(lines[i++]);
    }
    if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`);
    else i++;
  }

  return out.join('\n');
}

const STYLE = `
:root { --ink:#1c1c1e; --muted:#6b7280; --line:#e5e7eb; --accent:#0f7a5a; --soft:#e6f4ee; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 48px 20px 96px;
  font: 15px/1.75 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  color: var(--ink); background: #fbfbfc;
}
main { max-width: 780px; margin: 0 auto; background: #fff; padding: 48px 56px;
  border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 10px 30px -20px rgba(0,0,0,.35); }
h1 { font-size: 26px; margin: 0 0 8px; letter-spacing: .5px; }
h2 { font-size: 19px; margin: 40px 0 12px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--accent); }
h3 { font-size: 16px; margin: 26px 0 8px; }
p { margin: 10px 0; }
a { color: var(--accent); text-decoration: none; border-bottom: 1px solid var(--soft); }
a:hover { border-bottom-color: var(--accent); }
code { background: #f3f5f4; padding: 2px 6px; border-radius: 4px; font-size: 13px;
  font-family: "Cascadia Code", Consolas, monospace; }
pre { background: #1f2421; color: #e6ebe8; padding: 16px 18px; border-radius: 10px; overflow-x: auto; }
pre code { background: transparent; padding: 0; color: inherit; font-size: 13px; line-height: 1.7; }
blockquote { margin: 14px 0; padding: 10px 16px; background: var(--soft); border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0; }
blockquote p { margin: 0; }
ul, ol { margin: 10px 0; padding-left: 26px; }
li { margin: 5px 0; }
table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
th, td { border: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }
th { background: #f6f8f7; font-weight: 600; }
hr { border: 0; border-top: 1px solid var(--line); margin: 36px 0; }
@media print {
  body { background: #fff; padding: 0; }
  main { border: 0; box-shadow: none; padding: 0; max-width: none; }
  h2 { break-after: avoid; }
  pre, table, blockquote { break-inside: avoid; }
}
`;

const md = fs.readFileSync(SRC, 'utf8');
const titleMatch = md.match(/^#\s+(.+)$/m);
const title = titleMatch ? titleMatch[1] : '安装指南';

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${convert(md)}
</main>
</body>
</html>
`;

// 两个位置各放一份：根目录方便解压后第一眼看到，docs/ 方便在 GitHub 上浏览
const TARGETS = [path.join(ROOT, '安装指南.html'), path.join(ROOT, 'docs', '安装指南.html')];

for (const out of TARGETS) {
  fs.writeFileSync(out, html, 'utf8');
  console.log(`已生成 ${path.relative(ROOT, out)}（${(Buffer.byteLength(html) / 1024).toFixed(1)} KB）`);
}
