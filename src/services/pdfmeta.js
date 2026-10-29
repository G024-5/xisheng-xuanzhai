'use strict';
/**
 * 零依赖的 PDF 元数据提取。
 *
 * 提取顺序（可靠性从高到低）：
 *   1. 文件名 / 首页文本里出现的 arXiv 号、DOI —— 命中了就去查权威 API
 *   2. PDF 的 Info 字典 / XMP（/Title /Author）
 *   3. 首页文本：按字号挑最大的几行当标题，下面几行当作者
 *
 * 只依赖 Node 内置 zlib。提取是启发式的，**永远只作为预填建议**，用户可以改。
 */
const zlib = require('node:zlib');

/* ---------------- 解码 ---------------- */

function swapUtf16(bytes) {
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  return s;
}

function decodePdfString(raw) {
  if (!raw) return '';
  if (raw[0] === '<') {
    const hex = raw.slice(1, -1).replace(/[^0-9A-Fa-f]/g, '');
    const bytes = Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex');
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return swapUtf16(bytes.subarray(2));
    return bytes.toString('latin1');
  }
  const body = raw.slice(1, -1);
  return body.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (m, g) => {
    if (/^[0-7]+$/.test(g)) return String.fromCharCode(parseInt(g, 8));
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[g] ?? g;
  });
}

const ENTITY = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const unescapeXml = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITY[m] || m);

const cleanText = (s) => String(s || '')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * 有些 PDF 用自定义编码的字体（常见于旧 Type1），抽出来的文本是乱码。
 * 这种宁可回退到文件名，也不要给用户一个鬼画符标题。
 */
