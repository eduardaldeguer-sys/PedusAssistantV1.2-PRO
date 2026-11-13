/**
 * Mini ventana flotante (Document Picture-in-Picture), como el minirreproductor de Spotify:
 * una ventanita siempre encima, redimensionable, que sigue viva aunque cambies de pestaña.
 *
 *  - Manual: botón de la cabecera.
 *  - Automática: al salir de la pestaña, Chrome dispara «enterpictureinpicture» en las
 *    páginas que están usando el micrófono, y ahí abrimos la mini ventana sin clic.
 *
 * El nodo de Pedus se MUEVE a la mini ventana (no se clona), así conserva estado y eventos.
 */

const SIZE_KEY = 'pedus.pip.size';
const DRAG_PROPS = ['position', 'left', 'top', 'margin', 'transform'];

const readSize = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
    if (s && s.width >= 160 && s.height >= 120) return s;
  } catch {
    /* sin tamaño guardado */
  }
  return { width: 300, height: 330 };
};

export function createPip({ node, onOpen, onClose }) {
  const supported = 'documentPictureInPicture' in window;
  let pipWin = null;
  let opening = null;
  let placeholder = null;
  let savedDrag = {};

  function close() {
    const w = pipWin;
    if (w) {
      try {
        w.close();
      } catch {
        /* ya cerrada */
      }
    }
  }

  function handleClosed() {
    if (!pipWin) return;
    pipWin = null;
    // Devuelve a Pedus a su sitio en la página.
    if (placeholder?.parentNode) placeholder.replaceWith(node);
    else document.body.prepend(node);
    placeholder = null;
    for (const prop of DRAG_PROPS) if (savedDrag[prop]) node.style.setProperty(prop, savedDrag[prop]);
    savedDrag = {};
    onClose?.();
  }

  async function open() {
    if (!supported) throw new Error('Este navegador no tiene mini ventana flotante (hace falta Chrome o Edge de escritorio).');
    if (pipWin) return pipWin;
    if (opening) return opening;

    opening = (async () => {
      const size = readSize();
      const w = await window.documentPictureInPicture.requestWindow({ width: size.width, height: size.height });
      const doc = w.document;
      doc.title = 'Pedus';
      doc.documentElement.lang = 'es';
      doc.documentElement.classList.add('pip');
      doc.documentElement.dataset.theme = document.documentElement.dataset.theme || 'dark';
      for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
        const copy = doc.createElement('link');
        copy.rel = 'stylesheet';
        copy.href = link.href;
        doc.head.appendChild(copy);
      }

      // Quita la posición de arrastre: en la mini ventana ocupa todo.
      savedDrag = {};
      for (const prop of DRAG_PROPS) {
        savedDrag[prop] = node.style.getPropertyValue(prop);
        node.style.removeProperty(prop);
      }
      placeholder = document.createComment('pedus-en-mini-ventana');
      node.before(placeholder);
      doc.body.appendChild(node);

      pipWin = w;
      w.addEventListener('pagehide', handleClosed, { once: true });
      let saveTimer;
      w.addEventListener('resize', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          try {
            localStorage.setItem(SIZE_KEY, JSON.stringify({ width: w.innerWidth, height: w.innerHeight }));
          } catch {
            /* almacenamiento bloqueado */
          }
        }, 300);
      });
      onOpen?.(w);
      return w;
    })();

    try {
      return await opening;
    } finally {
      opening = null;
    }
  }

  /** Activa o desactiva la apertura automática al cambiar de pestaña. */
  function setAuto(enabled) {
    if (!supported || !navigator.mediaSession) return false;
    try {
      navigator.mediaSession.setActionHandler(
        'enterpictureinpicture',
        enabled ? () => open().catch((error) => console.warn('[pedus] mini ventana automática:', error.message)) : null,
      );
      return true;
    } catch {
      return false; // Chrome antiguo: solo botón manual
    }
  }

  return {
    supported,
    open,
    close,
    setAuto,
    toggle: () => (pipWin ? close() : open()),
    get window() {
      return pipWin;
    },
    get active() {
      return Boolean(pipWin);
    },
  };
}
