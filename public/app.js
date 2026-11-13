import { api } from './js/api.js';
import { store } from './js/store.js';
import { VoiceOut } from './js/speech.js';
import { AudioInput, hasWakeWord, cleanWakeWord } from './js/mic.js';
import { ScreenShare, fileToDataUrl } from './js/screen.js';

/* ------------------------------------------------------------------ */
/* Referencias DOM                                                     */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const el = {
  win: $('pedus-window'),
  bubble: $('bubble'),
  caption: $('caption'),
  status: $('status-pill'),
  log: $('log'),
  wave: $('wave'),
  input: $('input'),
  composer: $('composer'),
  orb: $('orb'),
  btnMic: $('btn-mic'),
  btnScreen: $('btn-screen'),
  btnPhoto: $('btn-photo'),
  btnSend: $('btn-send'),
  btnMinimize: $('btn-minimize'),
  btnExpand: $('btn-expand'),
  btnSettings: $('btn-settings'),
  fileInput: $('file-input'),
  chips: $('chips'),
  screenPreview: $('screen-preview'),
  screenThumb: $('screen-thumb'),
  screenLabel: $('screen-label'),
  btnScreenStop: $('btn-screen-stop'),
  settingsBackdrop: $('settings-backdrop'),
  btnCloseSettings: $('btn-close-settings'),
  toast: $('toast'),
  setVoice: $('set-voice'),
  setStyle: $('set-style'),
  setRate: $('set-rate'),
  outRate: $('out-rate'),
  setSpeak: $('set-speak'),
  setBargein: $('set-bargein'),
  setSilence: $('set-silence'),
  outSilence: $('out-silence'),
  setSens: $('set-sens'),
  outSens: $('out-sens'),
  setWake: $('set-wake'),
  setTheme: $('set-theme'),
  btnTestVoice: $('btn-test-voice'),
  btnPermission: $('btn-permission'),
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

/* ------------------------------------------------------------------ */
/* Estado de la aplicación                                             */
/* ------------------------------------------------------------------ */

const app = {
  state: 'idle', // idle | listening | thinking | speaking
  config: null,
  busy: false,
  pendingImage: null,
  timers: [],
  wakeCooldown: 0,
  lastUserText: '',
  permissionAsked: false,
  muted: false,
  listeningTimer: null,
  greetingShown: false,
};

const S = () => store.settings;

/* ------------------------------------------------------------------ */
/* UI básica                                                           */
/* ------------------------------------------------------------------ */

function setState(next) {
  const wasIdle = app.state === 'idle';
  app.state = next;
  if (next === 'idle') {
    if (!wasIdle) {
      stopIdleWave();
      idleWave();
    }
  } else {
    stopIdleWave();
  }
  el.win.dataset.state = next;
  const labels = {
    idle: 'En espera',
    listening: 'Te escucho',
    thinking: 'Pensando…',
    speaking: 'Hablando',
  };
  el.status.textContent = app.muted ? 'Silenciado' : labels[next] || 'En espera';
  el.bubble.classList.toggle('listening', next === 'listening');
  el.btnMic.classList.toggle('is-active', next === 'listening');
  el.wave.classList.toggle('is-live', next === 'listening' || next === 'speaking');
}

function caption(text) {
  el.caption.textContent = text || '';
}

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

function addMessage(role, content, { tools = [], persist = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = escapeHtml(content).replace(/\n/g, '<br>');
  if (tools.length) {
    const tags = document.createElement('div');
    tags.className = 'msg-tools';
    tags.innerHTML = tools
      .map((t) => `<span class="tool-tag">${escapeHtml(typeof t === 'string' ? t : t.name)}</span>`)
      .join('');
    bubble.appendChild(tags);
  }
  wrap.appendChild(bubble);
  el.log.appendChild(wrap);
  el.log.scrollTop = el.log.scrollHeight;
  if (persist) store.addMessage(role, content);
  return wrap;
}

function showTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg assistant typing';
  wrap.id = 'typing';
  wrap.innerHTML =
    '<div class="msg-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
  el.log.appendChild(wrap);
  el.log.scrollTop = el.log.scrollHeight;
}

function hideTyping() {
  document.getElementById('typing')?.remove();
}

/* Visualizador de onda */
const WAVE_BARS = 22;
const bars = [];
for (let i = 0; i < WAVE_BARS; i += 1) {
  const b = document.createElement('span');
  el.wave.appendChild(b);
  bars.push({ node: b, energy: Math.random() });
}

function animateWave(level) {
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    const center = 1 - Math.abs(i - (WAVE_BARS - 1) / 2) / ((WAVE_BARS - 1) / 2);
    bar.energy = bar.energy * 0.72 + (level * (0.45 + center * 0.9) + Math.random() * 0.1) * 0.28;
    bar.node.style.height = `${Math.max(3, Math.min(24, 3 + bar.energy * 26))}px`;
  }
}

