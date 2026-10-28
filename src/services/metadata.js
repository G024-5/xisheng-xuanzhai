'use strict';

const ARXIV_API = 'https://export.arxiv.org/api/query?id_list=';
const ARXIV_PDF = 'https://arxiv.org/pdf/';
const CROSSREF = 'https://api.crossref.org/works/';
const TIMEOUT = 20000;

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const stripTags = (s) => clean(String(s || '').replace(/<[^>]+>/g, ' '));

/**
 * 识别用户粘贴的东西：
 *   2301.12345 / arXiv:2301.12345 / arxiv.org/abs/...  → arxiv
 *   10.1038/xxxx / doi.org/... / doi:10.xxx          → doi
 */
function parseIdentifier(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;

  const arxivUrl = s.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(v\d+)?/i);
  if (arxivUrl) return { type: 'arxiv', id: arxivUrl[1] };

  const arxivPrefixed = s.match(/^arxiv:\s*(\d{4}\.\d{4,5})(v\d+)?$/i);
  if (arxivPrefixed) return { type: 'arxiv', id: arxivPrefixed[1] };

  const arxivBare = s.match(/^(\d{4}\.\d{4,5})(v\d+)?$/);
  if (arxivBare) return { type: 'arxiv', id: arxivBare[1] };

  const doiUrl = s.match(/doi\.org\/(10\.\d{4,9}\/[^\s]+)/i);
  if (doiUrl) return { type: 'doi', id: decodeURIComponent(doiUrl[1]) };

  const doiBare = s.match(/^(?:doi:\s*)?(10\.\d{4,9}\/\S+)$/i);
  if (doiBare) return { type: 'doi', id: doiBare[1] };

  return null;
}

async function fetchArxiv(id, timeout = TIMEOUT) {
  const url = `${ARXIV_API}${encodeURIComponent(id)}`;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    throw Object.assign(new Error(`连不上 arXiv（${e.message}）`), { status: 502 });
  }
  if (!res.ok) throw Object.assign(new Error(`arXiv 返回 ${res.status}`), { status: 502 });

  const xml = await res.text();
  if (/<opensearch:totalResults[^>]*>0</.test(xml)) {
    throw Object.assign(new Error(`arXiv 上找不到 ${id}`), { status: 404 });
  }

  const entry = (xml.match(/<entry>([\s\S]*?)<\/entry>/) || [])[1];
  if (!entry) throw Object.assign(new Error('arXiv 返回内容无法解析'), { status: 502 });

  const pick = (tag) => {
    const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? m[1] : '';
  };

  const published = clean(pick('published'));
  const yearMatch = published.match(/\d{4}/);

  return {
    type: 'arxiv',
    arxivId: id,
    title: clean(pick('title')),
    abstract: clean(pick('summary')),
    authors: [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => clean(m[1])).filter(Boolean),
    year: yearMatch ? Number(yearMatch[0]) : null,
    venue: 'arXiv',
    doi: clean(pick('doi')) || null,
    url: `https://arxiv.org/abs/${id}`,
  };
}

async function fetchDoi(doi) {
  const url = `${CROSSREF}${encodeURIComponent(doi)}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'XishengXuanzhai/0.1 (personal literature manager)' },
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (e) {
    throw Object.assign(new Error(`连不上 Crossref（${e.message}）`), { status: 502 });
  }
  if (res.status === 404) throw Object.assign(new Error(`Crossref 上找不到 ${doi}`), { status: 404 });
  if (!res.ok) throw Object.assign(new Error(`Crossref 返回 ${res.status}`), { status: 502 });

  const data = await res.json().catch(() => null);
  const m = data && data.message;
  if (!m) throw Object.assign(new Error('Crossref 返回内容无法解析'), { status: 502 });

  const year = m.issued?.['date-parts']?.[0]?.[0] || m.published?.['date-parts']?.[0]?.[0] || null;

  return {
    type: 'doi',
    doi,
    title: clean(Array.isArray(m.title) ? m.title[0] : m.title),
    abstract: stripTags(m.abstract) || null,
    authors: (m.author || [])
      .map((a) => clean([a.given, a.family].filter(Boolean).join(' ')))
      .filter(Boolean),
    year: year ? Number(year) : null,
    venue: clean(Array.isArray(m['container-title']) ? m['container-title'][0] : m['container-title']) || null,
    url: m.URL || `https://doi.org/${doi}`,
  };
}

/** arXiv 的 PDF 是免费的，顺手下下来；其它来源不猜 */
async function downloadArxivPdf(id, maxBytes = 80 * 1024 * 1024) {
  let res;
  try {
    res = await fetch(`${ARXIV_PDF}${encodeURIComponent(id)}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    return null;
  }
  if (!res.ok) return null;

  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) return null;

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes || buf.subarray(0, 5).toString() !== '%PDF-') return null;
  return buf;
}

module.exports = { parseIdentifier, fetchArxiv, fetchDoi, downloadArxivPdf };
