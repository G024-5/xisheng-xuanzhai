'use strict';
const http = require('node:http');
const path = require('node:path');
const { ROOT } = require('./db');
const { serveStatic, sendJson } = require('./util/http');

const PUBLIC_DIR = path.join(ROOT, 'public');
const routes = [];

/**
 * 极简路由表。pattern 形如 /api/papers/:id
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method
 * @param {string} pattern
 * @param {(req, res, params, url) => Promise<void>|void} handler
 */
function add(method, pattern, handler) {
  routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });
}

require('./routes/meta')(add);
require('./routes/papers')(add);
require('./routes/notes')(add);
require('./routes/tree')(add);
require('./routes/settings')(add);
require('./routes/ai')(add);
require('./routes/annotations')(add);
require('./routes/board')(add);

function match(method, segs) {
  for (const route of routes) {
    if (route.method !== method || route.parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      const part = route.parts[i];
      if (part.startsWith(':')) params[part.slice(1)] = decodeURIComponent(segs[i]);
      else if (part !== segs[i]) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

    // HEAD 复用 GET 的路由表
    let method = req.method;
    let segs = url.pathname.split('/').filter(Boolean);
    let found = match(method, segs);
    if (!found && method === 'HEAD') {
      method = 'GET';
      found = match(method, segs);
    }

    if (found) {
      try {
        await found.route.handler(req, res, found.params, url);
      } catch (err) {
        console.error(`[${req.method} ${url.pathname}]`, err.message);
        if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message });
        else res.end();
      }
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      return serveStatic(req, res, url.pathname, PUBLIC_DIR);
    }
    return sendJson(res, 404, { error: 'not found' });
  });
}

module.exports = { createServer };
