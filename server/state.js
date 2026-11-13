/**
 * Utilidades de estado: configuración pública, rate limit y health.
 */

const buckets = new Map();

/** Token bucket sencillo en memoria (suficiente para un servicio de un proceso). */
export function rateLimit({ key, max, windowMs }) {
  const now = Date.now();
  const bucketKey = `${key}:${Math.floor(now / windowMs)}`;
  const used = (buckets.get(bucketKey) || 0) + 1;
  buckets.set(bucketKey, used);

  if (buckets.size > 5000) {
    for (const k of buckets.keys()) {
      if (!k.endsWith(`:${Math.floor(now / windowMs)}`)) buckets.delete(k);
    }
  }

  if (used > max) {
    return {
      allowed: false,
      retryAfter: Math.ceil((windowMs - (now % windowMs)) / 1000),
    };
  }
  return { allowed: true };
}

export function clientKey(req) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  return ip;
}

export const health = {
  startedAt: Date.now(),
  groqOk: null,
  lastGroqCheck: null,
};

export function healthSnapshot() {
  return {
    status: 'ok',
    uptimeSeconds: Math.round((Date.now() - health.startedAt) / 1000),
    startedAt: new Date(health.startedAt).toISOString(),
    groq: {
      reachable: health.groqOk,
      checkedAt: health.lastGroqCheck,
    },
  };
}
