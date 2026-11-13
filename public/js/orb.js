/**
 * El orbe: una esfera de cristal con luces líquidas dentro (estilo Siri),
 * dibujada en un <canvas>. Reacciona en tiempo real al volumen:
 *   - idle       respira despacio, colores fríos y tenues
 *   - listening  se aviva con TU voz (azules y cian)
 *   - thinking   las luces giran deprisa (violetas)
 *   - speaking   late con la voz de Pedus (rosas y naranjas)
 * pulse() lanza una onda cuando oye «Okey Pedus».
 */

const PALETTES = {
  idle: [222, 262, 198, 286, 240],
  listening: [190, 212, 168, 232, 200],
  thinking: [268, 296, 250, 318, 280],
  speaking: [326, 18, 286, 350, 44],
};
const SPEED = { idle: 0.35, listening: 0.9, thinking: 2.4, speaking: 1.15 };
const GLOW = { idle: 0.3, listening: 0.62, thinking: 0.55, speaking: 0.7 };

const BLOBS = [
  { orbit: 0.42, size: 0.74, fx: 0.71, fy: 0.53, phase: 0.0 },
  { orbit: 0.5, size: 0.62, fx: -0.47, fy: 0.83, phase: 1.7 },
  { orbit: 0.36, size: 0.68, fx: 0.93, fy: -0.61, phase: 3.1 },
  { orbit: 0.55, size: 0.5, fx: -0.83, fy: -0.39, phase: 4.4 },
  { orbit: 0.28, size: 0.58, fx: 0.57, fy: 1.07, phase: 5.6 },
];

const lerpHue = (from, to, k) => {
  const diff = ((to - from + 540) % 360) - 180;
  return (from + diff * k + 360) % 360;
};

