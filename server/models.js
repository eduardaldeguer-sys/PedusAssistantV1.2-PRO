/**
 * Selección automática de modelos.
 *
 * Groq retira modelos con frecuencia, así que en vez de fiarnos de nombres fijos:
 *   1. Pedimos a Groq la lista real de modelos de la cuenta (GET /models).
 *   2. Para cada función (chat, visión, voz…) usamos el primero de la lista de
 *      preferencias que exista de verdad. La variable de entorno va primero.
 *   3. Si un modelo falla por estar retirado o sin acceso, se marca como malo
 *      y se prueba el siguiente sin que el usuario note nada.
 */

import { config } from './config.js';
import { UpstreamError, listModels } from './groq.js';

const PREFERENCES = {
  chat: [
    'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile',
    'moonshotai/kimi-k2-instruct-0905',
    'moonshotai/kimi-k2-instruct',
    'qwen/qwen3.8-27b',
    'qwen/qwen3.6-27b',
    'qwen/qwen3-32b',
    'openai/gpt-oss-20b',
    'llama-3.1-8b-instant',
  ],
  deep: [
    'openai/gpt-oss-120b',
    'moonshotai/kimi-k2-instruct-0905',
    'moonshotai/kimi-k2-instruct',
    'llama-3.3-70b-versatile',
    'qwen/qwen3.8-27b',
    'qwen/qwen3.6-27b',
    'qwen/qwen3-32b',
    'openai/gpt-oss-20b',
  ],
  fast: [
    'openai/gpt-oss-20b',
    'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile',
    'openai/gpt-oss-120b',
  ],
  vision: ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'],
  research: ['groq/compound-mini', 'groq/compound', 'compound-beta-mini', 'compound-beta'],
  stt: ['whisper-large-v3-turbo', 'whisper-large-v3'],
  tts: ['canopylabs/orpheus-v1-english', 'playai-tts'],
};

const NOT_CHAT = /whisper|tts|orpheus|guard|compound|embed|playai|allam|distil/i;
const isChat = (id) => !NOT_CHAT.test(id);

/** Si ningún preferido existe, se busca en el catálogo algo que sirva para esa función. */
const HEURISTICS = {
  chat: isChat,
  deep: isChat,
  fast: isChat,
  vision: (id) => /scout|maverick|vision/i.test(id),
  research: (id) => /compound/i.test(id),
  stt: (id) => /whisper/i.test(id),
  tts: (id) => /orpheus|tts/i.test(id) && !/arabic/i.test(id),
};

export const ROLES = Object.keys(PREFERENCES);

const CATALOG_TTL = 30 * 60_000;
const RETRY_AFTER_FAILURE = 60_000;
const BAD_TTL = 6 * 60 * 60_000;

let catalog = null; // Set con los ids disponibles, o null si no se pudo consultar
let fetchedAt = 0;
let pending = null;
const bad = new Map(); // id -> caduca en

const isBad = (id) => {
  const until = bad.get(id);
  if (!until) return false;
  if (until < Date.now()) {
    bad.delete(id);
    return false;
  }
  return true;
};

export function markBad(id, reason = '') {
  bad.set(id, Date.now() + BAD_TTL);
  console.warn(`[pedus] modelo descartado: ${id}${reason ? ` (${reason})` : ''}`);
}

export async function refreshCatalog({ force = false } = {}) {
  if (!config.groq.enabled) return null;
  const age = Date.now() - fetchedAt;
  if (!force && fetchedAt && age < (catalog ? CATALOG_TTL : RETRY_AFTER_FAILURE)) return catalog;
  pending ||= (async () => {
    try {
      const data = await listModels();
      const ids = (data?.data || [])
        .filter((m) => m && m.active !== false)
        .map((m) => m.id)
        .filter(Boolean);
      catalog = ids.length ? new Set(ids) : null;
    } catch (error) {
      console.warn('[pedus] no pude leer el catálogo de modelos de Groq:', error.message);
    } finally {
      fetchedAt = Date.now();
      pending = null;
    }
    return catalog;
  })();
  return pending;
}

/** Lista ordenada de modelos a probar para una función. */
export async function candidatesFor(role) {
  const cat = await refreshCatalog();
  const prefs = [...new Set([config.models[role], ...(PREFERENCES[role] || [])].filter(Boolean))];
  const usable = prefs.filter((id) => !isBad(id));
  if (!cat) return usable.length ? usable : prefs;

  const live = usable.filter((id) => cat.has(id));
  const extra = [...cat]
    .filter((id) => HEURISTICS[role]?.(id) && !live.includes(id) && !isBad(id))
    .sort();
  const out = [...live, ...extra];
  return out.length ? out : usable.length ? usable : prefs;
}

export async function modelFor(role) {
  return (await candidatesFor(role))[0];
}

/** ¿El error es culpa del modelo (retirado, sin acceso…) y no de la petición? */
export function isModelError(error) {
  if (!(error instanceof UpstreamError)) return false;
  if (error.upstreamStatus === 404) return true;
  if (/model_(not_found|decommissioned|terms_required|permission)/i.test(error.upstreamCode || '')) return true;
  return /decommission|deprecat|no longer (supported|available)|does not exist|do(es)? not have access|not found|terms acceptance|requires terms/i.test(
    error.message || '',
  );
}

/**
 * Ejecuta `fn(modelo)` probando candidatos hasta que uno funcione.
 * Solo cambia de modelo cuando el fallo es del propio modelo.
 */
export async function withModel(role, fn, { max = 3 } = {}) {
  const list = (await candidatesFor(role)).slice(0, max);
  let lastError;
  for (const model of list) {
    try {
      return { model, value: await fn(model) };
    } catch (error) {
      lastError = error;
      if (!isModelError(error)) throw error;
      markBad(model, error.message.slice(0, 120));
    }
  }
  throw lastError;
}

/** Resumen para /api/config y /api/diagnostics. */
export async function modelSummary() {
  const cat = await refreshCatalog();
  const out = {};
  for (const role of ROLES) {
    const model = await modelFor(role);
    out[role] = {
      model,
      available: cat ? cat.has(model) : null,
      configured: config.models[role] || null,
      configuredOk: config.models[role] ? (cat ? cat.has(config.models[role]) && !isBad(config.models[role]) : null) : null,
    };
  }
  return { catalogLoaded: Boolean(cat), catalogSize: cat?.size || 0, roles: out };
}

export async function resolvedModels() {
  const out = {};
  for (const role of ROLES) out[role] = await modelFor(role);
  return out;
}
