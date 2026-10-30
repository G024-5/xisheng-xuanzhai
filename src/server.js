'use strict';
const path = require('node:path');
const { createServer } = require('./app');
const { db, DATA_DIR } = require('./db');
const { backup, prune } = require('./db/backup');
const { cleanupTmp } = require('./util/upload');

const PORT = Number(process.env.PORT || 5178);
const HOST = process.env.HOST || '127.0.0.1';
const BACKUP_HOUR = Number(process.env.BACKUP_HOUR || 3);

const server = createServer();

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`  [错误] 端口 ${PORT} 已被占用。`);
    console.error('  可能已经开着一个实例了 —— 先试试直接打开 http://127.0.0.1:' + PORT);
    console.error('  要换端口启动：set PORT=5179 && node src/server.js');
    console.error('');
    process.exit(1);
  }
  console.error('[错误] 服务启动失败：', err.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`  溪声轩斋 · http://${HOST}:${PORT}`);
  console.log(`  数据目录 ${DATA_DIR}`);
  const cleaned = cleanupTmp(path.join(DATA_DIR, 'tmp'));
  if (cleaned) console.log(`  [清理] ${cleaned} 个未完成的上传`);
  scheduleDailyBackup();
});

/** 每天凌晨 3 点做一次一致性快照，保留最近 10 份 */
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
