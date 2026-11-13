/**
 * Entrada de voz:
 *  - Micrófono con detección de voz (VAD por RMS) para grabar frases completas.
 *  - Detección de la wake word «Okey Pedus» con SpeechRecognition en segundo plano
 *    (si el navegador no lo soporta, se cae a modo pulsar-para-hablar).
 */

import { ticker } from './ticker.js';

/* ------------------------------------------------------------------ */
/* Wake word «Okey Pedus», tolerante                                   */
/* ------------------------------------------------------------------ */
// El reconocedor del navegador no conoce la palabra «Pedus» y la escribe de mil
// formas («pedos», «Pedro», «pe dos», «bedus»…), y «okey» igual («o key», «hockey»,
// «oye»…). En vez de una lista cerrada se compara por parecido.

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const TRIGGERS = new Set([
  'ok', 'okay', 'okey', 'oki', 'okei', 'oke', 'okis', 'okai', 'oquei', 'oquey', 'okeydokey', 'hockey', 'jockey', 'jokey',
  'hokey', 'oye', 'oie', 'oy', 'hey', 'ey', 'hei', 'ei', 'eh', 'hola', 'vale', 'key',
]);
const SPLIT_TRIGGER_TAIL = new Set(['key', 'k', 'que', 'kay', 'quey', 'ke', 'kei', 'quei']);
const TRIGGER_PREFIX = /^(okey|okay|okei|oke|ok|oye|hey)(?=.{4,})/;

const KNOWN_NAMES = new Set([
  'pedus', 'petus', 'pedros', 'pedu', 'peduz', 'bedus', 'pelus', 'pegus', 'pedius', 'pedrus', 'pedruz',
  'piedus', 'edus', 'perus', 'pethus', 'pedush', 'pedous', 'peddus', 'pedux', 'pedoz', 'pedys',
  'paedus', 'pedox', 'pe2', 'p2', 'pdos', 'pedusa', 'pezus', 'peuds', 'feduz',
  'fedus', 'tedus', 'medus', 'vedus', 'pidus', 'padus', 'pudus', 'peduce', 'peduso',
]);
// Palabras reales que el reconocedor pone en lugar de «Pedus»: solo valen con «okey» delante.
const WEAK_NAMES = new Set(['pedro', 'peros', 'perros', 'pelos', 'pedos', 'pedas', 'pedes', 'petos', 'pedis']);
// Palabras normales que se parecen demasiado: nunca cuentan como nombre por parecido.
const NOT_NAMES = new Set(['pero', 'pedir', 'pedal', 'pesos', 'peces', 'pedia', 'pides', 'puedes', 'puedo', 'pedido', 'pedid', 'bebes', 'besos', 'pedi', 'pide', 'perdon']);
const NAME_HEADS = new Set(['p', 'pe', 'pi', 'be', 'per', 'ped', 'pet']);

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** 2 = seguro que es «Pedus» · 1 = se parece (solo vale con «okey» delante) · 0 = no. */
function nameScore(token) {
  if (!token || NOT_NAMES.has(token)) return 0;
  if (KNOWN_NAMES.has(token)) return 2;
  if (WEAK_NAMES.has(token)) return 1;
  if (token.length < 4 || token.length > 7) return 0;
  const d = distance(token, 'pedus');
  if (d <= 1) return 2;
  if (d === 2 && /^[pb]/.test(token)) return 1;
  return 0;
}

/**
 * Busca la wake word en cualquier parte de la frase.
 * Devuelve null o { rest } con lo que se dijo después («okey pedus abre youtube» → «abre youtube»).
 * `strict` exige el «okey» delante (se usa mientras Pedus habla, para que no se despierte solo).
 */
export function findWake(text = '', { strict = false } = {}) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const tokens = words.map(norm);
  let hit = null;

  for (let i = 0; i < tokens.length; i += 1) {
    let token = tokens[i];
    let span = 1;
    let glued = false; // «okeypedus» todo junto

    const prefix = token.match(TRIGGER_PREFIX);
    if (prefix && nameScore(token.slice(prefix[1].length))) {
      token = token.slice(prefix[1].length);
      glued = true;
    }

    let score = nameScore(token);
    if (!score && NAME_HEADS.has(token) && tokens[i + 1]) {
      const joined = nameScore(token + tokens[i + 1]); // «pe dus», «pe dos», «p 2»
      if (joined) {
        score = joined;
        span = 2;
      }
    }
    if (!score) continue;

    const prev = tokens[i - 1];
    const triggered =
      glued || TRIGGERS.has(prev) || (SPLIT_TRIGGER_TAIL.has(prev) && tokens[i - 2] === 'o') || (prev === 'dokey' && TRIGGERS.has(tokens[i - 2]));
    // Con «okey» delante vale en cualquier sitio; el nombre solo, únicamente al empezar la frase.
    const accepted = triggered || (!strict && score === 2 && i === 0);
    if (accepted) hit = { end: i + span };
  }

  if (!hit) return null;
  return {
    rest: words
      .slice(hit.end)
      .join(' ')
      .replace(/^[\s,.:;!¡¿?-]+/, '')
      .trim(),
  };
}

