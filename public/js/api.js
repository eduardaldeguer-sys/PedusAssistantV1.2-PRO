/* Cliente HTTP hacia el backend de Pedus (mismo origen, funciona en Render). */

async function request(path, options = {}) {
  const res = await fetch(path, options);
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const error = new Error((data && data.error) || `Error ${res.status}`);
    error.status = res.status;
    error.code = data && data.code;
    error.retryAfter = data && data.retryAfter;
    throw error;
  }
  return data;
}

export const api = {
  config: () => request('/api/config'),
  greeting: () => request('/api/greeting'),
  health: () => request('/api/health'),
  diagnostics: () => request('/api/diagnostics'),

  chat: (payload) =>
    request('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  speak: (text, voice) =>
    request('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    }),

  async transcribe(blob) {
    const res = await fetch('/api/transcribe?lang=es', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'audio/webm' },
      body: blob,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No pude transcribir el audio.');
    return data.text || '';
  },

  action: (tool, args) =>
    request('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args }),
    }),
};
