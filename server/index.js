import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { UpstreamError, chatCompletion, speechChunk, transcribe } from './groq.js';
import { runAgent } from './agent.js';
import { splitForSpeech } from './speech.js';
import { greeting } from './persona.js';
import { clientKey, health, healthSnapshot, rateLimit } from './state.js';
import { executeTool, toolDefinitions } from './tools.js';
import { modelSummary, refreshCatalog, resolvedModels, withModel } from './models.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

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

const LIMITS = {
  chat: config.limits.chatPerMinute,
  speak: config.limits.speakPerMinute,
  transcribe: config.limits.transcribePerMinute,
  action: config.limits.chatPerMinute,
  diagnostics: 6,
};

function limit(req, res, kind) {
  const max = LIMITS[kind] || 30;
  // Por IP y, además, un tope global: aunque alguien rote IPs no puede vaciar la cuenta de Groq.
  const perIp = rateLimit({ key: `${kind}:${clientKey(req)}`, max, windowMs: 60_000 });
  const global = rateLimit({ key: `${kind}:*`, max: max * 4, windowMs: 60_000 });
  const check = !perIp.allowed ? perIp : global;
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

/* Clave de acceso opcional (PEDUS_ACCESS_KEY): protege todo lo que gasta tokens. */
const OPEN_PATHS = new Set(['/health', '/config']);
const sameKey = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
app.use('/api', (req, res, next) => {
  if (!config.accessKey || OPEN_PATHS.has(req.path)) return next();
  if (sameKey(req.headers['x-pedus-key'] || '', config.accessKey)) return next();
  res.status(401).json({ error: 'Este Pedus está protegido con clave de acceso.', code: 'auth_required' });
});

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

app.get('/api/config', async (req, res) => {
  try {
    res.json(config.publicConfig(await resolvedModels()));
  } catch (error) {
    fail(res, error);
  }
});

app.get('/api/greeting', (req, res) => {
  res.json({ text: greeting(String(req.query.tz || 'Europe/Madrid')) });
});

app.post('/api/chat', async (req, res) => {
  if (!limit(req, res, 'chat')) return;
  const { message = '', history = [], memory = [], settings = {}, image = null, timezone, mode = 'auto' } = req.body || {};

  if (image && (typeof image !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image))) {
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

/**
 * Síntesis de voz troceada.
 * Con `stream: true` responde en NDJSON: cada trozo de audio sale en cuanto está listo,
 * así Pedus empieza a hablar sin esperar a toda la respuesta.
 */
app.post('/api/speak', async (req, res) => {
  if (!limit(req, res, 'speak')) return;
  const { text = '', voice, stream = false } = req.body || {};
  const chunks = splitForSpeech(text);
  if (!chunks.length) return res.status(400).json({ error: 'Nada que decir.', code: 'empty_text' });
  const voiceId = config.ttsVoices.some((v) => v.id === voice) ? voice : config.defaultVoice;

  const toAudio = async (upstream, chunk) => ({
    text: chunk,
    audio: Buffer.from(await upstream.arrayBuffer()).toString('base64'),
    mime: upstream.headers.get('content-type') || 'audio/wav',
  });

  // El primer trozo decide qué modelo de voz funciona; el resto va en paralelo con ese.
  let first;
  let model;
  try {
    const out = await withModel('tts', (m) => speechChunk(chunks[0], { voice: voiceId, model: m }));
    model = out.model;
    first = await toAudio(out.value, chunks[0]);
  } catch (error) {
    return res.status(502).json({
      error: 'La voz de Groq no está disponible ahora mismo. Uso la voz del sistema.',
      code: 'tts_failed',
      details: [error.message],
    });
  }

  const rest = chunks.slice(1).map((chunk) =>
    speechChunk(chunk, { voice: voiceId, model })
      .then((upstream) => toAudio(upstream, chunk))
      .catch((error) => ({ text: chunk, error: error.message })),
  );

  if (!stream) {
    const all = [first, ...(await Promise.all(rest))];
    return res.json({ voice: voiceId, model, chunks: all.filter((a) => a.audio), failed: all.filter((a) => !a.audio).length });
  }

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Accel-Buffering': 'no',
  });
  let failed = 0;
  res.write(`${JSON.stringify({ type: 'chunk', ...first })}\n`);
  for (const job of rest) {
    const item = await job; // en orden, aunque se generen en paralelo
    if (res.destroyed) return;
    if (item.audio) res.write(`${JSON.stringify({ type: 'chunk', ...item })}\n`);
    else failed += 1;
  }
  res.end(`${JSON.stringify({ type: 'end', voice: voiceId, model, failed })}\n`);
});

const AUDIO_EXT = { webm: 'webm', mp4: 'm4a', mpeg: 'mp3', ogg: 'ogg', wav: 'wav', 'x-wav': 'wav', flac: 'flac' };

/** Transcripción (Whisper) — acepta el blob de MediaRecorder tal cual. */
app.post('/api/transcribe', async (req, res) => {
  if (!limit(req, res, 'transcribe')) return;
  if (!Buffer.isBuffer(req.body) || req.body.length < 1200) {
    return res.status(400).json({ error: 'Audio demasiado corto o vacío.', code: 'audio_too_short' });
  }
  try {
    const type = String(req.headers['content-type'] || 'audio/webm');
    const ext = AUDIO_EXT[(type.match(/audio\/([\w-]+)/) || [])[1]] || 'webm';
    const lang = /^[a-z]{2}$/i.test(req.query.lang || '') ? req.query.lang : 'es';
    const file = new File([req.body], `voz.${ext}`, { type });
    const { value: data } = await withModel('stt', (model) => transcribe(file, { language: lang, model }));
    res.json({ text: (data?.text || '').trim(), language: data?.language || lang });
  } catch (error) {
    fail(res, error);
  }
});

/** Ejecuta acciones dirigidas por comandos personalizados (sin pasar por el modelo). */
app.post('/api/action', async (req, res) => {
  if (!limit(req, res, 'action')) return;
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

/** Diagnóstico: qué modelo se usa para cada cosa y si Groq responde de verdad. */
app.get('/api/diagnostics', async (req, res) => {
  if (!limit(req, res, 'diagnostics')) return;
  if (!config.groq.enabled) {
    return res.json({ groqConfigured: false, hint: 'Añade GROQ_API_KEY en Render → Environment.' });
  }
  try {
    await refreshCatalog({ force: true });
    const { model, value: data } = await withModel('chat', (m) =>
      chatCompletion({ model: m, messages: [{ role: 'user', content: 'Di solo: ok' }], maxTokens: 200, temperature: 0 }),
    );
    health.groqOk = Boolean(data?.choices?.length);
    health.lastGroqCheck = new Date().toISOString();
    const summary = await modelSummary();
    const warnings = Object.entries(summary.roles)
      .filter(([, r]) => r.configured && r.configuredOk === false)
      .map(([role, r]) => `${role}: «${r.configured}» ya no está disponible en Groq, uso «${r.model}».`);
    res.json({
      groqConfigured: true,
      ok: health.groqOk,
      testedModel: model,
      models: Object.fromEntries(Object.entries(summary.roles).map(([role, r]) => [role, r.model])),
      catalogLoaded: summary.catalogLoaded,
      detail: summary.roles,
      warnings,
      voice: config.defaultVoice,
      githubToken: config.github.enabled,
      sample: (data?.choices?.[0]?.message?.content || '').slice(0, 60),
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
  console.log(`Groq: ${config.groq.enabled ? 'configurado ✓' : 'FALTA GROQ_API_KEY ✗'} | GitHub: ${config.github.enabled ? 'token ✓' : 'sin token (límite público)'} | Clave de acceso: ${config.accessKey ? 'sí ✓' : 'no (API abierta)'}`);
  if (config.groq.enabled) {
    modelSummary()
      .then((summary) => {
        for (const [role, r] of Object.entries(summary.roles)) {
          const note = r.configured && r.configuredOk === false ? `  ⚠ ${r.configured} no disponible, sustituido` : '';
          console.log(`  modelo ${role.padEnd(8)} → ${r.model}${note}`);
        }
        if (!summary.catalogLoaded) console.log('  (no pude leer el catálogo de Groq; uso la lista por defecto)');
      })
      .catch(() => {});
  }
});

const shutdown = (signal) => {
  console.log(`\n${signal} recibido, cerrando...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
