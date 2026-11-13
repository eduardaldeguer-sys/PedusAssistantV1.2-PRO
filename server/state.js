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

/** IP del cliente según Express (respeta `trust proxy`, no se puede falsear con X-Forwarded-For). */
export function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
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