let idleRaf = 0;
function idleWave() {
  if (app.state !== 'idle') return;
  const t = performance.now() / 900;
  for (let i = 0; i < bars.length; i += 1) {
    bars[i].node.style.height = `${3 + (Math.sin(t + i * 0.55) * 0.5 + 0.5) * 3}px`;
  }
  idleRaf = requestAnimationFrame(idleWave);
}
idleWave();

function stopIdleWave() {
  cancelAnimationFrame(idleRaf);
}

/* ------------------------------------------------------------------ */
/* Voz                                                                 */
/* ------------------------------------------------------------------ */

const voice = new VoiceOut({
  api,
  getSettings: S,
  onStart: () => {
    setState('speaking');
    mic.pauseWake(true);
  },
  onEnd: () => {
    if (app.state === 'speaking') setState('idle');
    setTimeout(() => mic.pauseWake(false), 260);
    caption(app.muted ? 'Silenciado' : 'Di «Okey Pedus» o pulsa el orbe');
  },
  onLevel: (level) => {
    if (app.state === 'speaking') animateWave(level);
  },
});

async function say(text, { force = false } = {}) {
  const settings = S();
  if (!force && (!settings.speak || app.muted)) return;
  if (!text) return;
  try {
    await voice.speak(text, { voice: settings.voice });
  } catch (error) {
    console.warn(error);
  }
}

/* ------------------------------------------------------------------ */
/* Micrófono                                                           */
/* ------------------------------------------------------------------ */

const mic = new AudioInput({
  getSettings: S,
  onLevel: (level) => {
    if (app.state === 'listening') animateWave(level);
    // Barge-in: interrumpir a Pedus si hablo fuerte mientras él habla.
    if (app.state === 'speaking' && S().bargein && !app.muted && level > 0.42) {
      app.bargeAt = (app.bargeAt || 0) + 1;
      if (app.bargeAt > 3) {
        app.bargeAt = 0;
        voice.stop();
        startListening();
      }
    } else if (app.state !== 'speaking') {
      app.bargeAt = 0;
    }
  },
  onWake: (rest, meta) => handleWake(rest, meta),
  onPartial: (text) => {
    if (app.state === 'idle' && text && hasWakeWord(text)) caption(`«${text}»`);
  },
  onError: (error) => console.warn('[pedus] mic:', error.message),
});

async function ensureMic({ silent = false } = {}) {
  try {
    await mic.enable();
    if (S().wake && !app.muted) mic.startWake();
    app.permissionAsked = true;
    return true;
  } catch (error) {
    if (!silent) toast('Necesito permiso de micrófono. Pulsa el icono de la barra de direcciones.', 5200);
    console.warn('[pedus] mic:', error.message);
    return false;
  }
}

async function handleWake(rest, meta = {}) {
  const now = Date.now();
  if (now - app.wakeCooldown < 1400) return;
  app.wakeCooldown = now;
  if (app.state === 'thinking') return;

  if (app.state === 'speaking') {
    voice.stop();
    setState('idle');
  }

  if (rest && rest.length > 2) {
    // «Okey Pedus, abre ChatGPT» → ejecuta directamente.
    caption(rest);
    handleUserText(rest);
    return;
  }

  // Solo la wake word: escucha la frase completa.
  await startListening({ fromWake: true });
}

