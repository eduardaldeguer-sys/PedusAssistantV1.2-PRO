import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { UpstreamError, chatCompletion, speechChunk, transcribe } from './groq.js';
import { runAgent } from './agent.js';
import { splitForSpeech } from './speech.js';
import { greeting } from './persona.js';
import { clientKey, health, healthSnapshot, rateLimit } from './state.js';
import { executeTool, toolDefinitions } from './tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

/* ------------------------------ middlewares ------------------------------ */

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  // Sin X-Frame-Options: la app se puede incrustar (útil en paneles y en previews).
  res.setHeader('Permissions-Policy', 'microphone=(self), display-capture=(self), camera=(self)');
  next();
});

// El audio llega como binario crudo (blob de MediaRecorder);
// el resto de /api habla JSON. body-parser marca `req._body`, así que no se pisan.
app.use(
  '/api/transcribe',
  express.raw({ type: ['audio/*', 'application/octet-stream', 'application/octet-stream;*'], limit: config.limits.maxAudioBytes }),
);
app.use('/api', express.json({ limit: '12mb' }));
app.use(express.static(PUBLIC_DIR, { maxAge: '1h', extensions: ['html'] }));

function limit(req, res, kind) {
  const max =
    { chat: config.limits.chatPerMinute, speak: config.limits.speakPerMinute, transcribe: config.limits.transcribePerMinute }[kind] ||
    30;
  const check = rateLimit({ key: `${kind}:${clientKey(req)}`, max, windowMs: 60_000 });
  if (!check.allowed) {
    res.status(429).json({
      error: 'Vas demasiado rápido. Dame un segundo.',
      code: 'rate_limited',
      retryAfter: check.retryAfter,
    });
    return false;
  }
  return true;
}

function fail(res, error) {
  if (error instanceof UpstreamError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  console.error('[pedus] error:', error);
  res.status(500).json({ error: error?.message || 'Error interno de Pedus.', code: 'internal_error' });
}

/* --------------------------------- API ---------------------------------- */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'pedus-assistant',
    ...healthSnapshot(),
    groqConfigured: config.groq.enabled,
  });
});

app.get('/api/config', (req, res) => {
  res.json(config.publicConfig());
});

app.get('/api/greeting', (req, res) => {
  res.json({ text: greeting() });
});

app.post('/api/chat', async (req, res) => {
  if (!limit(req, res, 'chat')) return;
  const { message = '', history = [], memory = [], settings = {}, image = null, timezone, mode = 'auto' } = req.body || {};

  if (/^https?:/.test(image || '')) {
    return res.status(400).json({ error: 'La imagen debe enviarse como data URL base64.', code: 'bad_image' });
  }
  if (image && image.length * 0.75 > config.limits.maxImageBytes) {
    return res.status(413).json({ error: 'La captura es demasiado grande. Prueba con una zona más pequeña.', code: 'image_too_big' });
  }

  try {
    const result = await runAgent({ message, history, memory, settings, image, timezone, mode });
    res.json(result);
  } catch (error) {
    fail(res, error);
  }
});

/** Síntesis de voz troceada para Orpheus. */
app.post('/api/speak', async (req, res) => {
  if (!limit(req, res, 'speak')) return;
  const { text = '', voice } = req.body || {};
  const chunks = splitForSpeech(text);
  if (!chunks.length) return res.status(400).json({ error: 'Nada que decir.', code: 'empty_text' });

  try {
    const audios = await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const upstream = await speechChunk(chunk, { voice });
          const buffer = Buffer.from(await upstream.arrayBuffer());
          return { text: chunk, audio: buffer.toString('base64'), mime: upstream.headers.get('content-type') || 'audio/wav' };
        } catch (error) {
          return { text: chunk, error: error.message };
        }
      }),
    );
    const ok = audios.filter((a) => a.audio);
    if (!ok.length) {
      return res.status(502).json({
        error: 'La voz de Groq no está disponible ahora mismo. ¿Tienes activado canopylabs/orpheus-v1-english?',
        code: 'tts_failed',
        details: audios.map((a) => a.error).filter(Boolean),
      });
    }
    res.json({ voice: voice || config.defaultVoice, chunks: ok, failed: audios.filter((a) => !a.audio).length });
  } catch (error) {
    fail(res, error);
  }
});

