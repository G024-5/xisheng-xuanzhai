const fs = require('node:fs');
const path = require('node:path');
const { db, STORAGE_DIR } = require('./src/db');

(async () => {
  const row = db.prepare('SELECT paper_id, rel_path FROM attachments ORDER BY paper_id LIMIT 1').get();
  const file = path.join(STORAGE_DIR, row.rel_path);
  console.log('file:', path.basename(file), (fs.statSync(file).size / 1048576).toFixed(1), 'MB');

  const lib = await import('./public/vendor/pdfjs/pdf.min.mjs');
  console.log('pdf.js version:', lib.version);

  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await lib.getDocument({ data, isEvalSupported: false, useWorkerFetch: false }).promise;
  console.log('pages:', doc.numPages);

  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const text = tc.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
  console.log('chars on page 1:', text.length);
  console.log('preview:', text.slice(0, 300));
})().catch((e) => { console.error('ERR', e.message); });
