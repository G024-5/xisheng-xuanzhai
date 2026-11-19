'use strict';
/**
 * 引文格式化：BibTeX / GB/T 7714-2015 / RIS。
 *
 * 纯函数，不碰数据库也不碰网络：路由层把 papers 行 + 作者数组喂进来，
 * 这里只管拼字符串。三种格式的取舍理由写在 docs/设计说明.md 的「引文」一节。
 */

const CJK = /[\u4e00-\u9fff]/;

/** 内部 item_type → BibTeX 条目类型。没列的按 article 处理，宁可多一个字段也不要报错 */
const BIB_TYPE = {
  article: 'article',
  journalArticle: 'article',
  preprint: 'misc',
  conferencePaper: 'inproceedings',
  thesis: 'phdthesis',
  book: 'book',
  report: 'techreport',
};

/** GB/T 7714 的文献类型标识 */
const GB_TYPE = {
  article: 'J',
  journalArticle: 'J',
  preprint: 'EB/OL',
  conferencePaper: 'C',
  thesis: 'D',
  book: 'M',
  report: 'R',
};

const RIS_TYPE = {
  article: 'JOUR',
  journalArticle: 'JOUR',
  preprint: 'GEN',
  conferencePaper: 'CONF',
  thesis: 'THES',
  book: 'BOOK',
  report: 'RPRT',
};

/* ---------------- 姓名处理 ---------------- */

/** 去重音 + 去掉非 ASCII 字母数字，用于生成 BibTeX key */
function asciiFold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '');
}

/** 姓：有逗号取逗号前，否则取最后一个词；中文名没有空格，整串就是姓 */
function familyName(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  if (s.includes(',')) return s.split(',')[0].trim();
  if (CJK.test(s)) return s;
  const parts = s.split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : s;
}

/** 名：用于 BibTeX 的「姓, 名」写法 */
function givenName(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  if (s.includes(',')) return s.split(',').slice(1).join(',').trim();
  if (CJK.test(s)) return '';
  const parts = s.split(/\s+/);
  return parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
}

/** GB/T 7714 的西文姓名写法：Smith J（姓全称 + 名首字母大写，无点） */
function gbName(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  if (CJK.test(s)) return s;
  const fam = familyName(s);
  const giv = givenName(s)
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('');
  return giv ? `${fam} ${giv}` : fam;
}

/** 三位以上作者按 GB/T 7714 缩略：前三 + 等 / et al. */
function gbAuthors(authors) {
  const list = (authors || []).filter(Boolean);
  if (!list.length) return '佚名';
  const names = list.map(gbName);
  if (names.length <= 3) return names.join(', ');
  const suffix = list.some((n) => CJK.test(n)) ? ', 等' : ', et al.';
  return names.slice(0, 3).join(', ') + suffix;
}

/** BibTeX 的 and 连接写法 */
function bibAuthors(authors) {
  const list = (authors || []).filter(Boolean);
  if (!list.length) return '';
  return list
    .map((n) => {
      if (CJK.test(n)) return n;
      const fam = familyName(n);
      const giv = givenName(n);
      return giv ? `${fam}, ${giv}` : fam;
    })
    .join(' and ');
}

/* ---------------- 引文 key ---------------- */

/**
 * key 只用 ASCII 字母数字：中文作者折叠后为空时退回 anon + 年份，
 * 这样任何文献都能得到一个 Zotero / LaTeX 能接受的 key。
 */
function citeKey(paper) {
  const fam = asciiFold(familyName((paper.authors || [])[0] || '')).toLowerCase();
  const year = paper.year ? String(paper.year) : 'nd';
  const word = (String(paper.title || '').match(/[A-Za-z]{4,}/) || [''])[0].toLowerCase();
  return `${fam || 'anon'}${year}${word}`;
}

/* ---------------- BibTeX ---------------- */