function looksGarbled(text) {
  const s = String(text || '');
  if (!s) return true;
  if (!/[A-Za-z]{3,}/.test(s)) return true;
  const good = (s.match(/[A-Za-z0-9 .,;:'"()\[\]\-–—&/%]/g) || []).length;
  return good / s.length < 0.82;
}

/* ---------------- Info / XMP ---------------- */

function infoField(src, key) {
  const re = new RegExp(`/${key}\\s*(\\((?:\\\\.|[^\\\\()])*\\)|<[0-9A-Fa-f\\s]*>)`);
  const m = src.match(re);
  return m ? cleanText(decodePdfString(m[1])) : '';
}

function xmpField(src, tag) {
  const re = new RegExp(`<dc:${tag}>[\\s\\S]*?<rdf:li[^>]*>([\\s\\S]*?)</rdf:li>`, 'i');
  const m = src.match(re);
  return m ? cleanText(unescapeXml(m[1])) : '';
}

/** 生成器写的占位符，不是真标题 */
function looksLikeJunk(title) {
  if (!title || title.length < 6) return true;
  if (/^(untitled|无标题|document\d*|paper\d*)$/i.test(title)) return true;
  if (/^(microsoft\s+word|powerpoint|latex|acrobat|pdfcreator|writer|google docs)\b/i.test(title)) return true;
  if (/\.(docx?|tex|dvi|indd|qxd|pdf)$/i.test(title)) return true;
  if (/^[A-Za-z]:\\|^\//.test(title)) return true;
  if (title.split(/\s+/).length < 2 && title.length < 20) return true;
  return false;
}

/* ---------------- 内容流 ---------------- */

function inflateStreams(buf) {
  const s = buf.toString('latin1');
  const out = [];
  let idx = 0;

  while (true) {
    idx = s.indexOf('stream', idx);
    if (idx === -1) break;

    let start = idx + 6;
    if (s[start] === '\r') start++;
    if (s[start] === '\n') start++;

    const end = s.indexOf('endstream', start);
    if (end === -1) break;

    const chunk = buf.subarray(start, end);
    for (const slice of [chunk, chunk.subarray(0, Math.max(0, chunk.length - 1))]) {
      try {
        out.push(zlib.inflateSync(slice).toString('latin1'));
        break;
      } catch { /* 非 Flate 流 */ }
    }
    idx = end + 9;
  }
  return out;
}

/** 手写扫描器：不用正则，畸形 PDF 不会触发灾难性回溯 */
function parseRuns(content) {
  const runs = [];
  let size = 10;
  let x = 0;
  let y = 0;
  let operands = [];
  let strings = [];
  let inArray = false;

  const n = content.length;
  let i = 0;

  const isWs = (c) => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0';
  const isDelim = (c) => '()<>[]{}/%'.includes(c);

  const emit = () => {
    if (strings.length) runs.push({ text: strings.join(''), size, x, y });
    strings = [];
  };

  while (i < n) {
    const c = content[i];

    if (isWs(c)) { i++; continue; }

    if (c === '%') {
      while (i < n && content[i] !== '\n') i++;
      continue;
    }

    if (c === '(') {
      let depth = 1;
      let j = i + 1;
      let buf = '';
      while (j < n && depth > 0) {
        const ch = content[j];
        if (ch === '\\') { buf += content.slice(j, j + 2); j += 2; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (!depth) break; }
        buf += ch;
        j++;
      }
      strings.push(decodePdfString(`(${buf})`));
      i = j + 1;
      continue;
    }

    if (c === '<' && content[i + 1] !== '<') {
      const j = content.indexOf('>', i);
      if (j === -1) break;
      strings.push(decodePdfString(content.slice(i, j + 1)));
      i = j + 1;
      continue;
    }

    if (c === '[') { inArray = true; i++; continue; }
    if (c === ']') { inArray = false; i++; continue; }

    if (c === '/' ) {
      let j = i + 1;
      while (j < n && !isWs(content[j]) && !isDelim(content[j])) j++;
      operands.push(content.slice(i, j));
      i = j;
      continue;
    }

    if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) {
      let j = i + 1;
      while (j < n && /[0-9.]/.test(content[j])) j++;
      const num = Number(content.slice(i, j));
      // TJ 数组里的负数位移通常代表词间空格（千分之一 em）
      if (inArray && num <= -100 && strings.length) strings.push(' ');
      operands.push(num);
      i = j;
      continue;
    }

    if (/[A-Za-z*'"]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z*'"]/.test(content[j])) j++;
      const op = content.slice(i, j);

      switch (op) {
        case 'Tf':
          size = Number(operands[operands.length - 1]) || size;
          break;
        case 'Td':
        case 'TD':
          y += Number(operands[operands.length - 1]) || 0;
          x += Number(operands[operands.length - 2]) || 0;
          break;
        case 'Tm': {
          const f = Number(operands[operands.length - 1]);
          const e = Number(operands[operands.length - 2]);
          if (Number.isFinite(f)) y = f;
          if (Number.isFinite(e)) x = e;
          break;
        }
        case 'T*':
          y -= size * 1.2;
          break;
        case 'Tj':
        case 'TJ':
        case "'":
        case '"':
          emit();
          break;
        default:
          break;
      }

      operands = [];
      i = j;
      continue;
    }

    i++;
  }

  return runs;
}

/** 粗略字形宽度：宽字符、窄字符分开估，比统一 0.5 准得多 */
function charWidth(ch, size) {
  if ("ilj.,;:|!'`".includes(ch)) return size * 0.28;
  if ('mwMW@%'.includes(ch)) return size * 0.84;
  if (ch >= 'A' && ch <= 'Z') return size * 0.66;
  if (ch === ' ') return size * 0.3;
  return size * 0.51;
}

/** 同一行的 run 拼起来：按 x 间距决定要不要补空格 */
function joinParts(parts) {
  const sorted = parts.filter((p) => p.text).sort((a, b) => a.x - b.x);
  let out = '';
  let prevEnd = null;
  let prevSize = 10;

  for (const p of sorted) {
    if (prevEnd !== null) {
      const gap = p.x - prevEnd;
      if (gap > Math.max(1.2, prevSize * 0.2) && !/\s$/.test(out) && !/^[,.;:)\]}%!?]/.test(p.text)) {
        out += ' ';
      }
    }
    out += p.text;
    prevEnd = p.x + [...p.text].reduce((w, ch) => w + charWidth(ch, p.size), 0);
    prevSize = p.size;
  }

  return cleanText(out);
}

function toLines(runs) {
  const usable = runs.filter((r) => r.text && r.text.trim() && r.size >= 3);
  if (!usable.length) return [];

  const sorted = [...usable].sort((a, b) => b.y - a.y);
  const lines = [];

  for (const run of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - run.y) <= Math.max(2, run.size * 0.5)) {
      last.parts.push(run);
      last.size = Math.max(last.size, run.size);
    } else {
      lines.push({ y: run.y, size: run.size, parts: [run] });
    }
  }

  return lines
    .map((l) => ({ y: l.y, size: l.size, text: joinParts(l.parts) }))
    .filter((l) => l.text.length > 1);
}