/* ------------------------------------------------------------------ */
/* Escucha                                                            */
/* ------------------------------------------------------------------ */

async function startListening({ fromWake = false } = {}) {
  if (app.busy) return;
  const ok = await ensureMic({ silent: fromWake });
  if (!ok) return;

  stopIdleWave();
  setState('listening');
  caption('Te escucho…');
  mic.pauseWake(true);

  // Si el reconocedor del sistema entiende, usamos eso (más rápido y gratis).
  if (mic.speechSupported && fromWake) {
    const quick = await mic.listenOnce({ timeoutMs: 9000 });
    if (quick) {
      mic.pauseWake(false);
      const text = cleanWakeWord(quick);
      if (text) return handleUserText(text);
    }
    // Sin resultado del reconocedor: grabamos y pasamos por Whisper.
    caption('Te escucho…');
  }

  const blob = await mic.recordUntilSilence({ silenceMs: Math.round(S().silence * 1000) });
  mic.pauseWake(false);

  if (!blob) {
    setState('idle');
    caption('No te he oído. Prueba otra vez.');
    ensureMic();
    return;
  }

  setState('thinking');
  caption('Transcribiendo…');
  try {
    const text = await api.transcribe(blob);
    if (!text || text.length < 2) {
      setState('idle');
      caption('No he entendido nada. ¿Otra vez?');
      return;
    }
    caption(text);
    await handleUserText(text);
  } catch (error) {
    setState('idle');
    caption(error.message);
    toast(error.message);
  }
}

/* ------------------------------------------------------------------ */
/* Conversación                                                        */
/* ------------------------------------------------------------------ */

function matchCommand(text) {
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[¿?¡!.,;:]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const t = norm(cleanWakeWord(text));
  if (!t) return null;
  return (
    store.state.commands.find((cmd) => {
      if (cmd.enabled === false) return false;
      const phrase = norm(cmd.phrase);
      if (!phrase) return false;
      if (t === phrase || t.startsWith(`${phrase} `)) return true;
      return phrase.length >= 4 && (` ${t} `.includes(` ${phrase} `) || t.includes(phrase));
    }) || null
  );
}

async function runCommand(cmd, originalText) {
  try {
    if (cmd.type === 'open_url') {
      const url = /^https?:/.test(cmd.value) ? cmd.value : `https://${cmd.value.replace(/^\/+/, '')}`;
      const opened = window.open(url, '_blank', 'noopener');
      if (!opened) toast('El navegador bloqueó la pestaña. Permite las ventanas emergentes para Pedus.');
      await respond(`He abierto ${cmd.value}.`, { tools: ['comando'], speak: true });
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
      await respond(out.result, { tools: [tool], speak: true });
      return true;
    }
    if (cmd.type === 'prompt') {
      await handleUserText(cmd.value || originalText, { skipCommands: true });
      return true;
    }
  } catch (error) {
    toast(error.message);
    await respond(`No he podido ejecutar ese comando: ${error.message}`, { speak: true });
    return true;
  }
  return false;
}

async function respond(text, { tools = [], speak = true, model } = {}) {
  hideTyping();
  if (!text) return;
  addMessage('assistant', text, { tools });
  caption(text);
  if (speak) await say(text);
  else setState('idle');
}

