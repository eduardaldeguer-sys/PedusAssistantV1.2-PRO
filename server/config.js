/**
 * Configuración central de PedusAssistant.
 * Todos los secretos viven SOLO en el servidor (variables de entorno).
 */

const bool = (v, fallback = false) =>
  v == null ? fallback : ['1', 'true', 'yes', 'on', 'si', 'sí'].includes(String(v).toLowerCase());

const int = (v, fallback) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  version: '1.2.1',
  port: int(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  // Nº de proxies de confianza delante del servidor (Render = 1).
  trustProxy: int(process.env.PEDUS_TRUST_PROXY, 1),
  // Clave opcional: si se define, la API solo responde a quien la envíe.
  accessKey: (process.env.PEDUS_ACCESS_KEY || '').trim(),

  groq: {
    apiKey: (process.env.GROQ_API_KEY || '').trim(),
    baseUrl: (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
    get enabled() {
      return this.apiKey.length > 0;
    },
  },

  // Modelos forzados por variable de entorno. Si se dejan vacíos (recomendado),
  // server/models.js elige solo entre los que Groq tenga activos en ese momento.
  models: {
    chat: (process.env.PEDUS_CHAT_MODEL || '').trim(),
    deep: (process.env.PEDUS_DEEP_MODEL || '').trim(),
    fast: (process.env.PEDUS_FAST_MODEL || '').trim(),
    vision: (process.env.PEDUS_VISION_MODEL || '').trim(),
    research: (process.env.PEDUS_RESEARCH_MODEL || '').trim(),
    stt: (process.env.PEDUS_STT_MODEL || '').trim(),
    tts: (process.env.PEDUS_TTS_MODEL || '').trim(),
  },

  // Voces de Orpheus disponibles en Groq (text-to-speech).
  ttsVoices: [
    { id: 'diana', label: 'Diana', gender: 'femenina' },
    { id: 'hannah', label: 'Hannah', gender: 'femenina' },
    { id: 'autumn', label: 'Autumn', gender: 'femenina' },
    { id: 'austin', label: 'Austin', gender: 'masculina' },
    { id: 'daniel', label: 'Daniel', gender: 'masculina' },
    { id: 'troy', label: 'Troy', gender: 'masculina' },
  ],
  defaultVoice: process.env.PEDUS_DEFAULT_VOICE || 'diana',

  github: {
    token: (process.env.GITHUB_TOKEN || '').trim(),
    defaultUser: (process.env.PEDUS_GITHUB_USER || '').trim(),
    get enabled() {
      return this.token.length > 0;
    },
  },

  limits: {
    maxMessageChars: int(process.env.PEDUS_MAX_MESSAGE_CHARS, 4000),
    maxImageBytes: int(process.env.PEDUS_MAX_IMAGE_BYTES, 6 * 1024 * 1024),
    maxAudioBytes: int(process.env.PEDUS_MAX_AUDIO_BYTES, 20 * 1024 * 1024),
    chatPerMinute: int(process.env.PEDUS_RATE_CHAT, 30),
    speakPerMinute: int(process.env.PEDUS_RATE_SPEAK, 90),
    transcribePerMinute: int(process.env.PEDUS_RATE_TRANSCRIBE, 30),
    maxHistoryMessages: int(process.env.PEDUS_MAX_HISTORY, 24),
  },

  features: {
    httpTools: bool(process.env.PEDUS_HTTP_TOOLS, true),
    openUrls: bool(process.env.PEDUS_ALLOW_OPEN_URLS, true),
  },

  /** Public-safe view used by the frontend. Never includes secrets. */
  publicConfig(models = {}) {
    return {
      version: this.version,
      models,
      authRequired: this.accessKey.length > 0,
      ttsVoices: this.ttsVoices,
      defaultVoice: this.defaultVoice,
      capabilities: {
        groq: this.groq.enabled,
        github: this.github.enabled,
        vision: true,
        speechToText: true,
        textToSpeech: true,
        webSearch: true,
      },
      githubUser: this.github.defaultUser || null,
      limits: {
        maxMessageChars: this.limits.maxMessageChars,
        maxImageBytes: this.limits.maxImageBytes,
      },
    };
  },
};
