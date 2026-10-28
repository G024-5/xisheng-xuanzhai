'use strict';
/**
 * 静态一致性检查（没有构建步骤，所以用脚本代替类型系统）
 *   - public/js 里引用的 DOM id 必须存在于 index.html
 *   - import 的相对路径必须真实存在
 *   - 每个 html 元素 id 只出现一次
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const jsDir = path.join(root, 'public/js');
const files = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'));

const problems = [];

// 1. id 唯一性
const idList = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const dup = idList.filter((id, i) => idList.indexOf(id) !== i);
if (dup.length) problems.push(`index.html 存在重复 id：${[...new Set(dup)].join(', ')}`);
const ids = new Set(idList);

// 2. JS → DOM id
for (const f of files) {
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  const used = new Set([...src.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]));
  const missing = [...used].filter((id) => !ids.has(id));
  if (missing.length) problems.push(`${f} 引用了不存在的 id：${missing.join(', ')}`);

  // 3. 相对 import
  for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
    if (!fs.existsSync(path.resolve(jsDir, m[1]))) {
      problems.push(`${f} 的 import 找不到：${m[1]}`);
    }
  }
}

if (problems.length) {
  console.error('发现问题：');
  for (const p of problems) console.error('  ✗ ' + p);
  process.exitCode = 1;
} else {
  console.log(`✓ ${files.length} 个前端模块、${ids.size} 个 id，引用全部有效`);
}
