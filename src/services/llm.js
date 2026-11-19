'use strict';
const { resolveApiKey, resolveBaseUrl, resolveModel, isLocalEndpoint } = require('./settings');

class LlmError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

/** 网络抖动时重试一次；4xx 是配置错误，重试没意义 */
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

async function once(messages, { temperature, maxTokens, model, timeout, thinking }) {
  const key = resolveApiKey();
  const base = resolveBaseUrl();
  const isLocal = isLocalEndpoint(base);

  // 本机模型（Ollama 等）不校验 Authorization，DeepSeek 这类云服务必须有 Key
  if (!key && !isLocal) throw new LlmError('尚未配置 API Key，请在「设置」里填写', 400);

  const payload = { model, messages, temperature, max_tokens: maxTokens, stream: false };
  // deepseek-flash 默认开思考模式，会把 max_tokens 全部吃进 reasoning，
  // 摘要这种任务必须显式关掉，否则正文为空。
  if (thinking) payload.thinking = { type: thinking };

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;

  let resp;
  try {
    resp = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    const why = e.name === 'TimeoutError' ? '请求超时' : e.message;
    const tip = isLocal ? '（本机模型没起来？先确认 ollama serve 在跑）' : '';
    const err = new LlmError(`无法连接 ${base}：${why}${tip}`, 502);
    err.network = true;
    throw err;
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    const hint = {
      401: 'API Key 无效或已失效',
      402: '账户余额不足',
      404: isLocal ? '模型不存在，先 ollama pull 一下' : '接口地址不存在',
      429: '请求过于频繁，稍后再试',
    }[resp.status] || (isLocal ? '本机模型返回错误' : '模型服务返回错误');
    const err = new LlmError(`${hint}（${resp.status}）${detail ? '：' + detail.slice(0, 200) : ''}`, resp.status);
    err.retryable = RETRY_STATUS.has(resp.status);
    throw err;
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '';
  return { content, usage: data.usage || null, model: data.model || model };
}

async function chat(messages, opts = {}) {
  const { temperature = 0.3, maxTokens = 800, model, timeout = 60000, thinking } = opts;
  const m = model || resolveModel();

  const args = { temperature, maxTokens, model: m, timeout, thinking };
  try {
    return await once(messages, args);
  } catch (e) {
    if (!e.network && !e.retryable) throw e;
    // 退避 800ms 再试一次：本机模型冷启动、云端偶发 5xx 都靠这一步兜住
    await new Promise((r) => setTimeout(r, 800));
    return once(messages, { ...args, timeout: timeout + 30000 });
  }
}

const SYSTEM_PROMPT = [
  '你是严谨的学术助手。用户会给出一篇论文的正文（由 PDF 自动抽取，可能有断行、双栏交错或个别乱码）。',
  '只依据这份正文作答，不得引入外部知识，也不要替作者推测。',
  '用中文输出四行，每行以固定标签开头，不要开场白、不要编号、不要额外总结：',
  '背景：这项研究面对什么问题、在什么背景下提出',
  '方法：用了什么途径、模型、数据或实验设计',
  '结论：得到的主要结果',
  '局限：作者在文中明确提到的不足或限制；正文没提到就写「正文未提及」',
  '每行不超过 50 字，四行合计不超过 200 字。',
].join('\n');

/** 超长时保留开头和结尾：方法多在前面，局限常写在讨论/结论里 */
function clipBody(text, maxChars = 60000) {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.7);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n……（中间略去 ${text.length - maxChars} 字）……\n${text.slice(-tail)}`;
}

async function summarise({ title, abstract, venue, year, body }) {
  const head = [
    `标题：${title}`,
    venue || year ? `发表：${venue || ''} ${year || ''}`.trim() : '',
  ].filter(Boolean).join('\n');

  // 3B 级本地模型吃不下 6 万字：上下文一长就开始复述原文，反而更差
  const limit = isLocalEndpoint(resolveBaseUrl()) ? 24000 : 60000;

  const user = body
    ? `${head}\n\n正文：\n${clipBody(body, limit)}`
    : `${head}\n\n${abstract ? `摘要：${abstract}` : '（没有正文，也没有摘要，仅根据标题作答，并说明信息不足）'}`;

  const r = await chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ], { maxTokens: 600, thinking: 'disabled' });

  return { ...r, scope: body ? 'fulltext' : 'abstract' };
}

/** 目标语言 → 提示词里的名字。没列的语言按码原样塞进去，模型自己会认 */
const TARGET_NAME = { zh: '简体中文', en: '英文', ja: '日文' };

function translateSystem(target) {
  return [
    `你是学术文献翻译助手。把用户给出的片段译成${TARGET_NAME[target] || target}。`,
    '要求：忠实直译，不增删、不改写、不解释；保留公式、变量名、模型名、数据集名、缩写与数字原样；',
    '若是完整句子，保持专业书面语；若是标题或词组，保持简短。',
    '只输出译文本身，不要加引号、不要加「译文：」之类的前缀。',
  ].join('\n');
}

/**
 * 划词翻译。目标语言默认中文；英文原文交给模型直译，
 * 学术术语（KV cache、RAG、fine-tune）保留原文不硬翻。
 * target === 'original' 表示「看原文」，不调模型直接回显。
 */
async function translate(text, { target = 'zh' } = {}) {
  const t = String(text || '').trim();
  if (!t) throw new LlmError('没有可翻译的文字', 400);
  if (target === 'original') return { text: t, translation: t, model: 'none', usage: null };

  const r = await chat([
    { role: 'system', content: translateSystem(target) },
    { role: 'user', content: t },
  ], { maxTokens: 900, temperature: 0.2, timeout: 45000, thinking: 'disabled' });

  return { text: t, translation: r.content, model: r.model, usage: r.usage };
}

/** 发一条极小请求验证 Key/网络/模型是否可用 */
async function testConnection() {
  const t0 = Date.now();
  const r = await chat([{ role: 'user', content: 'ping' }], { maxTokens: 8, temperature: 0, thinking: 'disabled' });
  return { ok: true, model: r.model, latencyMs: Date.now() - t0, reply: r.content.slice(0, 40) };
}

module.exports = { chat, summarise, translate, testConnection, LlmError };
