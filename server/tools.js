/**
 * Herramientas que Pedus puede ejecutar por sí mismo.
 * Cada herramienta devuelve:
 *   - result: texto que se devuelve al modelo
 *   - actions: órdenes para el navegador (abrir pestañas, poner temporizadores, cambiar voz...)
 */

import { config } from './config.js';
import { chatCompletion } from './groq.js';

const GH_API = 'https://api.github.com';

export const KNOWN_SITES = {
  chatgpt: { url: 'https://chat.openai.com', label: 'ChatGPT' },
  'chat gpt': { url: 'https://chat.openai.com', label: 'ChatGPT' },
  openai: { url: 'https://chat.openai.com', label: 'ChatGPT' },
  claude: { url: 'https://claude.ai', label: 'Claude' },
  gemini: { url: 'https://gemini.google.com', label: 'Gemini' },
  youtube: { url: 'https://youtube.com', label: 'YouTube' },
  'you tube': { url: 'https://youtube.com', label: 'YouTube' },
  gmail: { url: 'https://mail.google.com', label: 'Gmail' },
  correo: { url: 'https://mail.google.com', label: 'Gmail' },
  drive: { url: 'https://drive.google.com', label: 'Google Drive' },
  calendar: { url: 'https://calendar.google.com', label: 'Google Calendar' },
  calendario: { url: 'https://calendar.google.com', label: 'Google Calendar' },
  maps: { url: 'https://maps.google.com', label: 'Google Maps' },
  spotify: { url: 'https://open.spotify.com', label: 'Spotify' },
  netflix: { url: 'https://netflix.com', label: 'Netflix' },
  github: { url: 'https://github.com', label: 'GitHub' },
  render: { url: 'https://dashboard.render.com', label: 'Render' },
  uptimerobot: { url: 'https://uptimerobot.com/dashboard', label: 'UptimeRobot' },
  'uptime robot': { url: 'https://uptimerobot.com/dashboard', label: 'UptimeRobot' },
  groq: { url: 'https://console.groq.com', label: 'Groq Console' },
  twitter: { url: 'https://x.com', label: 'X' },
  x: { url: 'https://x.com', label: 'X' },
  instagram: { url: 'https://instagram.com', label: 'Instagram' },
  tiktok: { url: 'https://tiktok.com', label: 'TikTok' },
  whatsapp: { url: 'https://web.whatsapp.com', label: 'WhatsApp Web' },
  notion: { url: 'https://notion.so', label: 'Notion' },
  figma: { url: 'https://figma.com', label: 'Figma' },
  wikipedia: { url: 'https://es.wikipedia.org', label: 'Wikipedia' },
  chatgpt_plus: { url: 'https://chatgpt.com', label: 'ChatGPT' },
};

const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

export function resolveSite(name) {
  const key = normalize(name);
  if (KNOWN_SITES[key]) return KNOWN_SITES[key];
  for (const [site, info] of Object.entries(KNOWN_SITES)) {
    if (key.includes(site)) return info;
  }
  if (/^[\w-]+(\.[\w-]+)+/.test(key)) return { url: `https://${key.replace(/^https?:\/\//, '')}`, label: key };
  return null;
}

export function guessUrlFromText(text) {
  const lower = normalize(text);
  const match = lower.match(/(abre|open|lanza|entra en|ve a|pon)\s+(.+)$/);
  if (match) {
    const site = resolveSite(match[2].replace(/[.!,?¿¡]+$/g, ''));
    if (site) return site;
  }
  return resolveSite(lower.replace(/[.!,?¿¡]+$/g, ''));
}