/* ---------------- 选标题页 ---------------- */

function pickTitlePage(pages) {
  // 有些 PDF 会把 arXiv 水印之类的东西单独放在一个很小的流里，行数太少的不算正文页
  const candidates = pages.filter((l) => l.length >= 5);
  const pool = candidates.length ? candidates : pages;

  let best = null;
  let bestScore = 0;

  for (const lines of pool) {
    if (!lines.length) continue;
    const headline = lines.filter((l) => l.text.length >= 12);
    if (!headline.length) continue;
    const score = Math.max(...headline.map((l) => l.size));
    if (score > bestScore) {
      bestScore = score;
      best = lines;
    }
  }
  return best;
}

const AUTHOR_HINT = /(,|;|\band\b|&|@|\buniversity\b|\binstitute\b|\bcollege\b|\bdepartment\b|\blab\b)/i;

function guessTitleAndAuthors(lines) {
  if (!lines || !lines.length) return { title: '', authors: [] };

  const sizes = lines.map((l) => l.size).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 10;

  const candidates = lines
    .map((l, i) => ({ ...l, i }))
    .filter((l) => l.size >= Math.max(median * 1.3, 11) && l.text.length >= 8)
    .filter((l) => !/^[\d\s.,:;%-]+$/.test(l.text))
    .slice(0, 8);

  if (!candidates.length) return { title: '', authors: [] };

  const top = candidates.reduce((a, b) => (b.size > a.size ? b : a));
  const parts = [top.text];
  let lastIdx = top.i;

  for (const l of lines.slice(top.i + 1, top.i + 3)) {
    if (Math.abs(l.size - top.size) <= 0.8 && l.text.length > 1) {
      parts.push(l.text);
      lastIdx += 1;
    } else break;
  }

  const title = cleanText(parts.join(' '));

  const authorLines = [];
  for (const l of lines.slice(lastIdx + 1, lastIdx + 6)) {
    if (l.size > top.size * 0.95) continue;
    if (l.text.length < 3) continue;
    if (/^(abstract|摘要|keywords|关键词|introduction|1\s+introduction)\b/i.test(l.text)) break;
    if (/@/.test(l.text)) continue;
    if (/\b(university|institute|college|department|laborator|school of|inc\.|ltd)\b/i.test(l.text)) continue;
    if (!/[A-Za-z]{2,}[\s,]+[A-Za-z]{2,}/.test(l.text)) continue;
    authorLines.push(l.text);
    if (authorLines.length >= 2) break;
  }

  return { title, authors: splitAuthorNames(authorLines) };
}

/** 从"Yukyung Lee1, Soonwon Ka 2, ..."这类行里抠出人名（数字通常是单位上标，正好当分隔符） */
function splitAuthorNames(lines) {
  if (!lines.length) return [];

  const segments = lines
    .join(' , ')
    .split(/\d+|[;,]|\band\b/)
    .map((s) => cleanText(s))
    .filter((s) => s.length >= 3);

  const names = [];
  for (const seg of segments) {
    const m = seg.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/);
    if (m) names.push(m[1]);
  }

  const unique = [...new Set(names)].filter((n) => n.split(' ').length <= 3);
  if (unique.length) return unique.slice(0, 20);
  return lines.map(cleanText);
}

/* ---------------- 标识符 ---------------- */

/**
 * 只认 arXiv 的水印戳（形如 `arXiv:2408.07055v1 [cs.CL] 13 Aug 2024`）。
 * 正文和参考文献里到处是别人的 arXiv 号，宽松匹配等于随机抓一个。
 */
