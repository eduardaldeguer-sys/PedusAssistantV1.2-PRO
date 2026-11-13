/**
 * PedusAssistant — interfaz de solo voz.
 *
 * No hay cuadro de texto ni botón para hablar: Pedus es un orbe que solo reacciona
 * cuando se le llama con «Okey Pedus». Los únicos controles que quedan (ajustes,
 * compartir pantalla, mini ventana) no sirven para hablarle.
 */

import { api } from './js/api.js';
import { store } from './js/store.js';
import { VoiceOut } from './js/speech.js';
import { AudioInput, cleanWakeWord } from './js/mic.js';
import { ScreenShare } from './js/screen.js';
import { ticker } from './js/ticker.js';
import { createPip } from './js/pip.js';
import { SiriOrb } from './js/orb.js';
import { PRESETS, matchPreset, normalizeText, parseDuration } from './js/presets.js';

const $ = (id) => document.getElementById(id);
const el = {
  root: $('pedus'),
  orb: $('orb'),
  status: $('status-pill'),
  heard: $('heard'),
  caption: $('caption'),
  gate: $('gate'),
  gateText: $('gate-text'),
  btnGate: $('btn-gate'),
  btnScreen: $('btn-screen'),
  btnPip: $('btn-pip'),
  btnSettings: $('btn-settings'),
  screenPreview: $('screen-preview'),
  screenThumb: $('screen-thumb'),
  btnScreenStop: $('btn-screen-stop'),
  pipNote: $('pip-note'),
  btnPipBack: $('btn-pip-back'),
  settingsBackdrop: $('settings-backdrop'),
  btnCloseSettings: $('btn-close-settings'),
  toast: $('toast'),
  setEngine: $('set-engine'),
  setVoice: $('set-voice'),
  setStyle: $('set-style'),
  setRate: $('set-rate'),
  outRate: $('out-rate'),
  setSpeak: $('set-speak'),
  setChime: $('set-chime'),
  setSilence: $('set-silence'),
  outSilence: $('out-silence'),
  setSens: $('set-sens'),
  outSens: $('out-sens'),
  setAutoPip: $('set-autopip'),
  pipHint: $('pip-hint'),
  setTheme: $('set-theme'),
  btnTestVoice: $('btn-test-voice'),
  btnPermission: $('btn-permission'),
  btnClearHistory: $('btn-clear-history'),
  presetSearch: $('preset-search'),
  presetCount: $('preset-count'),
  presetList: $('preset-list'),
  cmdForm: $('command-form'),
  cmdPhrase: $('cmd-phrase'),
  cmdType: $('cmd-type'),
  cmdValue: $('cmd-value'),
  cmdList: $('command-list'),
  memoryForm: $('memory-form'),
  memoryInput: $('memory-input'),
  memoryList: $('memory-list'),
  btnClearMemory: $('btn-clear-memory'),
  statusGrid: $('status-grid'),
  btnDiagnostics: $('btn-diagnostics'),
  btnExport: $('btn-export'),
  wakeHint: $('wake-hint'),
};

const app = {
  state: 'idle', // idle | listening | thinking | speaking
  config: null,
  busy: false,
  pendingImage: null,
  timers: [], // { id, label, endsAt }
  lastReply: '',
  wakeCooldown: 0,
  bargeFrames: 0,
};

const S = () => store.settings;
const IDLE_HINT = 'Di «Okey Pedus»';

/* ------------------------------------------------------------------ */
/* Orbe y textos                                                       */
/* ------------------------------------------------------------------ */

const orb = new SiriOrb(el.orb);
ticker.add((now) => orb.draw(now));

function setState(next) {
  app.state = next;
  el.root.dataset.state = next;
  orb.setState(next);
  mic.strictWake = next === 'speaking'; // hablando: exige «okey» para no despertarse con su propia voz
  el.status.textContent = { idle: IDLE_HINT, listening: 'Te escucho', thinking: 'Pensando…', speaking: '' }[next] ?? IDLE_HINT;
}

const caption = (text) => {
  el.caption.textContent = text || '';
};
const heard = (text) => {
  el.heard.textContent = text || '';
};

