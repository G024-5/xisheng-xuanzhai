'use strict';
/** 端到端自检：node scripts/verify.js（需先启动服务） */

const B = process.env.BASE || 'http://127.0.0.1:5178';
const out = [];
const ok = (name, cond, extra = '') => out.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);

const get = async (p, opt) => {
  const r = await fetch(B + p, opt);
  const ct = r.headers.get('content-type') || '';
  const body = ct.includes('json') ? await r.json() : await r.text();
  return { status: r.status, body, headers: r.headers };
};
const send = async (p, method, body) => {
  const r = await fetch(B + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

(async () => {
  /* ---------- 静态资源 ---------- */
  const home = await get('/');
  ok('GET /', home.status === 200 && home.body.includes('id="paperView"'));

  for (const p of ['/js/app.js', '/js/api.js', '/js/ui.js', '/style.css']) {
    const r = await get(p);
    ok(`GET ${p}`, r.status === 200);
  }
  const css = (await get('/style.css')).body;
  ok('CSS 兜底 [hidden]', css.includes('[hidden] { display: none !important; }'));

  /* ---------- 数据 ---------- */
  const boot = (await get('/api/bootstrap')).body;
  ok('bootstrap', boot.stats.papers > 0, `papers=${boot.stats.papers}`);
  ok('bootstrap 含设置', typeof boot.settings?.ai?.hasKey === 'boolean');

  const all = (await get('/api/papers')).body;
  ok('列表默认排序', all.items.length === boot.stats.papers, `${all.items.length} 条`);

  const byTitle = (await get('/api/papers?sort=title_asc')).body;
  const titles = byTitle.items.map((p) => p.title.toLowerCase());
  const sorted = [...titles].sort();
  ok('按标题排序', JSON.stringify(titles) === JSON.stringify(sorted));

  const byYear = (await get('/api/papers?sort=year_asc')).body;
  const years = byYear.items.map((p) => p.year || 9999);
  ok('按年份排序', years.every((y, i) => i === 0 || years[i - 1] <= y));

  const unread = (await get('/api/papers?state=unread')).body;
  ok('按阅读状态筛选', unread.items.every((p) => p.read_state === 'unread'), `${unread.items.length} 条`);

  const searched = (await get('/api/papers?q=retrieval')).body;
  ok('搜索', searched.items.length > 0, `${searched.items.length} 条`);

  const detail = (await get('/api/papers/15')).body;
  ok('详情', Boolean(detail.title) && Array.isArray(detail.authors));

  /* ---------- PDF ---------- */
  const head = await fetch(`${B}/api/papers/15/file`, { method: 'HEAD' });
  ok('PDF HEAD', head.status === 200 && head.headers.get('content-type') === 'application/pdf');

  const range = await fetch(`${B}/api/papers/15/file`, { headers: { Range: 'bytes=0-1023' } });
  ok('PDF Range', range.status === 206, range.headers.get('content-range'));

  /* ---------- 设置 ---------- */
  const st = (await get('/api/settings')).body;
  ok('设置不泄露明文 Key', !JSON.stringify(st).includes('sk-') || !st.ai.hasKey);
  ok('设置含模型', Boolean(st.ai.model));

  /* ---------- 知识树 CRUD ---------- */
  const node = await send('/api/tree/nodes', 'POST', { title: '自检节点' });
  ok('建节点', node.status === 200 && node.body.id > 0);

  const rename = await send(`/api/tree/nodes/${node.body.id}`, 'PATCH', { title: '自检节点-改' });
  ok('改名', rename.status === 200);

  const attach = await send('/api/tree/entries', 'POST', { nodeId: node.body.id, paperId: 15 });
  ok('挂载文献', attach.status === 200);

  const tree = (await get('/api/tree')).body;
  ok('树里能看到挂载', tree.entries.some((e) => e.node_id === node.body.id));

  await send(`/api/tree/entries?nodeId=${node.body.id}&paperId=15`, 'DELETE');
  const del = await send(`/api/tree/nodes/${node.body.id}`, 'DELETE');
  ok('删除节点', del.status === 200);

  /* ---------- 笔记（写完还原）---------- */
  const before = detail.note?.body || '';
  await send('/api/papers/15/note', 'PUT', { body: '自检笔记内容' });
  const after = (await get('/api/papers/15')).body;
  ok('笔记写入读回', after.note.body === '自检笔记内容');
  await send('/api/papers/15/note', 'PUT', { body: before });
  const restored = (await get('/api/papers/15')).body;
  ok('笔记已还原', restored.note.body === before);

  /* ---------- 汇总 ---------- */
  console.log(out.join('\n'));
  const fails = out.filter((l) => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - fails}/${out.length} 通过`);
  process.exitCode = fails ? 1 : 0;
})();
