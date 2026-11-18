'use strict';
/**
 * 桌面外壳的无头验证：把 `electron` 模块换成替身，加载 electron/main.js，
 * 检查它是否真的拉起了服务、创建了窗口、把窗口指向正确的地址。
 *
 *   node scripts/verify-electron.js
 *
 * 不用真的开窗口，所以 CI 和没有桌面环境的机器上都能跑。
 */
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'xisheng-electron-'));
process.env.XISHENG_DATA = path.join(TMP, 'data');

const record = {
  windowOptions: null,
  loadedUrl: null,
  menuSet: false,
  quitCalled: false,
  errorBox: null,
  singleLock: false,
};

class FakeWebContents {
  setWindowOpenHandler() {}
  on() {}
}

class FakeBrowserWindow {
  constructor(options) {
    record.windowOptions = options;
    this.webContents = new FakeWebContents();
    this._bounds = { x: 0, y: 0, width: options.width, height: options.height };
    this._handlers = {};
  }
  once(event, cb) {
    if (event === 'ready-to-show') this._ready = cb;
    return this;
  }
  on(event, cb) {
    this._handlers[event] = cb;
    return this;
  }
  loadURL(url) {
    record.loadedUrl = url;
    // 模拟窗口加载完成
    setImmediate(() => this._ready && this._ready());
  }
  show() {}
  getBounds() {
    return this._bounds;
  }
  isDestroyed() {
    return false;
  }
}

const fakeElectron = {
  app: {
    whenReady: () => Promise.resolve(),
    requestSingleInstanceLock: () => {
      record.singleLock = true;
      return true;
    },
    on() {},
    quit() {
      record.quitCalled = true;
    },
    setAppUserModelId() {},
    getPath: () => TMP,
  },
  BrowserWindow: FakeBrowserWindow,
  Menu: {
    setApplicationMenu() {
      record.menuSet = true;
    },
  },
  shell: { openExternal() {} },
  dialog: {
    showErrorBox(title, msg) {
      record.errorBox = `${title}: ${msg}`;
    },
  },
};

const realLoad = Module._load;
Module._load = function patched(request, ...rest) {
  if (request === 'electron') return fakeElectron;
  return realLoad.call(this, request, ...rest);
};

/* ---------- 开始验证 ---------- */

(async () => {
  require(path.join(ROOT, 'electron', 'main.js'));

  // 等窗口拿到地址
  for (let i = 0; i < 100 && !record.loadedUrl; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }

  assert.ok(record.singleLock, '应该申请单实例锁');
  assert.ok(!record.errorBox, `不应报错：${record.errorBox}`);
  assert.ok(record.loadedUrl, '应该调用 loadURL');
  assert.ok(record.menuSet, '应该移除默认菜单');

  const url = record.loadedUrl;
  const port = Number(new URL(url).port);
  assert.ok(port >= 5178 && port <= 5188, `端口应在 5178-5188 之间，实际 ${port}`);
  console.log(`  窗口地址 ${url}`);

  const res = await fetch(`${url}/api/health`);
  const body = await res.json();
  assert.strictEqual(body.ok, true, '/api/health 应返回 ok');
  console.log(`  服务健康检查通过，版本 ${body.version}`);

  const html = await (await fetch(`${url}/`)).text();
  assert.ok(html.includes('溪声轩斋'), '首页应返回壳页面');
  console.log('  首页可访问');

  const dataDir = process.env.XISHENG_DATA;
  assert.ok(fs.existsSync(dataDir), `数据目录应已创建：${dataDir}`);
  assert.ok(fs.existsSync(path.join(dataDir, 'app.db')), '应创建 app.db');
  console.log(`  数据目录 ${dataDir}`);

  assert.ok(record.windowOptions.webPreferences.contextIsolation, '应开启 contextIsolation');
  assert.strictEqual(record.windowOptions.webPreferences.nodeIntegration, false, '应关闭 nodeIntegration');
  console.log('  窗口安全选项正确');

  console.log('\n桌面外壳验证通过 7 项');
  // 先关数据库再退出：node:sqlite 的连接在退出时被强制收尾会触发 libuv 断言
  try {
    require(path.join(ROOT, 'src', 'db')).db.close();
  } catch {
    /* 已经关了 */
  }
  // 数据库连接还开着时 Windows 删不掉临时目录，留给系统清理
  setTimeout(() => process.exit(0), 50);
})().catch((err) => {
  console.error(`\n[失败] ${err.message}`);
  process.exit(1);
});
