/* Cliente HTTP hacia el backend de Pedus (mismo origen, funciona en Render). */

const KEY_STORE = 'pedus.key';

const savedKey = () => {
  try {
    return localStorage.getItem(KEY_STORE) || '';
  } catch {
    return '';
  }
};

/** fetch con la clave de acceso; si el servidor la pide (401), la pregunta una vez y reintenta. */
async function authFetch(path, options = {}, retry = true) {
  const key = savedKey();
  const res = await fetch(path, { ...options, headers: { ...(options.headers || {}), ...(key ? { 'X-Pedus-Key': key } : {}) } });
  if (res.status === 401 && retry) {
    const typed = window.prompt('Este Pedus está protegido. Escribe la clave de acceso:');
    if (typed) {
      try {
        localStorage.setItem(KEY_STORE, typed.trim());
      } catch {
        /* almacenamiento bloqueado */
      }
      return authFetch(path, options, false);
    }
  }
  return res;
}

async function request(path, options = {}) {
  const res = await authFetch(path, options);
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

const json = (payload) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const api = {
  config: () => request('/api/config'),
  greeting: (tz) => request(`/api/greeting?tz=${encodeURIComponent(tz || 'Europe/Madrid')}`),
  health: () => request('/api/health'),
  diagnostics: () => request('/api/diagnostics'),
  chat: (payload) => request('/api/chat', json(payload)),
  action: (tool, args) => request('/api/action', json({ tool, args })),

  /**
   * Voz en streaming: llama a onChunk({ audio, mime, text }) con cada trozo en cuanto llega.
   * Devuelve cuántos trozos se han recibido.
   */
  async speakStream(text, voice, onChunk, signal) {
    const res = await authFetch('/api/speak', { ...json({ text, voice, stream: true }), signal });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Error ${res.status}`);
    }
    let count = 0;
    const emit = (item) => {
      if (item?.audio) {
        count += 1;
        onChunk(item);
      }
    };

    // Servidor antiguo o proxy que no deja hacer streaming: JSON normal.
    if (!(res.headers.get('content-type') || '').includes('ndjson') || !res.body) {
      const data = await res.json().catch(() => ({}));
      for (const chunk of data.chunks || []) emit(chunk);
      return count;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const flush = (line) => {
      if (!line.trim()) return;
      try {
        emit(JSON.parse(line));
      } catch {
        /* línea incompleta */
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        flush(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    flush(buffer);
    return count;
  },

  async transcribe(blob) {
    const res = await authFetch('/api/transcribe?lang=es', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'audio/webm' },
      body: blob,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No pude transcribir el audio.');
    return data.text || '';
  },
};
