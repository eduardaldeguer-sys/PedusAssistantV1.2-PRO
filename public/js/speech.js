/**
 * Voz de salida: audio neuronal de Groq (Orpheus) con fallback automático
 * a la voz del sistema (Web Speech API) si Groq TTS falla o no hay red.
 * Incluye ducking, cancelación e interrupciones.
 */

const b64ToBlob = (b64, mime = 'audio/wav') => {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

export class VoiceOut {
  constructor({ api, getSettings, onStart, onEnd, onLevel }) {
    this.api = api;
    this.getSettings = getSettings;
    this.onStart = onStart || (() => {});
    this.onEnd = onEnd || (() => {});
    this.onLevel = onLevel || (() => {});

    this.queue = [];
    this.current = null;
    this.playing = false;
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.rafId = null;
    this.source = null;
    this.generation = 0;
  }

  async ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.75;
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  /** Cancela cualquier audio en curso de inmediato. */
  stop() {
    this.generation += 1;
    this.queue = [];
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* ya parado */
      }
      this.source = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.playing = false;
    this.current = null;
    this.onLevel(0);
    this.onEnd();
  }

  /** Genera el audio, lo descarga y lo mete en cola. Empieza a sonar en cuanto llega el primer trozo. */
  async speak(text, { voice } = {}) {
    const clean = String(text || '').trim();
    if (!clean) return;
    this.generation += 1;
    const gen = this.generation;
    this.onStart();

    let chunks = null;
    try {
      const res = await this.api.speak(clean, voice || this.getSettings().voice);
      if (gen !== this.generation) return;
      chunks = res.chunks || [];
    } catch (error) {
      console.warn('[pedus] TTS de Groq no disponible:', error.message);
    }

    if (gen !== this.generation) return;

    if (chunks && chunks.length) {
      for (const chunk of chunks) {
        if (gen !== this.generation) return;
        this.queue.push(b64ToBlob(chunk.audio, chunk.mime || 'audio/wav'));
      }
      await this.drain(gen);
    } else {
      await this.speakWithSystem(clean, gen);
    }
  }

  async drain(gen) {
    while (this.queue.length && gen === this.generation) {
      const blob = this.queue.shift();
      await this.playBlob(blob, gen);
    }
    if (gen === this.generation) this.onEnd();
  }

  async playBlob(blob, gen) {
    const ctx = await this.ensureContext();
    const buffer = await blob.arrayBuffer();
    if (gen !== this.generation) return;
    const decoded = await ctx.decodeAudioData(buffer.slice(0)).catch(() => null);
    if (!decoded || gen !== this.generation) return;

    await new Promise((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.playbackRate.value = Math.min(1.5, Math.max(0.6, this.getSettings().rate || 1));
      src.connect(this.gain);
      this.gain.connect(this.analyser);
      this.source = src;
      this.playing = true;

      src.onended = () => {
        this.playing = false;
        if (this.source === src) this.source = null;
        resolve();
      };

      this.trackLevel(gen);
      src.start();
    });
  }

  trackLevel(gen) {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const loop = () => {
      if (gen !== this.generation) return;
      this.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i];
      const level = Math.min(1, sum / data.length / 90);
      this.onLevel(this.playing ? level : 0);
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  /** Fallback: la voz nativa del navegador/ChromeOS. */
  speakWithSystem(text, gen) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        this.onEnd();
        return resolve();
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = this.getSettings().lang || 'es-ES';
      utter.rate = this.getSettings().rate || 1;
      utter.pitch = 1.02;
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find((v) => v.lang === utter.lang && /google|monica|helena|paulina/i.test(v.name)) ||
        voices.find((v) => v.lang?.startsWith('es'));
      if (preferred) utter.voice = preferred;

      utter.onstart = () => this.onStart();
      utter.onend = () => {
        if (gen === this.generation) this.onEnd();
        resolve();
      };
      utter.onerror = () => {
        if (gen === this.generation) this.onEnd();
        resolve();
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    });
  }

  get isSpeaking() {
    return this.playing || (window.speechSynthesis?.speaking ?? false);
  }
}