export const hasWakeWord = (text = '', options) => Boolean(findWake(text, options));

/** Quita la wake word si la hay; si no, devuelve el texto tal cual. */
export const cleanWakeWord = (text = '') => {
  const found = findWake(text);
  return found ? found.rest : String(text).trim();
};

export class AudioInput {
  constructor({ getSettings, onLevel, onWake, onPartial, onError }) {
    this.getSettings = getSettings;
    this.onLevel = onLevel || (() => {});
    this.onWake = onWake || (() => {});
    this.onPartial = onPartial || (() => {});
    this.onError = onError || (() => {});

    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.stopMonitor = null;
    this.level = 0;
    this.noiseFloor = 0.012;

    this.recognition = null;
    this.wakeActive = false;
    this.wakeDesired = false;
    this.paused = false;
    this.wakeRestartTimer = null;
    this.wakeDebounce = null;
    this.strictWake = false; // mientras Pedus habla: exige «okey» delante

    this.recorder = null;
    this.chunks = [];
    this.recording = false;

    this.supported = Boolean(navigator.mediaDevices?.getUserMedia);
    this.speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  async enable() {
    if (this.stream) return this.stream;
    if (!this.supported) throw new Error('Este navegador no permite usar el micrófono.');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    this.setupAnalyser();
    return this.stream;
  }

  setupAnalyser() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    source.connect(this.analyser);
    this.monitor();
  }

