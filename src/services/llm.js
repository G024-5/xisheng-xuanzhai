'use strict';
const { resolveApiKey, resolveBaseUrl, resolveModel } = require('./settings');

class LlmError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

async function chat(messages, { temperature = 0.3, maxTokens = 800, model, timeout = 60000, thinking } = {}) {
  const key = resolveApiKey();
  if (!key) throw new LlmError('尚未配置 API Key，请在「设置」里填写', 400);

  const base = resolveBaseUrl();
  const m = model || resolveModel();

  const payload = { model: m, messages, temperature, max_tokens: maxTokens, stream: false };
  // deepseek-flash 默认开思考模式，会把 max_tokens 全部吃进 reasoning，
  // 摘要这种任务必须显式关掉，否则正文为空。
  if (thinking) payload.thinking = { type: thinking };

  let resp;
  try {
    resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new LlmError(`无法连接 ${base}：${e.name === 'TimeoutError' ? '请求超时' : e.message}`, 502);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    const hint = {
      401: 'API Key 无效或已失效',
      402: '账户余额不足',
      429: '请求过于频繁，稍后再试',
    }[resp.status] || 'DeepSeek 返回错误';
    throw new LlmError(`${hint}（${resp.status}）${detail ? '：' + detail.slice(0, 200) : ''}`, resp.status);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '';
  return { content, usage: data.usage || null, model: m };
}

const SYSTEM_PROMPT = [
  '你是严谨的学术助手。只依据用户给的标题与摘要作答，不得引入摘要之外的知识，也不要替作者推测。',
  '用中文输出四行，每行以固定标签开头，不要开场白、不要编号、不要额外总结：',
  '背景：这项研究面对什么问题、在什么背景下提出',
  '方法：用了什么途径、模型、数据或实验设计',
  '结论：得到的主要结果',
  '局限：作者在文中明确提到的不足或限制；摘要没提到就写「摘要未提及」',
  '每行不超过 45 字，四行合计不超过 180 字。',
].join('\n');

async function summarise({ title, abstract, venue, year }) {
  const input = [
    `标题：${title}`,
    venue || year ? `发表：${venue || ''} ${year || ''}`.trim() : '',
    abstract ? `摘要：${abstract}` : '（该文献没有摘要，仅根据标题作答，并说明信息不足）',
  ].filter(Boolean).join('\n');

  return chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: input },
  ], { maxTokens: 600, thinking: 'disabled' });
}

/** 发一条极小请求验证 Key/网络/模型是否可用 */
async function testConnection() {
  const t0 = Date.now();
  const r = await chat([{ role: 'user', content: 'ping' }], { maxTokens: 8, temperature: 0, thinking: 'disabled' });
  return { ok: true, model: r.model, latencyMs: Date.now() - t0, reply: r.content.slice(0, 40) };
}

module.exports = { chat, summarise, testConnection, LlmError };