async function githubFetch(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${GH_API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'PedusAssistant-1.2',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(config.github.token ? { Authorization: `Bearer ${config.github.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text.slice(0, 300) };
  }
  if (!res.ok) {
    const hint =
      res.status === 403 && /rate limit/i.test(text)
        ? ' (límite de la API de GitHub; añade GITHUB_TOKEN en Render para subir el límite)'
        : '';
    throw new Error(`GitHub ${res.status}: ${data?.message || 'error'}${hint}`);
  }
  return data;
}

/* ------------------------------------------------------------------ */
/* Definiciones expuestas al modelo (formato OpenAI/Groq tools)        */
/* ------------------------------------------------------------------ */

export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'open_site',
      description:
        'Abre una web, app o pestaña en el navegador del usuario (ChromeOS). Úsalo cuando pida abrir ChatGPT, YouTube, Gmail, Spotify, un repositorio de GitHub o cualquier URL.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Nombre del servicio, dominio o URL completa.' },
          query: { type: 'string', description: 'Opción de búsqueda dentro del servicio (por ejemplo, una búsqueda de YouTube).' },
        },
        required: ['target'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Busca información actual en internet. Úsalo para noticias, precios, datos recientes o cualquier cosa que pueda haber cambiado.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Consulta de búsqueda.' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_timer',
      description: 'Crea un temporizador o alarma en el dispositivo del usuario.',
      parameters: {
        type: 'object',
        properties: {
          seconds: { type: 'number', description: 'Duración en segundos.' },
          label: { type: 'string', description: 'Para qué es el temporizador (ej. "pasta").' },
        },
        required: ['seconds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember_fact',
      description:
        'Guarda un dato duradero sobre el usuario (nombre, gustos, proyectos, forma de hablar que prefiere) para recordarlo en futuras conversaciones.',
      parameters: {
        type: 'object',
        properties: {
          fact: { type: 'string', description: 'Dato conciso en tercera persona, ej. "Se llama Edu y vive en Palamós".' },
        },
        required: ['fact'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_voice',
      description: 'Cambia la voz con la que Pedus habla (diana, hannah, autumn, austin, daniel, troy).',
      parameters: {
        type: 'object',
        properties: { voice: { type: 'string', enum: ['diana', 'hannah', 'autumn', 'austin', 'daniel', 'troy'] } },
        required: ['voice'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'control_ui',
      description: 'Controla la interfaz flotante de Pedus: minimizar, abrir ajustes, silenciar o cerrar.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['minimize', 'expand', 'open_settings', 'mute', 'unmute'] },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_profile',
      description: 'Obtiene el perfil público de un usuario de GitHub (repos, seguidores, bio).',
      parameters: {
        type: 'object',
        properties: { username: { type: 'string', description: 'Usuario de GitHub. Si se omite, usa el configurado.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_repos',
      description: 'Lista los repositorios de un usuario de GitHub con su lenguaje, estrellas y fecha de actualización.',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Usuario de GitHub.' },
          sort: { type: 'string', enum: ['updated', 'pushed', 'stars', 'created'] },
          limit: { type: 'number', description: 'Máximo de repos a devolver (1-10).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_repo',
      description: 'Detalle de un repositorio concreto: descripción, estrellas, issues abiertos, último push, URL y lenguajes.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Formato "usuario/repositorio" o solo el nombre si es del usuario configurado.' },
        },
        required: ['repo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_issues',
      description: 'Lista issues abiertos de un repositorio.',
      parameters: {
        type: 'object',
        properties: {
          repo: { type: 'string', description: 'Formato "usuario/repositorio".' },
          state: { type: 'string', enum: ['open', 'closed', 'all'] },
          limit: { type: 'number' },
        },
        required: ['repo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: 'Devuelve la fecha y hora actual local. Úsalo para cualquier pregunta temporal.',
      parameters: {
        type: 'object',
        properties: { timezone: { type: 'string', description: 'Zona IANA, ej. Europe/Madrid.' } },
      },
    },
  },
];

const clamp = (n, min, max, fallback) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
};

/* ------------------------------------------------------------------ */
/* Ejecución                                                           */
/* ------------------------------------------------------------------ */

export async function executeTool(name, rawArgs = {}, ctx = {}) {
  const args = typeof rawArgs === 'string' ? safeJson(rawArgs) : rawArgs || {};
  const actions = [];

  switch (name) {
    case 'open_site': {
      if (!config.features.openUrls) return { result: 'Abrir pestañas está desactivado en la configuración.', actions };
      const site = resolveSite(args.target) || guessUrlFromText(args.target);
      if (!site) return { result: `No sé a qué web te refieres con "${args.target}".`, actions };
      let url = site.url;
      if (args.query) {
        const q = encodeURIComponent(args.query);
        if (/youtube/.test(url)) url = `https://www.youtube.com/results?search_query=${q}`;
        else if (/google/.test(url)) url = `https://www.google.com/search?q=${q}`;
        else if (/github/.test(url)) url = `https://github.com/search?q=${q}`;
        else if (/spotify/.test(url)) url = `https://open.spotify.com/search/${q}`;
      }
      actions.push({ type: 'open_url', url });
      return { result: `Abierto ${site.label || url} en una pestaña nueva.`, actions };
    }

    case 'web_search': {
      const query = String(args.query || '').slice(0, 500);
      if (!query) return { result: 'Falta la consulta de búsqueda.', actions };
      const data = await chatCompletion({
        model: config.models.research,
        messages: [
          {
            role: 'system',
            content:
              'Eres un buscador experto. Responde en español con hechos actuales y concisos (máx. 180 palabras). Incluye las fuentes (URLs) al final.',
          },
          { role: 'user', content: query },
        ],
        temperature: 0.3,
        maxTokens: 900,
      });
      const text = data?.choices?.[0]?.message?.content?.trim() || 'Sin resultados.';
      return { result: text, actions };
    }

    case 'set_timer': {
      const seconds = clamp(args.seconds, 1, 86_400, 60);
      const label = String(args.label || 'temporizador').slice(0, 60);
      actions.push({ type: 'timer', seconds, label });
      return { result: `Temporizador de ${seconds} segundos creado para "${label}".`, actions };
    }

    case 'remember_fact': {
      const fact = String(args.fact || '').trim().slice(0, 300);
      if (!fact) return { result: 'No había nada que recordar.', actions };
      actions.push({ type: 'remember', fact });
      return { result: `Memorizado: ${fact}`, actions };
    }

    case 'set_voice': {
      const voice = String(args.voice || '').toLowerCase();
      if (!config.ttsVoices.some((v) => v.id === voice)) {
        return { result: `Voz no disponible. Opciones: ${config.ttsVoices.map((v) => v.id).join(', ')}.`, actions };
      }
      actions.push({ type: 'set_voice', voice });
      return { result: `Voz cambiada a ${voice}.`, actions };
    }

    case 'control_ui': {
      const allowed = ['minimize', 'expand', 'open_settings', 'mute', 'unmute'];
      if (!allowed.includes(args.action)) return { result: 'Acción de interfaz no válida.', actions };
      actions.push({ type: 'ui', action: args.action });
      return { result: `Interfaz: ${args.action}.`, actions };
    }

    case 'get_time': {
      const tz = String(args.timezone || ctx.timezone || 'Europe/Madrid');
      try {
        const fmt = new Intl.DateTimeFormat('es-ES', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: tz,
        });
        return { result: `Ahora es ${fmt.format(new Date())} (${tz}).`, actions };
      } catch {
        return { result: `Ahora es ${new Date().toISOString()} (UTC).`, actions };
      }
    }

    case 'github_profile': {
      const username = String(args.username || config.github.defaultUser || '').replace(/^@/, '');
      if (!username) return { result: 'Dime el usuario de GitHub que quieres consultar.', actions };
      const u = await githubFetch(`/users/${encodeURIComponent(username)}`);
      actions.push({ type: 'open_url', url: u.html_url, optional: true });
      return {
        result: [
          `Usuario: ${u.login}${u.name ? ` (${u.name})` : ''}`,
          u.bio ? `Bio: ${u.bio}` : null,
          `Repos públicos: ${u.public_repos} · Seguidores: ${u.followers}`,
          `Ubicación: ${u.location || 'no indicada'} · Web: ${u.blog || 'sin web'}`,
          `Perfil: ${u.html_url}`,
        ]
          .filter(Boolean)
          .join('\n'),
        actions,
      };
    }

    case 'github_repos': {
      const username = String(args.username || config.github.defaultUser || '').replace(/^@/, '');
      if (!username) return { result: 'Dime el usuario de GitHub.', actions };
      const limit = clamp(args.limit, 1, 10, 6);
      const sort = ['updated', 'pushed', 'stars', 'created'].includes(args.sort) ? args.sort : 'updated';
      const repos = await githubFetch(
        `/users/${encodeURIComponent(username)}/repos?per_page=${limit}&sort=${sort === 'pushed' ? 'pushed' : sort}&direction=desc`,
      );
      if (!Array.isArray(repos) || !repos.length) return { result: `${username} no tiene repositorios públicos.`, actions };
      const list = repos
        .slice(0, limit)
        .map(
          (r) =>
            `- ${r.name} (${r.language || 'sin lenguaje'}, ⭐ ${r.stargazers_count}, actualizado ${new Date(
              r.pushed_at || r.updated_at,
            ).toLocaleDateString('es-ES')})${r.description ? `: ${r.description}` : ''} → ${r.html_url}`,
        )
        .join('\n');
      return { result: `Repositorios de ${username}:\n${list}`, actions };
    }

    case 'github_repo': {
      let full = String(args.repo || '').trim();
      if (!full.includes('/')) {
        const user = config.github.defaultUser;
        if (!user) return { result: 'Necesito el formato usuario/repositorio.', actions };
        full = `${user}/${full}`;
      }
      const [owner, repoName] = full.split('/');
      const r = await githubFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`);
      const langs = await githubFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/languages`).catch(
        () => ({}),
      );
      const langList = Object.entries(langs || {})
        .map(([k, v]) => `${k} (${v} bytes)`)
        .join(', ');
      return {
        result: [
          `Repositorio ${r.full_name}`,
          r.description ? `Descripción: ${r.description}` : null,
          `Lenguaje principal: ${r.language || 'n/d'}${langList ? ` · Lenguajes: ${langList}` : ''}`,
          `⭐ ${r.stargazers_count} · Forks ${r.forks_count} · Issues abiertos ${r.open_issues_count} · Watch ${r.subscribers_count}`,
          `Último push: ${new Date(r.pushed_at).toLocaleString('es-ES')}`,
          `URL: ${r.html_url}`,
          r.homepage ? `Homepage: ${r.homepage}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        actions,
      };
    }

    case 'github_issues': {
      let full = String(args.repo || '').trim();
      if (!full.includes('/')) {
        if (!config.github.defaultUser) return { result: 'Necesito el formato usuario/repositorio.', actions };
        full = `${config.github.defaultUser}/${full}`;
      }
      const [owner, repoName] = full.split('/');
      const state = ['open', 'closed', 'all'].includes(args.state) ? args.state : 'open';
      const limit = clamp(args.limit, 1, 10, 5);
      const issues = await githubFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/issues?state=${state}&per_page=${limit}`,
      );
      if (!Array.isArray(issues) || !issues.length) return { result: `No hay issues ${state} en ${full}.`, actions };
      const list = issues
        .filter((i) => !i.pull_request)
        .map((i) => `- #${i.number} ${i.title} (${i.user?.login}, ${i.comments} comentarios) → ${i.html_url}`)
        .join('\n');
      return { result: `Issues ${state} en ${full}:\n${list || 'sin issues (solo PRs)'}`, actions };
    }

    default:
      return { result: `Herramienta desconocida: ${name}`, actions };
  }
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
