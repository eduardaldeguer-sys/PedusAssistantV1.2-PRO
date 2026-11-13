/**
 * Orpheus en Groq acepta ~200 caracteres por petición.
 * Partimos el texto en trozos que suenen naturales y los sintetizamos en paralelo.
 */

export const ORPHEUS_LIMIT = 190;
const MAX_CHUNKS = 14;
const MAX_CHARS = 2400;

export function splitForSpeech(text, limit = ORPHEUS_LIMIT) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHARS);
  if (!clean) return [];
  if (clean.length <= limit) return [clean];

  const sentences = clean.split(/(?<=[.!?…])\s+/);
  const chunks = [];
  let current = '';

  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const sentence of sentences) {
    if (sentence.length > limit) {
      push();
      // Corta por comas y luego por palabras.
      const parts = sentence.split(/(?<=[,;:])\s+/);
      let buf = '';
      for (const part of parts) {
        if ((buf + ' ' + part).trim().length > limit) {
          if (buf.trim()) chunks.push(buf.trim());
          buf = '';
          if (part.length > limit) {
            const words = part.split(' ');
            let w = '';
            for (const word of words) {
              if ((w + ' ' + word).trim().length > limit) {
                if (w.trim()) chunks.push(w.trim());
                w = word;
              } else {
                w = `${w} ${word}`.trim();
              }
            }
            if (w.trim()) buf = w;
          } else {
            buf = part;
          }
        } else {
          buf = `${buf} ${part}`.trim();
        }
      }
      if (buf.trim()) chunks.push(buf.trim());
      continue;
    }

    if ((current + ' ' + sentence).trim().length > limit) {
      push();
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  }
  push();

  return chunks.slice(0, MAX_CHUNKS).map((c) => c.slice(0, limit));
}
