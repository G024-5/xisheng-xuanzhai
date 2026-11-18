'use strict';
const net = require('node:net');

/** 端口能不能绑上（只探测，不占用） */
function isFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });
}

/** 该端口上跑的是不是本程序（避免把别人的服务当成自己） */
async function looksLikeOurs(port, host = '127.0.0.1') {
  try {
    const res = await fetch(`http://${host}:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    if (!res.ok) return false;
    const body = await res.json();
    return Boolean(body && body.ok === true);
  } catch {
    return false;
  }
}

/**
 * 从 from 开始往后找一个空闲端口，全被占则返回 0（交给系统分配）。
 */
async function pickPort({ host = '127.0.0.1', from = 5178, to = 5188 } = {}) {
  for (let port = from; port <= to; port++) {
    if (await isFree(port, host)) return port;
  }
  return 0;
}

module.exports = { isFree, looksLikeOurs, pickPort };
