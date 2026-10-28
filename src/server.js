'use strict';
const { createServer } = require('./app');

const PORT = Number(process.env.PORT || 5178);
const HOST = process.env.HOST || '127.0.0.1';

const server = createServer();
server.listen(PORT, HOST, () => {
  console.log(`文献台 PaperDesk · http://${HOST}:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n正在退出…');
    server.close(() => process.exit(0));
  });
}