const ARXIV_STAMP = /^arxiv[:\s]*(\d{4}\.\d{4,5})(?:v\d+)?\s*\[[a-z.-]+\]\s*\d{1,2}\s+[a-z]{3}\s+\d{4}/i;

function findIdentifiers(lines) {
  const doiHits = [];

  for (const raw of lines) {
    const line = cleanText(raw);
    if (!line) continue;

    if (line.length < 90) {
      const stamp = line.match(ARXIV_STAMP);
      if (stamp) return { arxivId: stamp[1], doi: null };
    }

    if (line.length < 120) {
      const d = line.match(/^(?:doi[:\s]*|https?:\/\/doi\.org\/)\s*(10\.\d{4,9}\/\S+)/i);
      if (d) doiHits.push({ id: d[1].replace(/[.,;)\]]+$/, ''), len: line.length });
    }
  }

  doiHits.sort((a, b) => a.len - b.len);
  return { arxivId: null, doi: doiHits.length ? doiHits[0].id : null };
}

/* ---------------- 对外 ---------------- */

function isLikelyContentStream(s) {
  if (!s.includes('BT') || (!s.includes('Tj') && !s.includes('TJ'))) return false;
  let printable = 0;
  const sample = Math.min(s.length, 4000);
  if (!sample) return false;
  for (let i = 0; i < sample; i++) {
    const c = s.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable++;
  }
  return printable / sample > 0.75;
}

function contentStreams(buffer, limit = 60) {
  return inflateStreams(buffer)
    .filter(isLikelyContentStream)
    .slice(0, limit)
    .map((s) => (s.length > 2_000_000 ? s.slice(0, 2_000_000) : s));
}

function extractPdfMeta(buffer) {
  const src = buffer.toString('latin1');

  const pages = contentStreams(buffer).map((s) => {
    try { return toLines(parseRuns(s)); } catch { return []; }
  });

  const titlePage = pickTitlePage(pages) || [];
  const guess = guessTitleAndAuthors(titlePage);

  const pageText = titlePage.map((l) => l.text).join('\n');
  // 标识符要在所有页里找：arXiv 水印常常单独占一个流，但不做宽松匹配（见 findIdentifiers）
  const allLines = pages.flatMap((p) => p.map((l) => l.text));
  const ids = findIdentifiers(allLines);

  return {
    infoTitle: looksLikeJunk(infoField(src, 'Title')) ? '' : infoField(src, 'Title'),
    infoAuthor: looksLikeJunk(infoField(src, 'Author')) ? '' : infoField(src, 'Author'),
    xmpTitle: looksLikeJunk(xmpField(src, 'title')) ? '' : xmpField(src, 'title'),
    xmpAuthor: xmpField(src, 'creator'),
    guessTitle: guess.title,
    guessAuthors: guess.authors,
    pageText,
    identifiers: ids,
    pageCount: pages.filter((p) => p.length).length,
  };
}

/**
 * 抽取全文（用于摘要 / 后续全文检索）。
 * 顺序按内容流在文件里的出现顺序，对双栏排版会左右交错——给模型读够了。
 */
function extractFullText(buffer, { maxStreams = 200, maxChars = 120000 } = {}) {
  const pages = contentStreams(buffer, maxStreams).map((s) => {
    try { return toLines(parseRuns(s)); } catch { return []; }
  });

  const seen = new Set();
  const lines = [];
  let chars = 0;

  for (const page of pages) {
    if (page.length < 3) continue; // 水印、单行封面之类
    for (const line of page) {
      const t = line.text;
      if (t.length < 2) continue;
      const key = t.slice(0, 80); // 页眉页脚重复行
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(t);
      chars += t.length + 1;
      if (chars >= maxChars) break;
    }
    if (chars >= maxChars) break;
  }

  const text = lines.join('\n');
  return { text, chars: text.length, pages: pages.filter((p) => p.length >= 3).length };
}

module.exports = {
  extractPdfMeta,
  extractFullText,
  findIdentifiers,
  looksLikeJunk,
  looksGarbled,
  cleanText,
};
