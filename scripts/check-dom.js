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

// 4. .bat 必须是纯 ASCII。
// cmd.exe 按系统代码页（中文 Windows 是 GBK）解析批处理文件，
// 无 BOM 的 UTF-8 中文会被拆成乱码，甚至把后半句当成命令执行。
const bats = fs.readdirSync(root).filter((f) => f.toLowerCase().endsWith('.bat'));
for (const f of bats) {
  const buf = fs.readFileSync(path.join(root, f));
  const bad = buf.findIndex((b) => b > 127);
  if (bad !== -1) {
    const line = buf.subarray(0, bad).toString('utf8').split('\n').length;
    problems.push(`${f} 第 ${line} 行含非 ASCII 字符，cmd 会解析错乱（批处理只写英文）`);
  }
}

if (problems.length) {
  console.error('发现问题：');
  for (const p of problems) console.error('  ✗ ' + p);
  process.exitCode = 1;
} else {
  console.log(`✓ ${files.length} 个前端模块、${ids.size} 个 id，${bats.length} 个批处理文件，检查通过`);
}
