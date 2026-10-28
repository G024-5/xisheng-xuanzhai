'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 4 * 1024 * 1024) {
        reject(Object.assign(new Error('请求体过大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('JSON 解析失败'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname, publicDir) {
  let rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const full = path.join(publicDir, rel);
  if (!full.startsWith(publicDir)) return sendJson(res, 403, { error: 'forbidden' });

  const target = fs.existsSync(full) && fs.statSync(full).isFile()
    ? full
    : path.join(publicDir, 'index.html'); // SPA 回退

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(target)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(target).pipe(res);
}

/** 带 Range 与 HEAD 支持的二进制流 */
function sendFile(req, res, filePath, { type = 'application/octet-stream', inline = true } = {}) {
  if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: 'file not found' });
  const st = fs.statSync(filePath);
  const headers = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Content-Disposition': inline ? 'inline' : 'attachment',
    'Cache-Control': 'private, max-age=3600',
  };

  if (req.method === 'HEAD') {
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    return res.end();
  }

  const range = req.headers.range;
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Number(m[2]) : st.size - 1;
    if (start >= st.size || end >= st.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
      return res.end();
    }
    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${st.size}`,
      'Content-Length': end - start + 1,
    });
    return fs.createReadStream(filePath, { start, end }).pipe(res);
  }

  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  fs.createReadStream(filePath).pipe(res);
}

module.exports = { sendJson, readBody, serveStatic, sendFile, MIME };
