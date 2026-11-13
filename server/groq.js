import { config } from './config.js';

export class UpstreamError extends Error {
  constructor(message, { status = 502, code = 'upstream_error', retryAfter } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

async function request(path, { method = 'POST', body, headers = {}, timeoutMs = 60_000, raw = false, retries = 2 } = {}) {
  if (!config.groq.enabled) {
    throw new UpstreamError(
      'Falta GROQ_API_KEY en el servidor. Añádela en Render → Environment para activar el cerebro de Pedus.',
      { status: 503, code: 'missing_groq_key' },
    );
  }

  const url = `${config.groq.baseUrl}${path}`;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${config.groq.apiKey}`,
          ...(body != null && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body == null ? undefined : body instanceof FormData ? body : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          /* not json */
        }
        const message =
          parsed?.error?.message || parsed?.message || text.slice(0, 400) || `Groq respondió ${res.status}`;
        const err = new UpstreamError(message, {
          status: res.status === 429 ? 429 : RETRYABLE_STATUS.has(res.status) ? 502 : 400,
          code: res.status === 429 ? 'rate_limited' : 'groq_error',
          retryAfter: res.headers.get('retry-after'),
        });
        if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
          lastError = err;
          await sleep(400 * 2 ** attempt);
          continue;
        }
        throw err;
      }

      if (raw) return res;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) return await res.json();
      return await res.text();
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      const aborted = error?.name === 'AbortError';
      lastError = new UpstreamError(
        aborted ? 'Groq tardó demasiado en responder. Prueba otra vez.' : `No se pudo contactar con Groq: ${error.message}`,
        { status: 504, code: aborted ? 'timeout' : 'network_error' },
      );
      if (attempt < retries) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chat completion (non-streaming and streaming). */
export function chatCompletion({ model, messages, tools, toolChoice, temperature = 0.6, maxTokens = 1024, stream = false, responseFormat }) {
  return request('/chat/completions', {
    body: {
      model,
      messages,
      ...(temperature != null ? { temperature } : {}),
      ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
      ...(tools?.length ? { tools, tool_choice: toolChoice || 'auto' } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
      stream,
    },
    raw: stream,
  });
}

/** Whisper transcription. Accepts a Blob/File. */
export async function transcribe(file, { model = config.models.stt, language = 'es', prompt } = {}) {
  const form = new FormData();
  form.append('file', file, file.name || 'audio.webm');
  form.append('model', model);
  if (language) form.append('language', language);
  form.append('response_format', 'json');
  form.append('temperature', '0');
  if (prompt) form.append('prompt', String(prompt).slice(0, 900));
  return request('/audio/transcriptions', { body: form, timeoutMs: 90_000 });
}

/** Orpheus TTS. Returns an array of audio chunks capped at the model limit. */
export function speechChunk(text, { voice } = {}) {
  return request('/audio/speech', {
    headers: { Accept: 'audio/wav' },
    body: {
      model: config.models.tts,
      input: text,
      voice: voice || config.defaultVoice,
      response_format: 'wav',
    },
    raw: true,
    timeoutMs: 60_000,
  });
}

export async function listModels() {
  return request('/models', { method: 'GET', timeoutMs: 20_000 });
}