async function handleUserText(rawText, { skipCommands = false } = {}) {
  const text = String(rawText || '').trim();
  if (!text || app.busy) return;
  app.lastUserText = text;
  app.busy = true;
  stopIdleWave();
  el.win.classList.remove('is-compact');
  el.win.classList.add('is-expanded');

  addMessage('user', text);
  setState('thinking');
  caption(text);

  // 1) Comandos personalizados (instantáneos, sin tokens).
  if (!skipCommands) {
    const cmd = matchCommand(text);
    if (cmd) {
      showTyping();
      const handled = await runCommand(cmd, text);
      if (handled) {
        app.busy = false;
        return;
      }
    }
  }

  // 2) Cerebro completo con herramientas + visión opcional.
  showTyping();
  const image = app.pendingImage;
  app.pendingImage = null;
  try {
    const result = await api.chat({
      message: text,
      history: store.historyForModel(14).slice(0, -1),
      memory: store.memoryFacts(),
      settings: { style: S().style, voice: S().voice, timezone: S().timezone },
      image,
      timezone: S().timezone,
      mode: 'auto',
    });
    hideTyping();
    if (result.memories?.length) {
      for (const fact of result.memories) store.addMemory(fact);
      renderMemory();
    }
    executeActions(result.actions || []);
    addMessage('assistant', result.reply, { tools: (result.tools || []).map((t) => t.name) });
    caption(result.reply);
    await say(result.reply);
  } catch (error) {
    hideTyping();
    const msg =
      error.code === 'missing_groq_key'
        ? 'Falta la clave de Groq en el servidor. Añade GROQ_API_KEY en Render y vuelve a intentarlo.'
        : error.message;
    addMessage('assistant', msg, { persist: false });
    caption(msg);
    toast(msg, 5000);
    setState('idle');
  } finally {
    app.busy = false;
    if (app.state === 'thinking') setState('idle');
    ensureMic({ silent: true });
  }
}

/* ------------------------------------------------------------------ */
/* Acciones que pide el servidor                                       */
/* ------------------------------------------------------------------ */