/** LaTeX 特殊字符转义。标题里的 & % _ 不转义会让 bibtex 直接编译失败 */
function texEscape(s) {
  return String(s || '')
    .replace(/[\\]/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

function bibtexEntry(paper) {
  const type = BIB_TYPE[paper.item_type] || 'article';
  const key = citeKey(paper);
  const fields = [];

  const push = (name, value) => {
    if (value === null || value === undefined || value === '') return;
    fields.push(`  ${name} = {${value}}`);
  };

  push('title', texEscape(paper.title));
  push('author', bibAuthors(paper.authors).split(' and ').map(texEscape).join(' and '));
  push('year', paper.year);

  const arxiv = paper.arxiv_id || (String(paper.doi || '').match(/arxiv\.(.+)/i) || [])[1];
  if (arxiv && type === 'misc') {
    push('eprint', arxiv);
    push('archivePrefix', 'arXiv');
  } else if (type === 'inproceedings') {
    push('booktitle', texEscape(paper.venue));
  } else if (type !== 'misc') {
    push('journal', texEscape(paper.venue));
  } else {
    push('howpublished', texEscape(paper.venue));
  }

  push('doi', paper.doi);
  push('url', paper.url);
  push('abstract', texEscape(String(paper.abstract || '').slice(0, 800)));

  return `@${type}{${key},\n${fields.join(',\n')}\n}`;
}

/* ---------------- GB/T 7714-2015 ---------------- */

/**
 * 库里没有卷期页码，所以只能给出「作者. 题名[J]. 刊名, 年.」这一层。
 * 会议用 // 引出会议名，预印本标 EB/OL 并给出 arXiv 号 —— 都是 GB/T 7714 的写法。
 */
function gbEntry(paper) {
  const marker = GB_TYPE[paper.item_type] || 'Z';
  const authors = gbAuthors(paper.authors);
  const title = String(paper.title || '').trim();
  const year = paper.year ? String(paper.year) : '';
  const venue = String(paper.venue || '').trim();
  const arxiv = paper.arxiv_id || (String(paper.doi || '').match(/arxiv\.(.+)/i) || [])[1];

  let text = `${authors}. ${title}[${marker}]`;

  if (marker === 'C') {
    if (venue) text += `//${venue}`;
    if (year) text += `. ${year}`;
  } else if (marker === 'EB/OL') {
    const bits = [arxiv ? `arXiv:${arxiv}` : '', year].filter(Boolean).join(', ');
    if (bits) text += `. ${bits}`;
  } else if (venue) {
    text += `. ${venue}${year ? `, ${year}` : ''}`;
  } else if (year) {
    text += `. ${year}`;
  }

  if (!text.endsWith('.')) text += '.';
  if (paper.doi) text += ` DOI:${paper.doi}.`;
  return text;
}

/* ---------------- RIS ---------------- */

function risEntry(paper) {
  const lines = [`TY  - ${RIS_TYPE[paper.item_type] || 'GEN'}`];
  for (const a of paper.authors || []) lines.push(`AU  - ${a}`);
  lines.push(`TI  - ${paper.title || ''}`);
  if (paper.year) lines.push(`PY  - ${paper.year}`);
  if (paper.venue) lines.push(paper.item_type === 'conferencePaper' ? `T2  - ${paper.venue}` : `JO  - ${paper.venue}`);
  if (paper.doi) lines.push(`DO  - ${paper.doi}`);
  if (paper.url) lines.push(`UR  - ${paper.url}`);
  if (paper.abstract) lines.push(`AB  - ${String(paper.abstract).replace(/\s+/g, ' ')}`);
  lines.push('ER  - ');
  return lines.join('\n');
}

/* ---------------- 对外 ---------------- */

const STYLES = {
  bibtex: { label: 'BibTeX', single: bibtexEntry },
  gb: { label: 'GB/T 7714', single: gbEntry },
  ris: { label: 'RIS', single: risEntry },
};

/** 单篇：返回 { style, label, key, text } */
function formatOne(paper, style = 'bibtex') {
  const s = STYLES[style] || STYLES.bibtex;
  return { style, label: s.label, key: citeKey(paper), text: s.single(paper) };
}

/** 多篇：加编号（BibTeX 不加，按条目自然分隔） */
function formatMany(papers, style = 'bibtex') {
  const s = STYLES[style] || STYLES.bibtex;
  const blocks = papers.map((p) => s.single(p));
  const text = style === 'gb'
    ? blocks.map((t, i) => (papers.length > 1 ? `[${i + 1}] ${t}` : t)).join('\n')
    : blocks.join('\n\n');
  return { style, label: s.label, count: papers.length, text };
}

module.exports = { formatOne, formatMany, citeKey, STYLES };
