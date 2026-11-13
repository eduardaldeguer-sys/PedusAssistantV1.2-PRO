/**
 * Mock de la API de Groq para probar Pedus sin gastar tokens ni depender de la red.
 * Uso:  node scripts/mock-groq.js  (escucha en :4010)
 * Luego: GROQ_BASE_URL=http://127.0.0.1:4010 GROQ_API_KEY=test npm start
 */
import http from 'node:http';

const calls = [];

// Catálogo simulado. MOCK_MODELS="a,b,c" permite probar qué pasa cuando Groq retira modelos.
const MODELS = (
  process.env.MOCK_MODELS ||
  'openai/gpt-oss-120b,openai/gpt-oss-20b,llama-3.3-70b-versatile,meta-llama/llama-4-scout-17b-16e-instruct,groq/compound-mini,whisper-large-v3-turbo,canopylabs/orpheus-v1-english'
).split(',');

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const path = req.url.split('?')[0];

    if (path === '/chat/completions') {
      const payload = JSON.parse(body);
      calls.push({ path, model: payload.model, tools: payload.tools?.length || 0 });
      if (!MODELS.includes(payload.model)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({ error: { message: `The model \`${payload.model}\` does not exist or you do not have access to it.`, code: 'model_not_found' } }),
        );
      }
      const hasToolResult = payload.messages.some((m) => m.role === 'tool');
      const userMsg = payload.messages.filter((m) => m.role === 'user').at(-1);
      const text = typeof userMsg?.content === 'string' ? userMsg.content : userMsg?.content?.[0]?.text || '';
      const isImage = Array.isArray(userMsg?.content);

      // Primera ronda: pide abrir ChatGPT. Segunda: responde con texto.
      if (/abre|open/i.test(text) && !hasToolResult) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            id: 'mock-1',
            model: payload.model,
            choices: [
              {
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_1',
                      type: 'function',
                      function: { name: 'open_site', arguments: JSON.stringify({ target: 'chatgpt' }) },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
        );
      }

      const reply = isImage
        ? 'Veo una captura de pantalla con un editor de código y un error en la consola. Yo arreglaría primero el import que falta.'
        : `Respuesta simulada de ${payload.model}. Herramientas en contexto: ${payload.tools?.length || 0}.`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          id: 'mock-2',
          model: payload.model,
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: reply } }],
          usage: { prompt_tokens: 20, completion_tokens: 15 },
        }),
      );
    }

    if (path === '/audio/speech') {
      const payload = JSON.parse(body);
      if (payload.input.length > 200) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'input too long (max 200 chars)' } }));
      }
      // WAV mínimo válido (silencio de 0.1 s a 24 kHz)
      const samples = 2400;
      const buf = Buffer.alloc(44 + samples * 2);
      buf.write('RIFF', 0);
      buf.writeUInt32LE(36 + samples * 2, 4);
      buf.write('WAVEfmt ', 8);
      buf.writeUInt32LE(16, 16);
      buf.writeUInt16LE(1, 20);
      buf.writeUInt16LE(1, 22);
      buf.writeUInt32LE(24000, 24);
      buf.writeUInt32LE(48000, 28);
      buf.writeUInt16LE(2, 32);
      buf.writeUInt16LE(16, 34);
      buf.write('data', 36);
      buf.writeUInt32LE(samples * 2, 40);
      res.writeHead(200, { 'Content-Type': 'audio/wav' });
      return res.end(buf);
    }

    if (path === '/audio/transcriptions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ text: 'hola pedus, prueba de transcripcion', language: 'es' }));
    }

    if (path === '/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: MODELS.map((id) => ({ id, active: true })), calls }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
  });
});

server.listen(4010, '0.0.0.0', () => console.log('mock groq en 0.0.0.0:4010'));