  monitor() {
    const data = new Uint8Array(this.analyser.fftSize);
    let quietFrames = 0;
    this.stopMonitor?.();
    this.stopMonitor = ticker.add(() => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      this.level = rms;

      // Calibra el ruido de fondo cuando hay silencio sostenido.
      if (rms < 0.02) {
        quietFrames += 1;
        if (quietFrames > 30) this.noiseFloor = this.noiseFloor * 0.92 + rms * 0.08;
      } else {
        quietFrames = 0;
      }

      this.onLevel(Math.min(1, rms * 6));
    });
  }

  get threshold() {
    const sens = this.getSettings().sensitivity ?? 0.5;
    // sensibilidad alta (0.9) => umbral bajo
    const base = 0.055 - sens * 0.04;
    return Math.max(0.012, Math.min(0.09, base + this.noiseFloor * 1.4));
  }

  /* ------------------------- grabación con VAD ------------------------- */

  startRecorder() {
    if (!this.stream) throw new Error('Micrófono no iniciado.');
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(120);
    this.recording = true;
  }

  /**
   * Graba hasta detectar silencio sostenido tras haber hablado.
   * @returns {Promise<Blob|null>}
   */
  recordUntilSilence({ maxMs = 15000, minMs = 700, silenceMs = 1000 } = {}) {
    return new Promise((resolve) => {
      try {
        this.startRecorder();
      } catch (error) {
        this.onError(error);
        return resolve(null);
      }
      const started = performance.now();
      let spokeAt = 0;
      let quietSince = 0;
      let done = false;

      const finish = (cancelled) => {
        if (done) return;
        done = true;
        stopTick();
        const wasRecording = this.recording;
        this.recording = false;
        const rec = this.recorder;
        this.recorder = null;
        if (!rec) return resolve(null);
        rec.onstop = () => {
          const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' });
          this.chunks = [];
          if (cancelled || blob.size < 2200) return resolve(null);
          resolve(blob);
        };
        try {
          if (wasRecording) rec.stop();
          else resolve(null);
        } catch {
          resolve(null);
        }
      };

      this.cancelRecording = () => finish(true);

      // Va con el reloj compartido para que siga funcionando con la pestaña en segundo plano.
      const stopTick = ticker.add(() => {
        const now = performance.now();
        const elapsed = now - started;
        const loud = this.level > this.threshold;

        if (loud) {
          spokeAt = now;
          quietSince = 0;
        } else if (spokeAt && !quietSince) {
          quietSince = now;
        }

        if (elapsed > maxMs) return finish(false);
        if (spokeAt && now - spokeAt > 400 && quietSince && now - quietSince > silenceMs && elapsed > minMs) {
          return finish(false);
        }
        // Nada de voz en 6 s: no gastes tokens.
        if (!spokeAt && elapsed > 6000) return finish(true);
      });
    });
  }

  /* ------------------------- wake word ------------------------- */

  startWake() {
    this.wakeDesired = true;
    if (!this.speechSupported || this.wakeActive) return this.wakeActive;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new Recognition();
    rec.lang = this.getSettings().lang || 'es-ES';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 5;

    // Los resultados parciales llegan a medias («okey pedus abre…»). Si actuáramos con ellos
    // mandaríamos frases cortadas, así que esperamos al resultado final, o a que la frase
    // deje de crecer durante un momento.
    const fire = (rest) => {
      clearTimeout(this.wakeDebounce);
      this.wakeDebounce = null;
      this.onWake(rest);
    };

    rec.onresult = (event) => {
      if (this.recognition !== rec || this.paused) return;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        // Se miran todas las alternativas: a veces «Pedus» solo aparece en la segunda.
        let wake = null;
        for (let j = 0; j < result.length && !wake; j += 1) {
          wake = findWake(result[j]?.transcript || '', { strict: this.strictWake });
        }
        if (result.isFinal) {
          if (wake) fire(wake.rest);
          continue;
        }
        this.onPartial(result[0]?.transcript || '', Boolean(wake));
        if (wake) {
          // Solo «Okey Pedus»: reacciona pronto. Con frase detrás: espera a que termine.
          const wait = wake.rest.length > 2 ? 1300 : 550;
          clearTimeout(this.wakeDebounce);
          this.wakeDebounce = setTimeout(() => {
            if (this.recognition === rec && !this.paused) fire(wake.rest);
          }, wait);
        }
      }
    };

    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.wakeActive = false;
        this.wakeDesired = false;
        this.recognition = null;
        this.onError(new Error('Permiso de micrófono denegado para la wake word.'));
        return;
      }
      if (['no-speech', 'aborted', 'network'].includes(event.error)) return;
      this.onError(new Error(`Reconocimiento: ${event.error}`));
    };

    // Chrome corta la sesión cada cierto tiempo: la reabrimos si la seguimos queriendo.
    rec.onend = () => {
      if (this.recognition !== rec) return;
      this.wakeActive = false;
      this.recognition = null;
      if (!this.wakeDesired || this.paused) return;
      clearTimeout(this.wakeRestartTimer);
      this.wakeRestartTimer = setTimeout(() => {
        if (this.wakeDesired && !this.paused) this.startWake();
      }, 300);
    };

    try {
      rec.start();
      this.recognition = rec;
      this.wakeActive = true;
      return true;
    } catch {
      this.wakeActive = false;
      this.recognition = null;
      return false;
    }
  }

  stopWake() {
    clearTimeout(this.wakeDebounce);
    this.wakeDesired = false;
    this.wakeActive = false;
    clearTimeout(this.wakeRestartTimer);
    const rec = this.recognition;
    this.recognition = null;
    if (rec) {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Pausa la wake word mientras Pedus habla o grabamos una frase
   * (para no oírse a sí mismo y no pelear por el micrófono).
   */
  pauseWake(paused) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      clearTimeout(this.wakeDebounce);
      clearTimeout(this.wakeRestartTimer);
      const rec = this.recognition;
      this.recognition = null;
      this.wakeActive = false;
      if (rec) {
        try {
          rec.abort();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (this.wakeDesired && !this.wakeActive) this.startWake();
  }

  /** Una frase corta directa con el reconocedor del sistema (respuesta rápida). */
  listenOnce({ timeoutMs = 8000 } = {}) {
    return new Promise((resolve) => {
      if (!this.speechSupported) return resolve(null);
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new Recognition();
      rec.lang = this.getSettings().lang || 'es-ES';
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
        resolve(value);
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      rec.onresult = (e) => done(e.results?.[0]?.[0]?.transcript || null);
      rec.onerror = () => done(null);
      rec.onend = () => done(null);
      try {
        rec.start();
      } catch {
        done(null);
      }
    });
  }

  stop() {
    this.stopWake();
    this.stopMonitor?.();
    this.stopMonitor = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