function executeActions(actions) {
  for (const action of actions) {
    switch (action.type) {
      case 'open_url': {
        const w = window.open(action.url, '_blank', 'noopener');
        if (!w) toast('Permite ventanas emergentes para que Pedus abra pestañas.');
        break;
      }
      case 'timer': {
        const id = setTimeout(() => {
          toast(`⏰ ${action.label}: se acabó el tiempo`, 7000);
          say(`Se acabó el temporizador de ${action.label}.`, { force: true });
        }, action.seconds * 1000);
        app.timers.push(id);
        toast(`⏱️ Temporizador de ${action.seconds}s: ${action.label}`);
        break;
      }
      case 'remember': {
        if (store.addMemory(action.fact)) renderMemory();
        break;
      }
      case 'set_voice': {
        store.updateSettings({ voice: action.voice });
        syncSettingsUI();
        break;
      }
      case 'ui': {
        if (action.action === 'minimize') minimize();
        if (action.action === 'expand') restore();
        if (action.action === 'open_settings') openSettings();
        if (action.action === 'mute') {
          app.muted = true;
          voice.stop();
          setState('idle');
          toast('Micrófono y voz silenciados');
        }
        if (action.action === 'unmute') {
          app.muted = false;
          setState('idle');
          toast('Voz activada');
        }
        break;
      }
      default:
        break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Pantalla / visión                                                   */
/* ------------------------------------------------------------------ */

const screen = new ScreenShare({
  api,
  onCapture: (dataUrl) => {
    app.pendingImage = dataUrl;
    el.screenThumb.src = dataUrl;
    el.screenPreview.hidden = false;
  },
  onStop: () => {
    el.screenPreview.hidden = true;
    el.btnScreen.classList.remove('is-active');
    toast('Has dejado de compartir pantalla');
  },
  onError: (e) => toast(e.message),
});

async function shareScreen() {
  try {
    await screen.start();
    el.btnScreen.classList.add('is-active');
    el.screenLabel.textContent = 'Pantalla compartida';
    el.screenPreview.hidden = false;
    const frame = await screen.grab();
    el.screenThumb.src = frame;
    app.pendingImage = frame;
    toast('Pantalla lista. Pregúntame «¿qué ves?»', 4200);
  } catch (error) {
    if (error.name === 'NotAllowedError') toast('Has cancelado la captura de pantalla.');
    else toast(error.message);
  }
}

async function captureOnce(question = '¿Qué ves en mi pantalla? Analízalo y dime lo importante.') {
  try {
    if (!screen.active) await screen.start();
    el.btnScreen.classList.add('is-active');
    el.screenPreview.hidden = false;
    el.screenLabel.textContent = 'Captura lista';
    const frame = await screen.grab();
    el.screenThumb.src = frame;
    app.pendingImage = frame;
    await handleUserText(question);
  } catch (error) {
    toast(error.name === 'NotAllowedError' ? 'Cancelaste la captura.' : error.message);
  }
}

/* ------------------------------------------------------------------ */
/* Ventana                                                             */
/* ------------------------------------------------------------------ */

function minimize() {
  el.win.classList.add('is-minimized');
  el.bubble.hidden = false;
}

function restore() {
  el.win.classList.remove('is-minimized');
  el.bubble.hidden = true;
}

function toggleExpand() {
  el.win.classList.toggle('is-expanded');
  el.win.classList.toggle('is-compact', false);
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                             */
/* ------------------------------------------------------------------ */

function openSettings() {
  el.settingsBackdrop.hidden = false;
  renderMemory();
  renderCommands();
  renderStatus();
  syncSettingsUI();
}

function closeSettings() {
  el.settingsBackdrop.hidden = true;
}

function syncSettingsUI() {
  const s = S();
  if (el.setVoice.options.length && s.voice) el.setVoice.value = s.voice;
  el.setStyle.value = s.style;
  el.setRate.value = s.rate;
  el.outRate.textContent = `${Number(s.rate).toFixed(2).replace(/0$/, '')}×`;
  el.setSpeak.checked = s.speak;
  el.setBargein.checked = s.bargein;
  el.setSilence.value = s.silence;
  el.outSilence.textContent = `${Number(s.silence).toFixed(1)} s`;
  el.setSens.value = s.sensitivity;
  el.outSens.textContent = sensLabel(s.sensitivity);
  el.setWake.checked = s.wake;
  el.setTheme.checked = s.theme === 'light';
  document.documentElement.dataset.theme = s.theme;
}

function sensLabel(v) {
  const n = Number(v);
  if (n < 0.38) return 'baja';
  if (n < 0.62) return 'media';
  return 'alta';
}

function renderCommands() {
  el.cmdList.innerHTML = '';
  if (!store.state.commands.length) {
    el.cmdList.innerHTML = '<li><span class="cmd-target">Aún no tienes comandos. Añade uno arriba.</span></li>';
  }
  for (const cmd of store.state.commands) {
    const li = document.createElement('li');
    const target = cmd.type === 'tool' ? cmd.value.split('|')[0] : cmd.value;
    li.innerHTML = `
      <span class="cmd-phrase">«${escapeHtml(cmd.phrase)}»</span>
      <span class="cmd-arrow">→</span>
      <span class="cmd-target">${escapeHtml(target)}</span>
      <button class="mini-btn" title="Borrar" data-id="${cmd.id}">✕</button>`;
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
      <button class="mini-btn" title="Olvidar">✕</button>`;
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
    ['Voz', `${S().voice}${app.config ? '' : ' (local)'}`, ''],
    ['Micrófono', mic.stream ? 'Activo' : 'Inactivo', mic.stream ? 'ok' : ''],
    ['Wake word', mic.wakeActive ? 'Escuchando' : 'Off', mic.wakeActive ? 'ok' : ''],
    ['Versión', c?.version || '1.2.0', ''],
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
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

el.orb.addEventListener('click', async () => {
  if (app.state === 'speaking') {
    voice.stop();
    setState('idle');
    return;
  }
  if (app.state === 'listening') return;
  await startListening();
});

el.btnMic.addEventListener('click', async () => {
  if (app.state === 'listening') {
    mic.cancelRecording?.();
    setState('idle');
    caption('Cancelado');
    return;
  }
  await startListening();
});

el.bubble.addEventListener('click', () => {
  restore();
  startListening();
});

el.composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = el.input.value.trim();
  if (!value) return;
  el.input.value = '';
  handleUserText(value);
});

el.chips.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  if (chip.dataset.action === 'open_site') {
    executeActions([{ type: 'open_url', url: 'https://chat.openai.com' }]);
    return;
  }
  if (/pantalla|resume/i.test(chip.dataset.prompt || '')) {
    captureOnce(chip.dataset.prompt);
    return;
  }
  handleUserText(chip.dataset.prompt);
});

el.btnScreen.addEventListener('click', () => (screen.active ? screen.grab().then((f) => { app.pendingImage = f; el.screenThumb.src = f; toast('Captura actualizada'); }) : shareScreen()));

el.btnScreenStop.addEventListener('click', () => {
  screen.stop();
  el.screenPreview.hidden = true;
  el.btnScreen.classList.remove('is-active');
  app.pendingImage = null;
});

el.btnPhoto.addEventListener('click', () => el.fileInput.click());

el.fileInput.addEventListener('change', async () => {
  const file = el.fileInput.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await fileToDataUrl(file);
    app.pendingImage = dataUrl;
    el.screenThumb.src = dataUrl;
    el.screenLabel.textContent = file.name;
    el.screenPreview.hidden = false;
    toast('Foto lista. Pregúntame qué me parece.');
  } catch {
    toast('No pude leer esa imagen.');
  } finally {
    el.fileInput.value = '';
  }
});

el.btnMinimize.addEventListener('click', minimize);
el.btnExpand.addEventListener('click', toggleExpand);
el.btnSettings.addEventListener('click', openSettings);
el.btnCloseSettings.addEventListener('click', closeSettings);
el.settingsBackdrop.addEventListener('click', (e) => {
  if (e.target === el.settingsBackdrop) closeSettings();
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === tab.dataset.tab));
  });
});

el.setVoice.addEventListener('change', () => store.updateSettings({ voice: el.setVoice.value }));
el.setStyle.addEventListener('change', () => store.updateSettings({ style: el.setStyle.value }));
el.setRate.addEventListener('input', () => {
  store.updateSettings({ rate: Number(el.setRate.value) });
  el.outRate.textContent = `${Number(el.setRate.value).toFixed(2).replace(/0$/, '')}×`;
});
el.setSpeak.addEventListener('change', () => store.updateSettings({ speak: el.setSpeak.checked }));
el.setBargein.addEventListener('change', () => store.updateSettings({ bargein: el.setBargein.checked }));
el.setSilence.addEventListener('input', () => {
  store.updateSettings({ silence: Number(el.setSilence.value) });
  el.outSilence.textContent = `${Number(el.setSilence.value).toFixed(1)} s`;
});
el.setSens.addEventListener('input', () => {
  store.updateSettings({ sensitivity: Number(el.setSens.value) });
  el.outSens.textContent = sensLabel(el.setSens.value);
});
el.setWake.addEventListener('change', async () => {
  store.updateSettings({ wake: el.setWake.checked });
  if (el.setWake.checked) {
    await ensureMic();
    mic.startWake();
  } else {
    mic.stopWake();
  }
  renderStatus();
});
el.setTheme.addEventListener('change', () => {
  const theme = el.setTheme.checked ? 'light' : 'dark';
  store.updateSettings({ theme });
  document.documentElement.dataset.theme = theme;
});

el.btnTestVoice.addEventListener('click', async () => {
  el.btnTestVoice.disabled = true;
  el.btnTestVoice.textContent = 'Hablando…';
  await say('Hola, soy Pedus. Así suena mi voz. ¿Te gusta?', { force: true });
  el.btnTestVoice.disabled = false;
  el.btnTestVoice.textContent = 'Probar voz';
});

el.btnPermission.addEventListener('click', async () => {
  const ok = await ensureMic();
  toast(ok ? 'Micrófono activo. Di «Okey Pedus».' : 'No se pudo activar el micrófono.');
  renderStatus();
});

el.cmdForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const phrase = el.cmdPhrase.value.trim();
  const value = el.cmdValue.value.trim();
  const type = el.cmdType.value;
  if (!phrase || !value) return;
  store.addCommand({ phrase, value, type });
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
  el.btnDiagnostics.textContent = 'Probando…';
  try {
    const res = await api.diagnostics();
    toast(res.groqConfigured ? `Groq OK · ${res.models?.chat}` : 'Falta GROQ_API_KEY en Render');
  } catch (error) {
    toast(`Groq falló: ${error.message}`, 6000);
  } finally {
    el.btnDiagnostics.disabled = false;
    el.btnDiagnostics.textContent = 'Probar Groq';
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

/* Atajos de teclado */
document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  const settingsOpen = !el.settingsBackdrop.hidden;
  if (e.code === 'Space' && !typing && !settingsOpen) {
    e.preventDefault();
    if (app.state === 'speaking') voice.stop();
    else startListening();
  }
  if (e.key === 'Escape') {
    if (!el.settingsBackdrop.hidden) closeSettings();
    else if (app.state === 'speaking') voice.stop();
    else minimize();
  }
  if (e.key === '/' && !typing) {
    e.preventDefault();
    el.input.focus();
  }
});

/* Arrastrar la ventana (desktop / ChromeOS con ratón) */
(() => {
  const handle = $('drag-handle');
  let start = null;
  let offset = { x: 0, y: 0 };
  let dragging = false;

  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const rect = el.win.getBoundingClientRect();
    start = { x: e.clientX, y: e.clientY };
    offset = { x: rect.left, y: rect.top };
    dragging = false;
    el.win.style.position = 'fixed';
    el.win.style.margin = '0';
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragging && Math.hypot(dx, dy) < 5) return;
    dragging = true;
    const w = el.win.offsetWidth;
    const h = el.win.offsetHeight;
    const left = Math.min(Math.max(8, offset.x + dx), window.innerWidth - w - 8);
    const top = Math.min(Math.max(8, offset.y + dy), window.innerHeight - Math.min(h, 200) - 8);
    el.win.style.left = `${left}px`;
    el.win.style.top = `${top}px`;
    el.win.style.transform = 'none';
  });

  const end = () => {
    start = null;
    dragging = false;
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
})();

window.addEventListener('beforeunload', () => {
  screen.stop();
  mic.stop();
  voice.stop();
});

store.subscribe(() => {
  renderStatus();
});

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

async function boot() {
  const s = S();
  document.documentElement.dataset.theme = s.theme || 'dark';
  const wantsListen = new URLSearchParams(location.search).get('listen') === '1';

  // Historial reciente en pantalla (últimos 6 mensajes).
  for (const m of store.state.history.slice(-6)) {
    addMessage(m.role, m.content, { persist: false });
  }

  try {
    app.config = await api.config();
    el.setVoice.innerHTML = app.config.ttsVoices
      .map((v) => `<option value="${v.id}">${v.label} · ${v.gender}</option>`)
      .join('');
    if (!app.config.ttsVoices.some((v) => v.id === s.voice)) {
      store.updateSettings({ voice: app.config.defaultVoice });
    }
    syncSettingsUI();
    renderStatus();
    if (!app.config.capabilities.groq) {
      caption('Falta GROQ_API_KEY en Render');
      toast('El servidor no tiene GROQ_API_KEY. Añádela en Render → Environment.', 8000);
    }
  } catch (error) {
    toast('No pude cargar la configuración del servidor.');
  }

  try {
    const g = await api.greeting();
    if (!store.state.history.length) {
      caption(g.text);
    }
  } catch {
    /* opcional */
  }

  // La wake word necesita gesto del usuario: pedimos permiso al primer click.
  const unlock = async () => {
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
    if (!app.permissionAsked) {
      await ensureMic({ silent: true });
      renderStatus();
    }
    // Desbloquea el AudioContext para TTS.
    voice.ensureContext?.().catch(() => {});
  };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });

  if (!mic.speechSupported) {
    el.wakeHint.textContent =
      'Tu navegador no soporta el reconocimiento nativo: la wake word «Okey Pedus» no estará activa, pero puedes pulsar el orbe y hablar (Whisper de Groq transcribe tu voz).';
  }

  setState('idle');

  // Service worker: arranque instantáneo aunque Render esté frío.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Atajo de la PWA: ?listen=1 abre el micrófono al primer gesto.
  if (wantsListen) {
    document.addEventListener('pointerdown', () => setTimeout(() => startListening(), 250), { once: true });
  }
}

boot();
