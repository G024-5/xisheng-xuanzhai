/** 极简 fetch 封装：统一 JSON、统一错误 */

export async function req(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const qs = (params) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== '' && v !== null && v !== undefined) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
};

export const api = {
  bootstrap: () => req('/api/bootstrap'),

  papers: (params) => req(`/api/papers${qs(params)}`),
  paper: (id) => req(`/api/papers/${id}`),
  setReadState: (id, readState) => req(`/api/papers/${id}`, { method: 'PATCH', body: { read_state: readState } }),
  saveNote: (id, noteBody) => req(`/api/papers/${id}/note`, { method: 'PUT', body: { body: noteBody } }),

  // 入库：先传文件拿到 uploadId，再带着元数据建条目
  uploadPdf: async (file) => {
    const res = await fetch(`/api/uploads?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  createPaper: (payload) => req('/api/papers', { method: 'POST', body: payload }),
  importPaper: (identifier) => req('/api/papers/import', { method: 'POST', body: { identifier } }),

  tree: () => req('/api/tree'),
  addNode: (title, parentId = null) => req('/api/tree/nodes', { method: 'POST', body: { title, parentId } }),
  renameNode: (id, title) => req(`/api/tree/nodes/${id}`, { method: 'PATCH', body: { title } }),
  deleteNode: (id) => req(`/api/tree/nodes/${id}`, { method: 'DELETE' }),
  attach: (nodeId, paperId) => req('/api/tree/entries', { method: 'POST', body: { nodeId, paperId } }),
  detach: (nodeId, paperId) => req(`/api/tree/entries?nodeId=${nodeId}&paperId=${paperId}`, { method: 'DELETE' }),

  settings: () => req('/api/settings'),
  saveSettings: (patch) => req('/api/settings', { method: 'PUT', body: patch }),
  testConnection: () => req('/api/settings/test', { method: 'POST' }),

  summarize: (paperId) => req('/api/ai/summary', { method: 'POST', body: { paperId } }),
};
