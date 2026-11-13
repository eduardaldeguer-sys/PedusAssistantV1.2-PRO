/**
 * Voz de salida: audio neuronal de Groq con fallback automático a la voz del sistema
 * (Web Speech API) si Groq TTS falla o no hay red.
 * El audio llega en streaming: empieza a sonar con el primer trozo.
 */

import { ticker } from './ticker.js';

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
    this.stopLevel = null;
    this.abort = null;
    this.pumping = null;
    this.pumpGen = -1;
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
      this.gain.connect(this.analyser);
    }
    if (this.ctx.state === 'suspended') {
      // Sin un gesto previo Chrome puede dejar resume() colgado: no esperamos para siempre.
      await Promise.race([this.ctx.resume(), new Promise((r) => setTimeout(r, 500))]);
      if (this.ctx.state === 'suspended') throw new Error('El navegador aún no deja reproducir audio.');
    }
    return this.ctx;
  }

  /** Tono corto para confirmar que ha oído «Okey Pedus» sin tener que mirar la pantalla. */
  async chime() {
    try {
      const ctx = await this.ensureContext();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      for (const [freq, at] of [[660, 0], [990, 0.07]]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start(now + at);
        osc.stop(now + 0.24);
      }
    } catch {
      /* sin audio todavía */
    }
  }

  /** Para todo lo que suena sin avisar a la interfaz (uso interno). */
  halt() {
    this.generation += 1;
    this.queue = [];
    if (this.abort) {
      this.abort.abort();
      this.abort = null;
    }
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* ya parado */
      }
      this.source = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this.stopLevel?.();
    this.stopLevel = null;
    this.playing = false;
    this.onLevel(0);
  }

  /** Cancela cualquier audio en curso de inmediato. */
  stop() {
    this.halt();
    this.onEnd();
  }

  /** Pide el audio y lo va reproduciendo según llega. Si Groq falla, usa la voz del sistema. */
  async speak(text, { voice } = {}) {
    const clean = String(text || '').trim();
    if (!clean) return;
    this.halt(); // si ya estaba hablando, se corta: manda lo último
    const gen = this.generation;
    this.onStart();

    const settings = this.getSettings();
    if (settings.engine === 'system') return this.speakWithSystem(clean, gen);

    let received = 0;
    try {
      await this.ensureContext();
      this.abort = new AbortController();
      received = await this.api.speakStream(
        clean,
        voice || settings.voice,
        (chunk) => {
          if (gen !== this.generation) return;
          this.queue.push(b64ToBlob(chunk.audio, chunk.mime || 'audio/wav'));
          this.pump(gen);
        },
        this.abort.signal,
      );
    } catch (error) {
      if (gen !== this.generation) return;
      console.warn('[pedus] TTS de Groq no disponible:', error.message);
    }
    if (gen !== this.generation) return;

    if (!received) return this.speakWithSystem(clean, gen);

    // Espera a que termine de sonar todo lo que queda en cola.
    while (gen === this.generation && (this.queue.length || this.pumpGen === gen)) {
      await this.pump(gen);
    }
    if (gen === this.generation) {
      this.stopLevel?.();
      this.stopLevel = null;
      this.onLevel(0);
      this.onEnd();
    }
  }

  /** Reproduce la cola en orden. Solo hay una bomba activa por generación. */
  pump(gen) {
    if (this.pumping && this.pumpGen === gen) return this.pumping;
    this.pumpGen = gen;
    const job = (async () => {
      while (this.queue.length && gen === this.generation) {
        await this.playBlob(this.queue.shift(), gen);
      }
      if (this.pumpGen === gen) {
        this.pumping = null;
        this.pumpGen = -1;
      }
    })();
    this.pumping = job;
    return job;
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
    if (this.stopLevel) return;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.stopLevel = ticker.add(() => {
      if (gen !== this.generation) return;
      this.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i];
      const level = Math.min(1, sum / data.length / 90);
      this.onLevel(this.playing ? level : 0);
    });
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

      // La voz del sistema no da nivel de audio: lo simulamos para que el orbe reaccione.
      const stopPulse = ticker.add((now) => {
        if (gen === this.generation) this.onLevel(0.28 + 0.22 * Math.abs(Math.sin(now / 130)) + Math.random() * 0.08);
      });
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        stopPulse();
        if (gen === this.generation) {
          this.onLevel(0);
          this.onEnd();
        }
        resolve();
      };
      const watchdog = setTimeout(finish, Math.min(90_000, 4000 + text.length * 110));
      utter.onend = finish;
      utter.onerror = finish;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    });
  }

  get isSpeaking() {
    return this.playing || (window.speechSynthesis?.speaking ?? false);
  }
}
