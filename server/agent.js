import { config } from './config.js';
import { chatCompletion } from './groq.js';
import { modelFor, withModel } from './models.js';
import { buildSystemPrompt } from './persona.js';
import { executeTool, toolDefinitions } from './tools.js';

const MAX_TOOL_ROUNDS = 4;

function normalizeHistory(history = []) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-config.limits.maxHistoryMessages)
    .map((m) => ({ role: m.role, content: m.content.slice(0, config.limits.maxMessageChars) }));
}

const DEEP_HINT = /(^|[^\p{L}])(analiza|expl[ií]came|compara|estrategia|investiga|demuestra|razona|paso a paso)(?=$|[^\p{L}])/iu;

/** Qué "cerebro" toca: el modelo concreto lo decide server/models.js. */
function pickRole({ mode, message, image }) {
  if (image) return 'vision';
  if (mode === 'deep') return 'deep';
  if (mode === 'fast') return 'fast';
  if (mode === 'recap') return 'chat';
  return message.length > 600 || DEEP_HINT.test(message) ? 'deep' : 'chat';
}

/**
 * Ejecuta un turno de conversación con bucle de herramientas.
 * Devuelve { reply, actions, tools, model, memories, usage }.
 */
export async function runAgent({
  message,
  history = [],
  memory = [],
  settings = {},
  image = null, // data URL
  timezone = 'Europe/Madrid',
  mode = 'auto',
}) {
  const text = String(message || '').trim().slice(0, config.limits.maxMessageChars);
  if (!text && !image) throw new Error('Mensaje vacío.');

  let role = pickRole({ mode, message: text, image });
  const messages = [
    {
      role: 'system',
      content: buildSystemPrompt({
        memory,
        settings,
        timezone,
        screenMode: Boolean(image),
        githubUser: config.github.defaultUser,
      }),
    },
    ...normalizeHistory(history),
  ];

  const userContent = image
    ? [
        { type: 'text', text: text || '¿Qué ves en esta pantalla? Descríbelo y dime si hay algo que deba saber.' },
        { type: 'image_url', image_url: { url: image } },
      ]
    : text;
  messages.push({ role: 'user', content: userContent });

  const actions = [];
  const usedTools = [];
  const newMemories = [];
  let reply = '';
  let usage = null;
  let currentModel = null; // se fija en la primera llamada que funcione

  const call = async ({ withTools = true } = {}) => {
    const params = {
      messages,
      ...(withTools ? { tools: toolDefinitions, toolChoice: 'auto' } : {}),
      temperature: image ? 0.5 : 0.65,
      maxTokens: 1100,
    };
    if (currentModel) return chatCompletion({ model: currentModel, ...params });
    const { model, value } = await withModel(role, (m) => chatCompletion({ model: m, ...params }));
    currentModel = model;
    return value;
  };

  let fellBack = false;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    let completion;
    try {
      completion = await call();
    } catch (error) {
      if (error?.code === 'missing_groq_key' || fellBack) throw error;
      fellBack = true;
      if (image) {
        // Algunos modelos de visión no aceptan herramientas: reintenta sin ellas.
        completion = await call({ withTools: false });
      } else {
        // Otro modelo distinto (otro cupo, otro formato de tool calling).
        const backup = await modelFor('fast');
        if (!backup || backup === currentModel) throw error;
        console.warn(`[pedus] ${currentModel || role} falló (${error.message.slice(0, 100)}); pruebo con ${backup}`);
        role = 'fast';
        currentModel = null;
        completion = await call();
      }
    }

    usage = completion?.usage || usage;
    const choice = completion?.choices?.[0];
    const msg = choice?.message;
    if (!msg) throw new Error('Groq devolvió una respuesta vacía.');

    const calls = msg.tool_calls || [];
    if (calls.length) {
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
      for (const call of calls) {
        const name = call.function?.name;
        let args = {};
        try {
          args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }
        usedTools.push({ name, args });
        let output;
        try {
          output = await executeTool(name, args, { timezone, settings });
        } catch (error) {
          output = { result: `La herramienta ${name} falló: ${error.message}`, actions: [] };
        }
        actions.push(...(output.actions || []));
        for (const action of output.actions || []) {
          if (action.type === 'remember') newMemories.push(action.fact);
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name,
          content: String(output.result).slice(0, 4000),
        });
      }
      continue;
    }

    reply = (msg.content || '').trim();
    break;
  }

  if (!reply) {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.content);
    reply = lastAssistant?.content?.trim() || 'Me he quedado en blanco. ¿Me lo repites?';
  }

  // Limpieza para voz: quita markdown residual que suena mal leído.
  reply = reply
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/[*`]/g, '')
    .replace(/(^|\s)[#>]+\s/g, '$1')
    .replace(/(^|\s)_+|_+(?=\s|$)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    reply,
    actions,
    tools: usedTools,
    model: currentModel,
    memories: newMemories,
    usage,
  };
}