/** Transcripción (Whisper) — acepta el blob de MediaRecorder tal cual. */
app.post('/api/transcribe', async (req, res) => {
  if (!limit(req, res, 'transcribe')) return;
  if (!Buffer.isBuffer(req.body) || req.body.length < 1200) {
    return res.status(400).json({ error: 'Audio demasiado corto o vacío.', code: 'audio_too_short' });
  }
  try {
    const file = new File([req.body], 'chunk.webm', { type: req.headers['content-type'] || 'audio/webm' });
    const data = await transcribe(file, { language: req.query.lang || 'es' });
    res.json({ text: (data?.text || '').trim(), language: data?.language || req.query.lang || 'es' });
  } catch (error) {
    fail(res, error);
  }
});

/** Preguntas rápidas sin historia, para respuestas instantáneas. */
app.post('/api/quick', async (req, res) => {
  if (!limit(req, res, 'chat')) return;
  const { message = '' } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Falta el mensaje.' });
  try {
    const data = await chatCompletion({
      model: config.models.fast,
      messages: [
        { role: 'system', content: 'Responde en español, en una sola frase corta y natural para leer en voz alta.' },
        { role: 'user', content: String(message).slice(0, 500) },
      ],
      temperature: 0.5,
      maxTokens: 160,
    });
    res.json({ reply: data?.choices?.[0]?.message?.content?.trim() || '' });
  } catch (error) {
    fail(res, error);
  }
});

/** Ejecuta acciones dirigidas por comandos personalizados (sin pasar por el modelo). */
app.post('/api/action', async (req, res) => {
  const { tool, args = {} } = req.body || {};
  if (!tool || typeof tool !== 'string') return res.status(400).json({ error: 'Falta la herramienta.' });
  if (!toolDefinitions.some((t) => t.function.name === tool)) {
    return res.status(400).json({ error: `Herramienta no permitida: ${tool}`, code: 'tool_not_allowed' });
  }
  try {
    const out = await executeTool(tool, args, {});
    res.json(out);
  } catch (error) {
    fail(res, error);
  }
});

/** Diagnóstico opcional de Groq (solo si está configurado). */
app.get('/api/diagnostics', async (req, res) => {
  if (!config.groq.enabled) {
    return res.json({ groqConfigured: false, hint: 'Añade GROQ_API_KEY en Render → Environment.' });
  }
  try {
    const data = await chatCompletion({
      model: config.models.fast,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 5,
      temperature: 0,
    });
    health.groqOk = Boolean(data?.choices?.length);
    health.lastGroqCheck = new Date().toISOString();
    res.json({
      groqConfigured: true,
      models: config.models,
      voice: config.defaultVoice,
      githubToken: config.github.enabled,
      sample: data?.choices?.[0]?.message?.content?.slice(0, 60),
    });
  } catch (error) {
    health.groqOk = false;
    health.lastGroqCheck = new Date().toISOString();
    fail(res, error);
  }
});

/* ------------------------------- fallbacks ------------------------------- */

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint no encontrado.', code: 'not_found' }));

app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Ese archivo es demasiado grande.', code: 'payload_too_large' });
  }
  fail(res, error);
});

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`PedusAssistant ${config.version} escuchando en 0.0.0.0:${config.port}`);
  console.log(`Groq: ${config.groq.enabled ? 'configurado ✓' : 'FALTA GROQ_API_KEY ✗'} | GitHub: ${config.github.enabled ? 'token ✓' : 'sin token (límite público)'}`);
});

const shutdown = (signal) => {
  console.log(`\n${signal} recibido, cerrando...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
