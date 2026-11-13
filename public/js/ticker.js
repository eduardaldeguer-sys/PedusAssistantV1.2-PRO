/**
 * Reloj de animación compartido.
 *
 * Chrome congela requestAnimationFrame cuando la pestaña no se ve. Como el orbe,
 * la onda y el detector de voz dependen de él, todo se cuelga de este reloj, que:
 *   - usa el rAF de la mini ventana flotante cuando está abierta (sigue visible), y
 *   - tiene un temporizador de reserva para que la escucha no se quede clavada
 *     si no hay ninguna ventana a la vista.
 */

const subs = new Set();
let win = window;
let rafId = 0;
let lastRun = 0;

function run(now = performance.now()) {
  rafId = 0;
  lastRun = performance.now();
  for (const fn of [...subs]) {
    try {
      fn(now);
    } catch (error) {
      console.warn('[pedus] ticker:', error);
    }
  }
  schedule();
}

function schedule() {
  if (rafId || !subs.size) return;
  try {
    rafId = win.requestAnimationFrame(run);
  } catch {
    win = window;
    rafId = window.requestAnimationFrame(run);
  }
}

// Reserva: si el rAF lleva parado un rato (pestaña oculta), empuja a mano.
setInterval(() => {
  if (subs.size && performance.now() - lastRun > 180) {
    if (rafId) {
      try {
        win.cancelAnimationFrame(rafId);
      } catch {
        /* ventana cerrada */
      }
    }
    run();
  }
}, 200);

export const ticker = {
  /** Añade una función que se llama en cada frame. Devuelve cómo quitarla. */
  add(fn) {
    subs.add(fn);
    schedule();
    return () => subs.delete(fn);
  },
  /** Cambia la ventana que marca el ritmo (la mini ventana o la principal). */
  useWindow(next) {
    const target = next || window;
    if (target === win) return;
    if (rafId) {
      try {
        win.cancelAnimationFrame(rafId);
      } catch {
        /* ventana cerrada */
      }
      rafId = 0;
    }
    win = target;
    schedule();
  },
};