let toastTimer;
function toast(message, ms = 3600) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  requestAnimationFrame(() => el.toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove('show');
    setTimeout(() => {
      el.toast.hidden = true;
    }, 220);
  }, ms);
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Deja un texto apto para leer en voz alta (sin URLs, flechas ni emojis). */
const speakable = (text) =>
  String(text || '')
    .replace(/→?\s*https?:\/\/\S+/g, '')
    .replace(/[⭐·→]/g, ',')
    .replace(/^- /gm, '')
    .replace(/\s+,/g, ',')
    .replace(/\n+/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();

/* ------------------------------------------------------------------ */
/* Voz de salida                                                       */
/* ------------------------------------------------------------------ */

const voice = new VoiceOut({
  api,
  getSettings: S,
  onStart: () => setState('speaking'),
  onEnd: () => {
    if (app.state === 'speaking') setState('idle');
  },
  onLevel: (level) => {
    if (app.state === 'speaking') orb.setLevel(level);
  },
});

async function say(text, { force = false } = {}) {
  if (!text || (!force && !S().speak)) return;
  try {
    await voice.speak(speakable(text), { voice: S().voice });
  } catch (error) {
    console.warn(error);
  }
}

/** Respuesta de un comando instantáneo: se dice, pero no entra en el historial del modelo. */
const reply = (text) => respond(text, { persist: false });

/** Muestra una respuesta y la lee. No espera a que termine de hablar. */
function respond(text, { speak = true, persist = true } = {}) {
  if (!text) return;
  app.lastReply = text;
  if (persist) store.addMessage('assistant', text);
  caption(text);
  if (speak) say(text);
  if (app.state === 'thinking') setState('idle'); // voz desactivada
}

/* ------------------------------------------------------------------ */
/* Micrófono y wake word                                               */
/* ------------------------------------------------------------------ */

const mic = new AudioInput({
  getSettings: S,
  onLevel: (level) => {
    if (app.state === 'listening') orb.setLevel(level);
    else if (app.state === 'idle') orb.setLevel(level * 0.3); // en reposo se mueve un poco con el ambiente
  },
  onWake: (rest) => handleWake(rest),
  onPartial: (text, isWake) => {
    if (isWake && app.state !== 'thinking') heard(text);
  },
  onError: (error) => console.warn('[pedus] mic:', error.message),
});

function showGate(message) {
  el.gateText.textContent = message;
  el.gate.hidden = false;
}

/** Abre el micrófono y deja la wake word escuchando. Devuelve si lo ha conseguido. */
async function ensureMic() {
  if (!mic.speechSupported) {
    showGate('Este navegador no tiene reconocimiento de voz, así que no puede oír «Okey Pedus». Abre Pedus en Chrome o Edge.');
    el.btnGate.hidden = true;
    return false;
  }
  try {
    await mic.enable();
    mic.startWake();
    el.gate.hidden = true;
    return true;
  } catch (error) {
    console.warn('[pedus] mic:', error.message);
    showGate(
      error.name === 'NotAllowedError'
        ? 'Pedus solo funciona con la voz y el micrófono está bloqueado. Permítelo en el candado de la barra de direcciones.'
        : 'Pedus solo funciona con la voz y necesita tu micrófono.',
    );
    return false;
  }
}

function handleWake(rest = '') {
  const now = Date.now();
  if (now - app.wakeCooldown < 1200) return;
  app.wakeCooldown = now;

  orb.pulse(); // siempre reacciona, aunque esté ocupado
  orb.setLevel(0.9);
  if (S().chime !== false) voice.chime();
  if (app.busy || app.state === 'listening') return;

  if (app.state === 'speaking') voice.stop(); // «Okey Pedus» también sirve para interrumpirle

  if (rest.length > 2) handleUserText(rest); // «Okey Pedus, abre YouTube»
  else startListening(); // solo «Okey Pedus»: espera la frase
}

async function startListening() {
  if (app.busy || app.state === 'listening') return;
  if (!(await ensureMic())) return;

  setState('listening');
  heard('');
  caption('');
  mic.pauseWake(true); // el reconocedor de la wake word y el de la frase no pueden ir a la vez

  let text = '';
  try {
    const started = performance.now();
    const quick = await mic.listenOnce({ timeoutMs: 9000 });
    if (quick) {
      text = cleanWakeWord(quick);
    } else if (performance.now() - started < 1500) {
      // El reconocedor del navegador ha fallado nada más empezar: grabamos y transcribimos con Whisper.
      const blob = await mic.recordUntilSilence({ silenceMs: Math.round(S().silence * 1000) });
      if (blob) {
        setState('thinking');
        text = cleanWakeWord(await api.transcribe(blob));
      }
    }
  } catch (error) {
    toast(error.message);
  } finally {
    mic.pauseWake(false);
  }

  if (!text || text.length < 2) {
    setState('idle');
    caption('No te he oído. Llámame otra vez.');
    return;
  }
  await handleUserText(text);
}

/* ------------------------------------------------------------------ */
/* Abrir pestañas                                                      */
/* ------------------------------------------------------------------ */

const POPUP_HELP =
  'Chrome ha bloqueado la pestaña porque no has hecho clic. Permite las ventanas emergentes de esta página, en el icono de la barra de direcciones, y pídemelo otra vez.';

/** Abre una URL en pestaña nueva. Devuelve false si el navegador la bloquea. */
function openUrl(url) {
  // Sin «noopener» en los parámetros: con él window.open devuelve siempre null y no se sabría si se bloqueó.
  const w = window.open(url, '_blank');
  if (!w) return false;
  try {
    w.opener = null;
  } catch {
    /* otra página ya cargada */
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Comandos                                                            */
/* ------------------------------------------------------------------ */

/** Comandos creados por el usuario en Ajustes (tienen prioridad sobre los preinstalados). */
function matchUserCommand(text) {
  const t = normalizeText(cleanWakeWord(text));
  if (!t) return null;
  return (
    store.state.commands.find((cmd) => {
      if (cmd.enabled === false) return false;
      const phrase = normalizeText(cmd.phrase);
      if (!phrase) return false;
      if (t === phrase || t.startsWith(`${phrase} `)) return true;
      return phrase.length >= 4 && ` ${t} `.includes(` ${phrase} `);
    }) || null
  );
}

/** Devuelve true si el comando ya está resuelto, o { prompt } si hay que seguir con el modelo. */
async function runUserCommand(cmd) {
  if (cmd.type === 'prompt') return { prompt: cmd.value };
  if (cmd.type === 'open_url') {
    const url = /^https?:/.test(cmd.value) ? cmd.value : `https://${cmd.value.replace(/^\/+/, '')}`;
    reply(openUrl(url) ? `Abro ${cmd.value.replace(/^https?:\/\/(www\.)?/, '')}.` : POPUP_HELP);
    return true;
  }
  if (cmd.type === 'tool') {
    const [tool, ...rest] = String(cmd.value).split('|');
    let args = {};
    if (rest.length) {
      try {
        args = JSON.parse(rest.join('|'));
      } catch {
        args = { target: rest.join('|').trim() };
      }
    }
    const out = await api.action(tool.trim(), args);
    executeActions(out.actions || []);
    reply(out.result);
    return true;
  }
  return false;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const fmtDuration = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (h) parts.push(`${h} ${h === 1 ? 'hora' : 'horas'}`);
  if (m) parts.push(`${m} ${m === 1 ? 'minuto' : 'minutos'}`);
  if (s && !h) parts.push(`${s} ${s === 1 ? 'segundo' : 'segundos'}`);
  return parts.join(' y ') || 'un momento';
};

function addTimer(seconds, label = 'temporizador') {
  const timer = { label, endsAt: Date.now() + seconds * 1000 };
  timer.id = setTimeout(() => {
    app.timers = app.timers.filter((t) => t !== timer);
    orb.pulse();
    caption(`⏰ Se acabó el ${label}.`);
    say(`Se acabó el ${label}.`, { force: true });
  }, seconds * 1000);
  app.timers.push(timer);
}

/**
 * Acciones locales de los comandos preinstalados.
 * Devuelve el texto a decir, '' si no hay nada que decir, o { prompt, image } para seguir con el modelo.
 */
async function runLocal(action, arg) {
  const tz = S().timezone;
  const [kind, value] = action.split(/-(.+)/);

  switch (action) {
    case 'time':
      return `Son las ${new Intl.DateTimeFormat('es-ES', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date())}.`;
    case 'date':
      return `Hoy es ${new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(new Date())}.`;
    case 'stop':
      voice.stop();
      caption('');
      return '';
    case 'repeat':
      return app.lastReply || 'Todavía no he dicho nada.';
    case 'mute':
      store.updateSettings({ speak: false });
      syncSettingsUI();
      caption('Vale, contesto solo por escrito. Di «vuelve a hablar» cuando quieras.');
      return '';
    case 'unmute':
      store.updateSettings({ speak: true });
      syncSettingsUI();
      return 'Ya vuelvo a hablar.';
    case 'settings':
      openSettings();
      return 'Ajustes abiertos.';
    case 'settings-close':
      closeSettings();
      return 'Cerrados.';
    case 'commands':
      openSettings('comandos');
      return `Aquí los tienes: ${PRESETS.length} comandos preinstalados.`;
    case 'pip':
      try {
        await pip.open();
        return 'Mini ventana abierta.';
      } catch {
        return 'Chrome solo me deja abrir la mini ventana con un clic en su botón, o sola cuando cambias de pestaña.';
      }
    case 'pip-close':
      pip.close();
      return 'Vuelvo a la página.';
    case 'rate-up':
    case 'rate-down':
    case 'rate-reset': {
      const rate = action === 'rate-reset' ? 1 : Math.min(1.4, Math.max(0.7, (S().rate || 1) + (action === 'rate-up' ? 0.15 : -0.15)));
      store.updateSettings({ rate: Number(rate.toFixed(2)) });
      syncSettingsUI();
      return action === 'rate-reset' ? 'Velocidad normal.' : action === 'rate-up' ? 'Hablo más rápido.' : 'Hablo más despacio.';
    }
    case 'clear':
      store.clearHistory();
      return 'Conversación borrada. Empezamos de cero.';
    case 'memory': {
      const facts = store.memoryFacts();
      return facts.length ? `Recuerdo esto: ${facts.slice(-8).join('. ')}.` : 'Todavía no sé nada de ti.';
    }
    case 'memory-clear':
      store.clearMemory();
      renderMemory();
      return 'Memoria borrada.';
    case 'help':
      return 'Llámame por mi nombre y pídeme lo que quieras: abrir webs, buscar cosas, poner temporizadores, mirar tu pantalla, consultar GitHub o simplemente charlar. Tengo doscientos cincuenta comandos instantáneos; los ves en ajustes.';
    case 'count':
      return `Tengo ${PRESETS.length} comandos preinstalados, más los que tú añadas.`;
    case 'screen':
    case 'screen-summary': {
      if (!screen.active) return 'Primero comparte la pantalla con el botón de arriba a la derecha. Chrome no me deja pedirla sin un clic. Luego solo pregúntame.';
      const image = await grabScreen();
      return {
        image,
        prompt:
          action === 'screen'
            ? '¿Qué ves en mi pantalla? Dime lo importante.'
            : 'Resume lo que hay en mi pantalla y dime si hay algo importante.',
      };
    }
    case 'screen-stop':
      stopScreen();
      return 'Ya no veo tu pantalla.';
    case 'timer': {
      const seconds = parseDuration(arg);
      if (!seconds) return { prompt: `Pon un temporizador de ${arg}` };
      addTimer(Math.min(seconds, 86_400));
      return `Temporizador de ${fmtDuration(seconds)}, en marcha.`;
    }
    case 'timer-cancel': {
      const n = app.timers.length;
      app.timers.forEach((t) => clearTimeout(t.id));
      app.timers = [];
      return n ? (n === 1 ? 'Temporizador cancelado.' : `He cancelado ${n} temporizadores.`) : 'No había ningún temporizador.';
    }
    case 'timer-list': {
      if (!app.timers.length) return 'No hay ningún temporizador en marcha.';
      return app.timers.map((t) => `Quedan ${fmtDuration(Math.max(1, Math.round((t.endsAt - Date.now()) / 1000)))}`).join('. ') + '.';
    }
    case 'reload':
      setTimeout(() => location.reload(), 1600);
      return 'Me reinicio.';
    case 'model':
      return app.config?.models?.chat ? `Ahora mismo pienso con ${app.config.models.chat.split('/').pop()}, de Groq.` : 'No he podido consultar el modelo.';
    case 'voice-test':
      return 'Hola, así suena mi voz. ¿Te gusta?';
    case 'diagnostics':
      try {
        const res = await api.diagnostics();
        if (res.models && app.config) app.config.models = res.models;
        return res.groqConfigured ? 'Todo en orden: Groq responde.' : 'Al servidor le falta la clave de Groq.';
      } catch (error) {
        return `Groq no responde: ${error.message}`;
      }
    case 'coin':
      return pick(['Cara.', 'Cruz.']);
    case 'dice':
      return `Ha salido un ${1 + Math.floor(Math.random() * 6)}.`;
    case 'random':
      return `El ${1 + Math.floor(Math.random() * 100)}.`;
    case 'thanks':
      return pick(['De nada.', 'A ti.', 'Para eso estoy.']);
    case 'hello':
      return pick(['Aquí estoy. ¿Qué necesitas?', 'Hola. Dime.', 'Te oigo perfectamente. ¿Qué hacemos?']);
    case 'bye':
      return pick(['Hasta luego.', 'Aquí estaré.', 'Descansa.']);
    case 'name':
      return 'Soy tu asistente de voz. Llámame por mi nombre y te escucho.';
    default:
      break;
  }

  if (kind === 'theme') {
    store.updateSettings({ theme: value });
    applyTheme(value);
    syncSettingsUI();
    return value === 'light' ? 'Tema claro.' : 'Tema oscuro.';
  }
  if (kind === 'voice') {
    const id = { female: 'diana', male: 'daniel' }[value] || value;
    store.updateSettings({ voice: id, engine: 'auto' });
    syncSettingsUI();
    return `Ahora hablo con la voz de ${id[0].toUpperCase()}${id.slice(1)}.`;
  }
  if (kind === 'engine') {
    store.updateSettings({ engine: value === 'system' ? 'system' : 'auto' });
    syncSettingsUI();
    return value === 'system' ? 'Uso la voz del sistema, en español nativo.' : 'Uso la voz neuronal.';
  }
  if (kind === 'style') {
    store.updateSettings({ style: value });
    syncSettingsUI();
    return { equilibrado: 'Vuelvo a mi estilo normal.', breve: 'Vale, al grano.', tecnico: 'Modo técnico activado.', divertido: 'Modo divertido. Prepárate.' }[value];
  }
  return '';
}

/** Ejecuta un comando preinstalado. Devuelve true (resuelto) o { prompt, image } (sigue al modelo). */
async function runPreset({ preset, arg }) {
  switch (preset.type) {
    case 'open':
      reply(openUrl(preset.url) ? `Abro ${preset.title}.` : POPUP_HELP);
      return true;
    case 'search':
      reply(openUrl(preset.url.replace('{q}', encodeURIComponent(arg))) ? `Busco ${arg} en ${preset.label}.` : POPUP_HELP);
      return true;
    case 'tool': {
      const out = await api.action(preset.tool, preset.args);
      executeActions((out.actions || []).filter((a) => !a.optional));
      reply(out.result);
      return true;
    }
    case 'prompt':
      return { prompt: preset.prompt };
    case 'local': {
      const out = await runLocal(preset.action, arg);
      if (out && typeof out === 'object') return out;
      if (out) reply(out);
      return true;
    }
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* Conversación                                                        */
/* ------------------------------------------------------------------ */

async function handleUserText(rawText) {
  const text = String(rawText || '').trim();
  if (!text || app.busy) return;
  app.busy = true;
  if (app.state === 'speaking') voice.stop();

  heard(text);
  caption('');
  setState('thinking');

  try {
    // 1) Comandos: primero los tuyos, luego los 250 preinstalados. Instantáneos y sin tokens.
    let prompt = text;
    let image = null;
    const userCmd = matchUserCommand(text);
    const preset = userCmd ? null : matchPreset(text, S().disabledPresets);
    const outcome = userCmd ? await runUserCommand(userCmd) : preset ? await runPreset(preset) : false;
    if (outcome === true) return;
    if (outcome && typeof outcome === 'object') {
      prompt = outcome.prompt || text;
      image = outcome.image || null;
    }

    // 2) Si la pantalla está compartida y se pregunta por ella, se adjunta una captura.
    if (!image && screen.active && /pantalla|que ves|mira esto|esta pagina|este error|aqui/.test(normalizeText(text))) {
      image = await grabScreen().catch(() => null);
    }

    // 3) Modelo con herramientas.
    store.addMessage('user', text);
    const result = await api.chat({
      message: prompt,
      history: store.historyForModel(14).slice(0, -1),
      memory: store.memoryFacts(),
      settings: { style: S().style, voice: S().voice, timezone: S().timezone },
      image,
      timezone: S().timezone,
      mode: 'auto',
    });
    if (result.memories?.length) {
      for (const fact of result.memories) store.addMemory(fact);
      renderMemory();
    }
    const blocked = executeActions(result.actions || []);
    respond(blocked ? POPUP_HELP : result.reply);
  } catch (error) {
    const msg =
      error.code === 'missing_groq_key'
        ? 'Falta la clave de Groq en el servidor. Añade GROQ_API_KEY en Render.'
        : error.message || 'Algo ha fallado.';
    respond(msg, { persist: false });
  } finally {
    app.busy = false;
    if (app.state === 'thinking') setState('idle');
  }
}

/** Ejecuta las acciones que devuelve el servidor. Devuelve true si el navegador bloqueó una pestaña. */
function executeActions(actions) {
  let blocked = false;
  for (const action of actions) {
    switch (action.type) {
      case 'open_url':
        if (!openUrl(action.url)) blocked = true;
        break;
      case 'timer':
        addTimer(action.seconds, action.label);
        break;
      case 'remember':
        if (store.addMemory(action.fact)) renderMemory();
        break;
      case 'set_voice':
        store.updateSettings({ voice: action.voice });
        syncSettingsUI();
        break;
      case 'ui':
        if (action.action === 'open_settings') openSettings();
        if (action.action === 'minimize') pip.open().catch(() => {});
        if (action.action === 'expand') pip.close();
        if (action.action === 'mute') store.updateSettings({ speak: false });
        if (action.action === 'unmute') store.updateSettings({ speak: true });
        syncSettingsUI();
        break;
      default:
        break;
    }
  }
  return blocked;
}

/* ------------------------------------------------------------------ */
/* Pantalla / visión                                                   */
/* ------------------------------------------------------------------ */

const screen = new ScreenShare({
  api,
  onStop: () => {
    el.screenPreview.hidden = true;
    el.btnScreen.classList.remove('is-active');
  },
  onError: (e) => toast(e.message),
});

async function grabScreen() {
  const frame = await screen.grab();
  el.screenThumb.src = frame;
  return frame;
}

function stopScreen() {
  screen.stop();
  el.screenPreview.hidden = true;
  el.btnScreen.classList.remove('is-active');
}

async function toggleScreen() {
  if (screen.active) return stopScreen();
  try {
    await screen.start();
    el.btnScreen.classList.add('is-active');
    el.screenPreview.hidden = false;
    await grabScreen();
    caption('Ya veo tu pantalla. Llámame y pregúntame «¿qué ves?».');
  } catch (error) {
    toast(error.name === 'NotAllowedError' ? 'Has cancelado la captura de pantalla.' : error.message);
  }
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                             */
/* ------------------------------------------------------------------ */

function selectTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === name));
}

function openSettings(tab) {
  el.settingsBackdrop.hidden = false;
  if (tab) selectTab(tab);
  renderMemory();
  renderCommands();
  renderPresets();
  renderStatus();
  syncSettingsUI();
}

function closeSettings() {
  el.settingsBackdrop.hidden = true;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || 'dark';
  if (pip.window) pip.window.document.documentElement.dataset.theme = theme || 'dark';
}

const sensLabel = (v) => (Number(v) < 0.38 ? 'baja' : Number(v) < 0.62 ? 'media' : 'alta');
const rateLabel = (v) => `${Number(v).toFixed(2).replace(/0$/, '')}×`;

function syncSettingsUI() {
  const s = S();
  if (el.setVoice.options.length && s.voice) el.setVoice.value = s.voice;
  el.setEngine.value = s.engine || 'auto';
  el.setVoice.disabled = s.engine === 'system';
  el.setStyle.value = s.style;
  el.setRate.value = s.rate;
  el.outRate.textContent = rateLabel(s.rate);
  el.setSpeak.checked = s.speak;
  el.setChime.checked = s.chime !== false;
  el.setSilence.value = s.silence;
  el.outSilence.textContent = `${Number(s.silence).toFixed(1)} s`;
  el.setSens.value = s.sensitivity;
  el.outSens.textContent = sensLabel(s.sensitivity);
  el.setAutoPip.checked = s.autoPip !== false;
  el.setTheme.checked = s.theme === 'light';
  applyTheme(s.theme);
}

function renderPresets() {
  const filter = normalizeText(el.presetSearch.value);
  const disabled = new Set(S().disabledPresets || []);
  const shown = PRESETS.filter((p) => !filter || normalizeText(`${p.title} ${p.example} ${p.category} ${(p.phrases || []).join(' ')} ${(p.names || []).join(' ')}`).includes(filter));
  el.presetCount.textContent = filter ? `${shown.length} de ${PRESETS.length}` : `${PRESETS.length} preinstalados`;

  let category = '';
  const html = [];
  for (const p of shown) {
    if (p.category !== category) {
      category = p.category;
      html.push(`<li class="cat">${escapeHtml(category)}</li>`);
    }
    const off = disabled.has(p.id);
    html.push(
      `<li class="${off ? 'off' : ''}"><span class="p-main"><span class="p-title">${escapeHtml(p.title)}</span><span class="p-say">«${escapeHtml(p.example)}»</span></span><input type="checkbox" data-id="${escapeHtml(p.id)}" ${off ? '' : 'checked'} title="Activado" aria-label="Activar ${escapeHtml(p.title)}" /></li>`,
    );
  }
  el.presetList.innerHTML = html.join('') || '<li><span class="p-main">Ningún comando coincide.</span></li>';
}

function renderCommands() {
  el.cmdList.innerHTML = '';
  if (!store.state.commands.length) {
    el.cmdList.innerHTML = '<li><span class="cmd-target">Aún no has añadido ninguno.</span></li>';
  }
  for (const cmd of store.state.commands) {
    const li = document.createElement('li');
    const target = cmd.type === 'tool' ? cmd.value.split('|')[0] : cmd.value;
    li.innerHTML = `
      <span class="cmd-phrase">«${escapeHtml(cmd.phrase)}»</span>
      <span class="cmd-arrow">→</span>
      <span class="cmd-target">${escapeHtml(target)}</span>
      <button class="mini-btn" type="button" title="Borrar">✕</button>`;
    li.querySelector('button').addEventListener('click', () => {
      store.removeCommand(cmd.id);
      renderCommands();
    });
    el.cmdList.appendChild(li);
  }
}

function renderMemory() {
  el.memoryList.innerHTML = '';
  if (!store.state.memory.length) {
    el.memoryList.innerHTML = '<li><span class="mem-text">Todavía no recuerdo nada de ti.</span></li>';
    return;
  }
  for (const item of [...store.state.memory].reverse()) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="mem-text">${escapeHtml(item.fact)}</span>
      <button class="mini-btn" type="button" title="Olvidar">✕</button>`;
    li.querySelector('button').addEventListener('click', () => {
      store.removeMemory(item.at);
      renderMemory();
    });
    el.memoryList.appendChild(li);
  }
}

function renderStatus() {
  const c = app.config;
  const cards = [
    ['Groq', c?.capabilities?.groq ? 'Conectado' : 'Sin clave', c?.capabilities?.groq ? 'ok' : 'bad'],
    ['GitHub', c?.capabilities?.github ? 'Con token' : 'Público', c?.capabilities?.github ? 'ok' : ''],
    ['Modelo', c?.models?.chat || '—', ''],
    ['Visión', c?.models?.vision || '—', ''],
    ['Voz (modelo)', S().engine === 'system' ? 'Sistema' : c?.models?.tts || '—', ''],
    ['Micrófono', mic.stream ? 'Activo' : 'Inactivo', mic.stream ? 'ok' : 'bad'],
    ['Wake word', mic.wakeActive ? 'Escuchando' : 'Parada', mic.wakeActive ? 'ok' : 'bad'],
    ['Comandos', `${PRESETS.length} + ${store.state.commands.length}`, ''],
    ['Versión', c?.version || '—', ''],
    ['Mensajes', String(store.state.stats.messages), ''],
  ];
  el.statusGrid.innerHTML = cards
    .map(
      ([k, v, cls]) =>
        `<div class="status-card"><span class="k">${escapeHtml(k)}</span><span class="v ${cls}">${escapeHtml(String(v))}</span></div>`,
    )
    .join('');
}

/* ------------------------------------------------------------------ */
/* Mini ventana flotante                                               */
/* ------------------------------------------------------------------ */

const pip = createPip({
  node: el.root,
  onOpen: (w) => {
    closeSettings();
    ticker.useWindow(w); // el orbe sigue animado aunque la pestaña quede oculta
    w.document.addEventListener('keydown', onKey);
    el.pipNote.hidden = false;
  },
  onClose: () => {
    ticker.useWindow(window);
    el.pipNote.hidden = true;
  },
});

/* ------------------------------------------------------------------ */
/* Eventos (ninguno sirve para hablarle)                               */
/* ------------------------------------------------------------------ */

function onKey(e) {
  if (e.key !== 'Escape') return;
  if (!el.settingsBackdrop.hidden) closeSettings();
  else if (app.state === 'speaking') voice.stop();
}
document.addEventListener('keydown', onKey);

el.btnGate.addEventListener('click', ensureMic);
el.btnScreen.addEventListener('click', toggleScreen);
el.btnScreenStop.addEventListener('click', stopScreen);
el.btnPip.addEventListener('click', () => pip.open().catch((error) => toast(error.message, 5200)));
el.btnPipBack.addEventListener('click', () => pip.close());
el.btnSettings.addEventListener('click', () => openSettings());
el.btnCloseSettings.addEventListener('click', closeSettings);
el.settingsBackdrop.addEventListener('click', (e) => {
  if (e.target === el.settingsBackdrop) closeSettings();
});
document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));

el.setEngine.addEventListener('change', () => {
  store.updateSettings({ engine: el.setEngine.value });
  el.setVoice.disabled = el.setEngine.value === 'system';
});
el.setVoice.addEventListener('change', () => store.updateSettings({ voice: el.setVoice.value }));
el.setStyle.addEventListener('change', () => store.updateSettings({ style: el.setStyle.value }));
el.setRate.addEventListener('input', () => {
  store.updateSettings({ rate: Number(el.setRate.value) });
  el.outRate.textContent = rateLabel(el.setRate.value);
});
el.setSpeak.addEventListener('change', () => store.updateSettings({ speak: el.setSpeak.checked }));
el.setChime.addEventListener('change', () => store.updateSettings({ chime: el.setChime.checked }));
el.setSilence.addEventListener('input', () => {
  store.updateSettings({ silence: Number(el.setSilence.value) });
  el.outSilence.textContent = `${Number(el.setSilence.value).toFixed(1)} s`;
});
el.setSens.addEventListener('input', () => {
  store.updateSettings({ sensitivity: Number(el.setSens.value) });
  el.outSens.textContent = sensLabel(el.setSens.value);
});
el.setAutoPip.addEventListener('change', () => {
  store.updateSettings({ autoPip: el.setAutoPip.checked });
  pip.setAuto(el.setAutoPip.checked);
});
el.setTheme.addEventListener('change', () => {
  const theme = el.setTheme.checked ? 'light' : 'dark';
  store.updateSettings({ theme });
  applyTheme(theme);
});

el.btnTestVoice.addEventListener('click', async () => {
  el.btnTestVoice.disabled = true;
  await say('Hola, así suena mi voz. ¿Te gusta?', { force: true });
  el.btnTestVoice.disabled = false;
});

el.btnPermission.addEventListener('click', async () => {
  mic.stopWake();
  const ok = await ensureMic();
  toast(ok ? 'Micrófono activo. Di «Okey Pedus».' : 'No se pudo activar el micrófono.');
  renderStatus();
});

el.btnClearHistory.addEventListener('click', () => {
  store.clearHistory();
  toast('Conversación borrada');
});

el.presetSearch.addEventListener('input', renderPresets);
el.presetList.addEventListener('change', (e) => {
  const id = e.target?.dataset?.id;
  if (!id) return;
  const disabled = new Set(S().disabledPresets || []);
  if (e.target.checked) disabled.delete(id);
  else disabled.add(id);
  store.updateSettings({ disabledPresets: [...disabled] });
  e.target.closest('li').classList.toggle('off', !e.target.checked);
});

el.cmdForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const phrase = el.cmdPhrase.value.trim();
  const value = el.cmdValue.value.trim();
  if (!phrase || !value) return;
  store.addCommand({ phrase, value, type: el.cmdType.value });
  el.cmdPhrase.value = '';
  el.cmdValue.value = '';
  renderCommands();
  toast('Comando añadido');
});

el.memoryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const fact = el.memoryInput.value.trim();
  if (!fact) return;
  store.addMemory(fact);
  el.memoryInput.value = '';
  renderMemory();
});

el.btnClearMemory.addEventListener('click', () => {
  if (!confirm('¿Borrar todo lo que Pedus recuerda de ti?')) return;
  store.clearMemory();
  renderMemory();
});

el.btnDiagnostics.addEventListener('click', async () => {
  el.btnDiagnostics.disabled = true;
  try {
    const res = await api.diagnostics();
    if (!res.groqConfigured) toast('Falta GROQ_API_KEY en Render');
    else if (res.warnings?.length) toast(`Groq OK, pero: ${res.warnings.join(' ')}`, 9000);
    else toast(`Groq OK · ${res.models?.chat}`);
    if (res.models && app.config) {
      app.config.models = res.models;
      renderStatus();
    }
  } catch (error) {
    toast(`Groq falló: ${error.message}`, 6000);
  } finally {
    el.btnDiagnostics.disabled = false;
  }
});

el.btnExport.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pedus-datos.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
});

window.addEventListener('beforeunload', () => {
  pip.close();
  screen.stop();
  mic.stop();
  voice.halt();
});

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

async function boot() {
  const s = S();
  applyTheme(s.theme);
  setState('idle');

  try {
    app.config = await api.config();
    el.setVoice.innerHTML = app.config.ttsVoices
      .map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.label)} · ${escapeHtml(v.gender)}</option>`)
      .join('');
    if (!app.config.ttsVoices.some((v) => v.id === s.voice)) store.updateSettings({ voice: app.config.defaultVoice });
    if (!app.config.capabilities.groq) caption('Al servidor le falta GROQ_API_KEY. Añádela en Render → Environment.');
  } catch {
    caption('No puedo hablar con el servidor.');
  }
  syncSettingsUI();

  if (!el.caption.textContent) {
    api
      .greeting(s.timezone)
      .then((g) => {
        if (app.state === 'idle' && !el.caption.textContent) caption(g.text);
      })
      .catch(() => {});
  }

  // Mini ventana flotante: botón + apertura automática al cambiar de pestaña.
  if (pip.supported) {
    const auto = pip.setAuto(s.autoPip !== false);
    el.pipHint.textContent = auto
      ? 'Al cambiar de pestaña, el orbe salta a una ventanita siempre visible. La primera vez Chrome pide permiso («Picture-in-picture automático»).'
      : 'Tu Chrome no abre la mini ventana solo: usa el botón de arriba a la derecha.';
  } else {
    el.btnPip.hidden = true;
    el.setAutoPip.disabled = true;
    el.pipHint.textContent = 'La mini ventana flotante necesita Chrome o Edge de escritorio (ChromeOS incluido).';
  }

  // El micrófono se abre solo. Si el navegador exige un gesto o permiso, aparece el aviso.
  await ensureMic();
  renderStatus();

  // Cualquier clic en la página desbloquea el audio (norma del navegador) y reintenta el micrófono.
  const unlock = () => {
    voice.ensureContext().catch(() => {});
    if (!mic.stream) ensureMic().then(renderStatus);
  };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

boot();
