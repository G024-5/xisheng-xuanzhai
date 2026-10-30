'use strict';
/**
 * 环境自检：node scripts/doctor.js
 * 出问题时先跑这个，把输出整段贴出来即可定位。
 */
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

const ROOT = path.resolve(__dirname, '..');
const out = [];
const add = (k, v) => out.push([k, String(v)]);
const ok = (v) => `OK   ${v}`;
const bad = (v) => `FAIL ${v}`;

function portBusy(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
    srv.once('listening', () => srv.close(() => resolve(false)));
    srv.listen(port, '127.0.0.1');
  });
}

(async () => {
  add('时间', new Date().toLocaleString('zh-CN'));
  add('Node', `${process.version} (${process.platform}/${process.arch})`);
  add('当前目录', process.cwd());
  add('项目根', ROOT);

  const must = [
    'src/server.js',
    'src/db/migrations',
    'public/index.html',
    'public/js/app.js',
    'public/vendor/pdfjs/pdf.min.mjs',
    'public/vendor/pdfjs/pdf.worker.min.mjs',
  ];
  for (const rel of must) {
    const p = path.join(ROOT, rel);
    add(rel, fs.existsSync(p) ? ok('存在') : bad('缺失'));
  }

  // 数据目录可写性
  const dataDir = process.env.XISHENG_DATA || path.join(ROOT, 'data');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const probe = path.join(dataDir, '.doctor-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    add('数据目录', ok(dataDir));
  } catch (err) {
    add('数据目录', bad(`${dataDir} 不可写（${err.message}）`));
  }

  // 数据库与迁移
  try {
    const { db } = require('../src/db');
    const applied = db.prepare('SELECT id FROM _migrations ORDER BY id').all().map((r) => r.id);
    const papers = db.prepare('SELECT COUNT(*) c FROM papers').get().c;
    add('数据库', ok(`${applied.length} 个迁移已应用，${papers} 篇文献`));
    add('最新迁移', applied[applied.length - 1] || '（无）');
  } catch (err) {
    add('数据库', bad(err.message));
  }

  // 端口
  for (const p of [5178, 5179]) {
    const busy = await portBusy(p);
    add(`端口 ${p}`, busy ? '被占用（可能已有一个实例在跑）' : '空闲');
  }

  const width = Math.max(...out.map(([k]) => k.length));
  console.log('');
  for (const [k, v] of out) console.log(`${k.padEnd(width)}  ${v}`);
  console.log('');
  console.log('若要把这份结果发给开发者，直接复制上面全部内容即可。');
  console.log('');
})();