export class SiriOrb {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext?.('2d') || null;
    this.state = 'idle';
    this.level = 0; // objetivo (0..1)
    this.energy = 0; // suavizado
    this.time = 0;
    this.last = 0;
    this.speed = SPEED.idle;
    this.glow = GLOW.idle;
    this.hues = [...PALETTES.idle];
    this.rings = [];
    this.size = 0;
  }

  setState(state) {
    this.state = PALETTES[state] ? state : 'idle';
  }

  /** Volumen actual, de 0 a 1. */
  setLevel(level) {
    this.level = Math.max(0, Math.min(1, level || 0));
  }

  /** Onda expansiva: «te he oído». */
  pulse() {
    this.rings.push({ age: 0 });
    if (this.rings.length > 3) this.rings.shift();
  }

  resize() {
    const view = this.canvas.ownerDocument.defaultView || window;
    const dpr = Math.min(2, view.devicePixelRatio || 1);
    const css = Math.round(Math.min(this.canvas.clientWidth, this.canvas.clientHeight));
    if (!css) return false;
    const px = Math.round(css * dpr);
    if (this.canvas.width !== px || this.canvas.height !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
    this.size = px;
    return true;
  }

  draw(now) {
    if (!this.ctx || !this.resize()) return;
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;

    // Suavizado: sube rápido, baja despacio (como un vúmetro).
    const k = this.level > this.energy ? 0.45 : 0.1;
    this.energy += (this.level - this.energy) * k;
    this.level *= 0.9; // si nadie actualiza el nivel, se apaga solo
    const e = this.energy;

    const ease = 1 - Math.exp(-dt * 5);
    this.speed += (SPEED[this.state] - this.speed) * ease;
    this.glow += (GLOW[this.state] - this.glow) * ease;
    const target = PALETTES[this.state];
    this.hues = this.hues.map((h, i) => lerpHue(h, target[i], ease));
    this.time += dt * (this.speed + e * 1.6);

    const { ctx, size } = this;
    const c = size / 2;
    const t = this.time;
    const breathe = Math.sin(now / 1700) * 0.012;
    const r = size * 0.3 * (1 + breathe + e * 0.16);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // 1) Halo exterior
    ctx.globalCompositeOperation = 'source-over';
    const haloR = Math.min(c, r * (1.45 + e * 0.5)); // nunca se sale del lienzo
    const halo = ctx.createRadialGradient(c, c, r * 0.7, c, c, haloR);
    const a = Math.min(0.95, this.glow + e * 0.5);
    halo.addColorStop(0, `hsla(${this.hues[0]}, 95%, 62%, ${a * 0.55})`);
    halo.addColorStop(0.5, `hsla(${this.hues[1]}, 95%, 58%, ${a * 0.22})`);
    halo.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);

    // 2) Ondas de «te he oído»
    this.rings = this.rings.filter((ring) => (ring.age += dt) < 0.9);
    for (const ring of this.rings) {
      const p = ring.age / 0.9;
      ctx.beginPath();
      ctx.arc(c, c, r * (1 + p * 0.62), 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${this.hues[2]}, 100%, 78%, ${(1 - p) * 0.7})`;
      ctx.lineWidth = size * 0.012 * (1 - p * 0.6);
      ctx.stroke();
    }

    // 3) La esfera
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.clip();

    const base = ctx.createRadialGradient(c, c - r * 0.2, r * 0.1, c, c, r);
    base.addColorStop(0, '#141833');
    base.addColorStop(1, '#03040c');
    ctx.fillStyle = base;
    ctx.fillRect(c - r, c - r, r * 2, r * 2);

    // Luces líquidas (se suman entre sí)
    ctx.globalCompositeOperation = 'lighter';
    BLOBS.forEach((blob, i) => {
      const reach = r * blob.orbit * (1 + e * 0.35);
      const x = c + Math.cos(t * blob.fx + blob.phase) * reach;
      const y = c + Math.sin(t * blob.fy + blob.phase * 1.3) * reach;
      const br = r * blob.size * (0.85 + e * 0.6 + Math.sin(t * 0.9 + i) * 0.08);
      const g = ctx.createRadialGradient(x, y, 0, x, y, br);
      const light = 56 + e * 14;
      g.addColorStop(0, `hsla(${this.hues[i]}, 100%, ${light}%, ${0.78 + e * 0.2})`);
      g.addColorStop(0.45, `hsla(${this.hues[i]}, 100%, ${light - 8}%, 0.3)`);
      g.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(c - r, c - r, r * 2, r * 2);
    });

    // Cintas de onda: la «voz» dentro de la esfera
    const amp = r * (0.03 + e * 0.55);
    for (let n = 0; n < 3; n += 1) {
      const freq = 2.2 + n * 0.9;
      const shift = t * (2.1 + n * 0.7) + n * 2.1;
      const thick = r * (0.035 + e * 0.07) * (1 - n * 0.22);
      ctx.beginPath();
      const steps = 48;
      for (let s = 0; s <= steps; s += 1) {
        const u = s / steps;
        const env = Math.sin(u * Math.PI) ** 2; // se cierra en los bordes
        const x = c - r + u * r * 2;
        const y = c + Math.sin(u * Math.PI * freq + shift) * amp * env * (1 - n * 0.25) - thick * env;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let s = steps; s >= 0; s -= 1) {
        const u = s / steps;
        const env = Math.sin(u * Math.PI) ** 2;
        const x = c - r + u * r * 2;
        const y = c + Math.sin(u * Math.PI * freq + shift) * amp * env * (1 - n * 0.25) + thick * env;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = `hsla(${this.hues[(n * 2 + 1) % 5]}, 100%, ${78 - n * 6}%, ${0.16 + e * 0.6})`;
      ctx.fill();
    }

    // Núcleo blanco cuando hay mucha energía
    const core = ctx.createRadialGradient(c, c, 0, c, c, r * (0.25 + e * 0.5));
    core.addColorStop(0, `hsla(0, 0%, 100%, ${0.1 + e * 0.5})`);
    core.addColorStop(1, 'hsla(0, 0%, 100%, 0)');
    ctx.fillStyle = core;
    ctx.fillRect(c - r, c - r, r * 2, r * 2);

    // Cristal: sombra interior en el borde y reflejo arriba
    ctx.globalCompositeOperation = 'source-over';
    const shade = ctx.createRadialGradient(c, c, r * 0.62, c, c, r);
    shade.addColorStop(0, 'hsla(235, 60%, 4%, 0)');
    shade.addColorStop(1, 'hsla(235, 60%, 4%, 0.72)');
    ctx.fillStyle = shade;
    ctx.fillRect(c - r, c - r, r * 2, r * 2);

    const gloss = ctx.createRadialGradient(c - r * 0.34, c - r * 0.46, 0, c - r * 0.34, c - r * 0.46, r * 0.62);
    gloss.addColorStop(0, 'hsla(0, 0%, 100%, 0.34)');
    gloss.addColorStop(0.5, 'hsla(0, 0%, 100%, 0.07)');
    gloss.addColorStop(1, 'hsla(0, 0%, 100%, 0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(c - r, c - r, r * 2, r * 2);
    ctx.restore();

    // Filo de luz
    ctx.beginPath();
    ctx.arc(c, c, r - size * 0.002, 0, Math.PI * 2);
    const rim = ctx.createLinearGradient(c - r, c - r, c + r, c + r);
    rim.addColorStop(0, `hsla(${this.hues[2]}, 100%, 86%, ${0.5 + e * 0.4})`);
    rim.addColorStop(0.5, 'hsla(0, 0%, 100%, 0.06)');
    rim.addColorStop(1, `hsla(${this.hues[3]}, 100%, 72%, ${0.36 + e * 0.4})`);
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1, size * 0.004);
    ctx.stroke();
  }
}
