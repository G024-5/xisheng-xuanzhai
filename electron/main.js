'use strict';
/**
 * 溪声轩斋 · 桌面外壳
 *
 * 后端仍是原来那套 http 服务，只是跑在 Electron 主进程里；
 * 窗口直接加载 http://127.0.0.1:<port>，所以前端代码一行都不用改。
 */
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const SMOKE = process.env.XISHENG_SMOKE === '1'; // 自动化冒烟测试用：加载完就退出
const HOST = '127.0.0.1';
const FIRST_PORT = 5178;

let win = null;
let server = null;

// 同一时间只允许一个实例，第二个实例把已有窗口叫到前台
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
}

app.setAppUserModelId('com.xiSheng.xuanzhai');

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window.json');
}

function loadBounds() {
  try {
    const raw = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
    if (Number.isFinite(raw.width) && Number.isFinite(raw.height)) return raw;
  } catch {
    /* 首次启动没有这个文件 */
  }
  return { width: 1360, height: 880 };
}

function saveBounds() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getBounds();
    fs.mkdirSync(path.dirname(windowStatePath()), { recursive: true });
    fs.writeFileSync(windowStatePath(), JSON.stringify(b));
  } catch {
    /* 记不住窗口大小不影响使用 */
  }
}

async function startServer() {
  const { createServer } = require('../src/app');
  const { pickPort } = require('../src/util/port');

  const port = await pickPort({ host: HOST, from: FIRST_PORT, to: FIRST_PORT + 10 });
  server = createServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, resolve);
  });

  const actual = server.address().port;
  console.log(`[main] 服务就绪 http://${HOST}:${actual}`);
  return actual;
}

function createWindow(port) {
  const bounds = loadBounds();
  // 打包后图标在 resources/ 下（extraResources），开发时在 build/ 下
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '..', 'build', 'icon.ico');
  win = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: '#fbfbfc',
    title: '溪声轩斋',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);

  // 站内跳转留在窗口里，外链交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://${HOST}:${port}`)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.once('ready-to-show', () => {
    win.show();
    if (SMOKE) {
      console.log('[main] SMOKE loaded');
      setTimeout(() => app.quit(), 300);
    }
  });

  win.on('close', saveBounds);

  win.loadURL(`http://${HOST}:${port}`);
}

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    createWindow(port);
  } catch (err) {
    dialog.showErrorBox('启动失败', `本地服务没能起来：\n${err.message}\n\n可以先运行 doctor.bat 看看环境。`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (server) {
    try {
      server.close();
    } catch {
      /* 已经关了 */
    }
  }
});
