/**
 * Entrada de voz:
 *  - Micrófono con detección de voz (VAD por RMS) para grabar frases completas.
 *  - Detección de la wake word «Okey Pedus» con SpeechRecognition en segundo plano
 *    (si el navegador no lo soporta, se cae a modo pulsar-para-hablar).
 */

// Solo cuenta si aparece al principio de la frase: evita que cualquier
// conversación que mencione a Pedus lo despierte por accidente.
const WAKE_PATTERNS = [
  /^\s*(okey|okey\s*dokey|ok|okay|okei|hoykey|vale|oye|hey)\s*(pedus|pedros|petus|pedu)\b/i,
  /^\s*(pedus|pedros|petus)\b/i,
];

export const cleanWakeWord = (text = '') => {
  let out = String(text);
  out = out.replace(/^\s*(okey|ok|okay|okei|oye|hey)\s*(pedus|pedros|petus|pedu)[\s,.:;-]*/i, '');
  out = out.replace(/^\s*(pedus|pedros|petus)[\s,.:;-]+/i, '');
  return out.trim();
};

export const hasWakeWord = (text = '') => WAKE_PATTERNS.some((rx) => rx.test(text));

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
    this.rafId = null;
    this.level = 0;
    this.noiseFloor = 0.012;

    this.recognition = null;
    this.wakeActive = false;
    this.wakeDesired = false;
    this.paused = false;
    this.wakeRestartTimer = null;

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
    const loop = () => {
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
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
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
      this.startRecorder();
      const started = performance.now();
      let spokeAt = 0;
      let quietSince = 0;
      let done = false;

      const finish = (cancelled) => {
        if (done) return;
        done = true;
        clearInterval(timer);
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

      const timer = setInterval(() => {
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
      }, 60);
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
    rec.maxAlternatives = 3;

    rec.onresult = (event) => {
      if (this.recognition !== rec || this.paused) return;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || '';
        if (!transcript) continue;
        if (result.isFinal) {
          if (hasWakeWord(transcript)) this.onWake(cleanWakeWord(transcript));
        } else {
          this.onPartial(transcript);
          if (hasWakeWord(transcript)) this.onWake(cleanWakeWord(transcript), { partial: true });
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
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
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
