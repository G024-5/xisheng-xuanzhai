'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');

const PDF_MAGIC = Buffer.from('%PDF-');

/**
 * 把请求体以流的方式写进文件，同时算 sha256。
 * 不 readFileSync —— 学位论文可能上百 MB，一次读进内存会炸。
 */
function savePdfStream(req, destPath, maxBytes = 200 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(destPath);
    let bytes = 0;
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      out.destroy();
      fs.unlink(destPath, () => reject(err));
    };

    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        req.destroy();
        return fail(Object.assign(new Error('文件超过 200MB 上限'), { status: 413 }));
      }
      hash.update(chunk);
      out.write(chunk);
    });

    req.on('error', (err) => fail(err));

    req.on('end', () => {
      if (settled) return;
      out.end(() => {
        if (settled) return;
        settled = true;
        resolve({ bytes, sha256: hash.digest('hex') });
      });
    });
  });
}

/** 只读开头几个字节，确认真的是 PDF（不信任 Content-Type） */
function isPdfFile(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(5);
    fs.readSync(fd, buf, 0, 5, 0);
    return buf.equals(PDF_MAGIC);
  } finally {
    fs.closeSync(fd);
  }
}

/** 清掉用户上传后没完成建条目的临时文件（默认 24 小时前的） */
function cleanupTmp(dir, maxAgeMs = 24 * 60 * 60 * 1000) {
  if (!fs.existsSync(dir)) return 0;
  const now = Date.now();
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > maxAgeMs) {
        fs.unlinkSync(file);
        removed++;
      }
    } catch { /* 忽略单个文件的错误 */ }
  }
  return removed;
}

module.exports = { savePdfStream, isPdfFile, cleanupTmp };
