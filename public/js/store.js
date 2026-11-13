/* Persistencia local (localStorage) — nada sale del navegador salvo al enviar mensajes. */

const KEY = 'pedus.v12';

export const defaultSettings = {
  voice: 'diana',
  engine: 'auto', // auto = voz neuronal de Groq con respaldo del sistema · system = voz del sistema (español nativo)
  autoPip: true,
  style: 'equilibrado',
  rate: 1,
  speak: true,
  chime: true,
  disabledPresets: [],
  silence: 1,
  sensitivity: 0.5,
  theme: 'dark',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid',
  lang: 'es-ES',
};

const empty = () => ({
  settings: { ...defaultSettings },
  memory: [],
  commands: [],
  history: [],
  stats: { messages: 0, since: new Date().toISOString() },
});

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    return {
      ...empty(),
      ...parsed,
      settings: { ...defaultSettings, ...(parsed.settings || {}) },
      memory: Array.isArray(parsed.memory) ? parsed.memory : [],
      commands: Array.isArray(parsed.commands) ? parsed.commands : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return empty();
  }
}

let state = read();
const listeners = new Set();

function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
  for (const fn of listeners) fn(state);
}

export const store = {
  get state() {
    return state;
  },
  get settings() {
    return state.settings;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  updateSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    commit();
  },
  addMessage(role, content, extra = {}) {
    state.history.push({ role, content, at: Date.now(), ...extra });
    if (state.history.length > 60) state.history = state.history.slice(-60);
    state.stats.messages += 1;
    commit();
  },
  clearHistory() {
    state.history = [];
    commit();
  },
  historyForModel(limit = 16) {
    return state.history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-limit)
      .map((m) => ({ role: m.role, content: m.content }));
  },
  addMemory(fact) {
    const clean = String(fact || '').trim();
    if (!clean) return false;
    if (state.memory.some((m) => m.fact.toLowerCase() === clean.toLowerCase())) return false;
    state.memory.push({ fact: clean, at: Date.now() });
    if (state.memory.length > 60) state.memory = state.memory.slice(-60);
    commit();
    return true;
  },
  removeMemory(at) {
    state.memory = state.memory.filter((m) => m.at !== at);
    commit();
  },
  clearMemory() {
    state.memory = [];
    commit();
  },
  memoryFacts() {
    return state.memory.map((m) => m.fact);
  },
  addCommand(cmd) {
    state.commands.push({ id: crypto.randomUUID(), enabled: true, ...cmd });
    commit();
  },
  removeCommand(id) {
    state.commands = state.commands.filter((c) => c.id !== id);
    commit();
  },
  clearAll() {
    state = empty();
    commit();
  },
};
