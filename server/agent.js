import { config } from './config.js';
import { chatCompletion } from './groq.js';
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

function pickModel({ mode, message, image }) {
  if (image) return config.models.vision;
  if (mode === 'deep') return config.models.deep;
  if (mode === 'fast') return config.models.fast;
  if (mode === 'recap') return config.models.chat;
  const long = message.length > 600 || /\b(analiza|explícame|explicame|compara|plan|estrategia|por qué|porque|investiga|demuestra)\b/i.test(message);
  return long ? config.models.deep : config.models.chat;
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

  const model = pickModel({ mode, message: text, image });
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
  let currentModel = model;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    let completion;
    try {
      completion = await chatCompletion({
        model: currentModel,
        messages,
        tools: toolDefinitions,
        toolChoice: 'auto',
        temperature: image ? 0.5 : 0.65,
        maxTokens: 1100,
      });
    } catch (error) {
      // Fallback: si el modelo con visión falla por herramientas, reintenta sin ellas.
      if (currentModel === config.models.vision && round === 0) {
        completion = await chatCompletion({
          model: currentModel,
          messages,
          temperature: 0.5,
          maxTokens: 900,
        });
      } else if (currentModel !== config.models.chat) {
        currentModel = config.models.chat;
        completion = await chatCompletion({
          model: currentModel,
          messages,
          tools: toolDefinitions,
          toolChoice: 'auto',
          temperature: 0.65,
          maxTokens: 1100,
        });
      } else {
        throw error;
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
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
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
