'use strict';
const { createServer } = require('./app');
const { db, DATA_DIR } = require('./db');
const { backup, prune } = require('./db/backup');

const PORT = Number(process.env.PORT || 5178);
const HOST = process.env.HOST || '127.0.0.1';
const BACKUP_HOUR = Number(process.env.BACKUP_HOUR || 3);

const server = createServer();
server.listen(PORT, HOST, () => {
  console.log(`溪声轩斋 · http://${HOST}:${PORT}`);
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
