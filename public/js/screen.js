/**
 * Visión: captura de pantalla o cámara, recorte y compresión a data URL JPEG.
 * Usa getDisplayMedia (en ChromeOS el picker deja elegir ventana completa o pestaña).
 */

export class ScreenShare {
  constructor({ api, onCapture, onStop, onError }) {
    this.api = api;
    this.onCapture = onCapture || (() => {});
    this.onStop = onStop || (() => {});
    this.onError = onError || (() => {});
    this.stream = null;
    this.video = null;
    this.supported = Boolean(navigator.mediaDevices?.getDisplayMedia);
    this.lastFrame = null;
    this.busy = false;
  }

  get active() {
    return Boolean(this.stream);
  }

  async start() {
    if (!this.supported) throw new Error('Este navegador no permite compartir pantalla.');
    if (this.stream) return this.stream;
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 4, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    this.video = document.createElement('video');
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play().catch(() => {});

    this.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      this.stop();
      this.onStop();
    });
    return this.stream;
  }

  /** Captura un frame y lo comprime. Devuelve data URL. */
  async grab({ maxWidth = 1280, quality = 0.72 } = {}) {
    if (!this.stream) await this.start();
    if (!this.video?.videoWidth) await new Promise((r) => setTimeout(r, 420));

    const vw = this.video.videoWidth || 1280;
    const vh = this.video.videoHeight || 720;
    const scale = Math.min(1, maxWidth / vw);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    this.lastFrame = dataUrl;
    return dataUrl;
  }

  /** Captura + pregunta al backend. */
  async ask(question = '¿Qué ves en mi pantalla?') {
    if (this.busy) return null;
    this.busy = true;
    try {
      const image = await this.grab();
      this.onCapture(image);
      return image;
    } finally {
      this.busy = false;
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }
}

/** Redimensiona una imagen subida por el usuario. */
export async function fileToDataUrl(file, { maxWidth = 1280, quality = 0.75 } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    const scale = Math.min(1, maxWidth / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
