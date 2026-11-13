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
  version: '1.2.0',
  port: int(process.env.PORT, 3000),
  nodeEnv: process.env.NODE_ENV || 'development',

  groq: {
    apiKey: (process.env.GROQ_API_KEY || '').trim(),
    baseUrl: (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
    get enabled() {
      return this.apiKey.length > 0;
    },
  },

  models: {
    // Cerebro principal: rápido + tool calling fiable.
    chat: process.env.PEDUS_CHAT_MODEL || 'llama-3.3-70b-versatile',
    // Cerebro "profundo" para preguntas largas o razonamiento.
    deep: process.env.PEDUS_DEEP_MODEL || 'openai/gpt-oss-120b',
    // Respuestas ultra rápidas / confirmaciones.
    fast: process.env.PEDUS_FAST_MODEL || 'llama-3.1-8b-instant',
    // Modelo con visión para "oye Pedus, ¿qué ves?"
    vision: process.env.PEDUS_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
    // Sistema agéntico con búsqueda web incluida.
    research: process.env.PEDUS_RESEARCH_MODEL || 'groq/compound-mini',
    stt: process.env.PEDUS_STT_MODEL || 'whisper-large-v3-turbo',
    tts: process.env.PEDUS_TTS_MODEL || 'canopylabs/orpheus-v1-english',
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
  publicConfig() {
    return {
      version: this.version,
      models: this.models,
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
