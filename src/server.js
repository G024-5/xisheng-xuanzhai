'use strict';
const path = require('node:path');
const { createServer } = require('./app');
const { db, DATA_DIR } = require('./db');
const { backup, prune } = require('./db/backup');
const { cleanupTmp } = require('./util/upload');
const { pickPort, looksLikeOurs } = require('./util/port');

const HOST = process.env.HOST || '127.0.0.1';
const BACKUP_HOUR = Number(process.env.BACKUP_HOUR || 3);
const FIRST_PORT = 5178;

/** 决定监听哪个端口；若首选端口上已有本程序在跑，直接让位 */
async function decidePort() {
  if (process.env.PORT) return Number(process.env.PORT); // 显式指定，占用则照常报错
  if (await looksLikeOurs(FIRST_PORT, HOST)) return null;
  return pickPort({ host: HOST, from: FIRST_PORT, to: FIRST_PORT + 10 });
}

const server = createServer();

async function main() {
  const port = await decidePort();
  if (port === null) {
    console.error('');
    console.error(`  已经有一个溪声轩斋在运行：http://${HOST}:${FIRST_PORT}`);
    console.error('  直接打开上面的地址即可，不需要再启动一个。');
    console.error('');
    process.exit(0);
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  [错误] 端口 ${port} 已被占用。要换端口：set PORT=5179 && node src/server.js\n`);
    } else {
      console.error('[错误] 服务启动失败：', err.message);
    }
    process.exit(1);
  });

  server.listen(port, HOST, onListening);
}

function onListening() {
  const { port } = server.address();
  console.log(`  溪声轩斋 · http://${HOST}:${port}`);
  console.log(`  数据目录 ${DATA_DIR}`);
  const cleaned = cleanupTmp(path.join(DATA_DIR, 'tmp'));
  if (cleaned) console.log(`  [清理] ${cleaned} 个未完成的上传`);
  scheduleDailyBackup();
}

/** 每天凌晨做一次一致性快照，保留最近 10 份 */
function scheduleDailyBackup() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(BACKUP_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  setTimeout(() => {
    try {
      const file = backup(db, DATA_DIR, 'daily');
      prune(DATA_DIR, 10);
      console.log(`[备份] ${file}`);
    } catch (err) {
      console.error('[备份] 失败：', err.message);
    }
    scheduleDailyBackup();
  }, next - now).unref();
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n正在退出…');
    server.close(() => process.exit(0));
  });
}

main();
