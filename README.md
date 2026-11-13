# PedusAssistant 1.2 PRO

Asistente de voz flotante para ChromeOS. Dices **«Okey Pedus»**, te escucha, te contesta hablando, abre tus apps, mira tu pantalla y consulta GitHub. Funciona entero en la web de Render.

```
micrófono → Whisper (Groq) → Llama 3.3 / GPT-OSS (Groq) → Orpheus TTS (Groq) → altavoz
                                ↑
                        herramientas: abrir webs · búsqueda web · temporizadores
                        memoria · cambiar voz · GitHub · visión de pantalla
```

## Lo que hace

| Capacidad | Cómo |
| --- | --- |
| Wake word **«Okey Pedus»** | `SpeechRecognition` del navegador en bucle + fallback a pulsar el orbe |
| Escucharte | VAD por RMS, grabación de la frase completa y **Whisper large v3 turbo** (Groq) |
| Hablarte | **Orpheus TTS** de Groq (6 voces neuronales) con fallback a voz del sistema |
| Pensar | Llama 3.3 70B / GPT-OSS 120B con *tool calling* en bucle (hasta 4 rondas) |
| Ver tu pantalla | `getDisplayMedia` → captura comprimida → **Llama 4 Scout** (vision de Groq) |
| Abrir cosas | «Okey Pedus, abre ChatGPT» → pestaña nueva, o comandos propios sin gastar tokens |
| Buscar en internet | `groq/compound-mini` con búsqueda web integrada |
| GitHub | Perfiles, repos, issues y lenguajes vía API de GitHub (token opcional) |
| Memoria | Datos duraderos que el modelo guarda solo y se reinyectan como contexto |
| Personalidad | 4 estilos (equilibrado, breve, técnico, divertido) + reglas anti-robot |

## Arrancar en local

```bash
npm install
cp .env.example .env     # pega tu GROQ_API_KEY
npm start
# http://localhost:3000
```

Necesitas una clave gratis de Groq: <https://console.groq.com/keys>.

> **Micrófono**: los navegadores solo dan acceso por HTTPS o en `localhost`. En Render ya es HTTPS.

## Desplegar en Render

**Opción A — Blueprint (recomendado)**

1. Sube el repo a GitHub.
2. En Render: *New → Blueprint* y elige el repo. Se lee `render.yaml`.
3. Rellena `GROQ_API_KEY` (y opcionalmente `GITHUB_TOKEN`, `PEDUS_GITHUB_USER`).
4. Deploy. La URL queda tipo `https://pedus-assistant.onrender.com`.

**Opción B — Web Service manual**

- *Runtime*: Node
- *Build Command*: `npm install --omit=dev`
- *Start Command*: `npm start`
- *Health Check Path*: `/api/health`
- Variables de entorno: las de `.env.example`

## UptimeRobot

El plan free de Render duerme el servicio a los 15 minutos de inactividad (y tarda ~30 s en despertar, justo cuando dices «Okey Pedus»). Un monitor lo evita:

1. UptimeRobot → *Add New Monitor*.
2. Tipo **HTTP(s)**, URL `https://TU-APP.onrender.com/api/health`.
3. Intervalo **5 minutos** (el mínimo del plan free).
4. Palabra clave a buscar: `"ok":true`.

Ese endpoint es baratísimo (no llama a Groq) y mantiene el contenedor caliente.

## Cómo usarlo en ChromeOS

1. Abre la URL en Chrome y haz clic una vez en la página (los navegadores exigen un gesto para el micrófono).
2. Acepta el permiso de micrófono.
3. Instálala como app: menú ⋮ → *Instalar PedusAssistant*. Se abre en su propia ventana flotante, como Spotify.
4. Di **«Okey Pedus»** y habla. También puedes pulsar el orbe o la barra espaciadora.

Se guarda en el navegador (nada viaja a ningún sitio salvo a tu propio servidor de Render):

- historial, memoria, comandos y ajustes;
- `localStorage`, clave `pedus.v12`.

## Comandos personalizados

*Ajustes → Comandos*. Tres tipos:

| Tipo | Ejemplo de frase | Valor | Resultado |
| --- | --- | --- | --- |
| Abrir web | `abre chatgpt` | `https://chat.openai.com` | Pestaña nueva, cero tokens |
| Herramienta | `mira mi github` | `github_repos\|{"username":"tu-user"}` | Ejecuta la tool y te lo cuenta |
| Preguntar | `modo estudio` | `Actúa como profesor y explícame lo que te pida` | Envía ese prompt al modelo |

Las frases se normalizan (sin acentos ni mayúsculas) y se comprueban antes de llamar al modelo: son instantáneas y gratuitas.

## Visión de pantalla

- Botón 🖥️: comparte pantalla o ventana. En ChromeOS puedes elegir una pestaña concreta, una ventana o todo.
- Los chips **«Mira mi pantalla»** / **«Resume»** capturan un frame al momento y lo mandan a Llama 4 Scout.
- Botón 🖼️: envía una foto del carrete.
- Cuando dejas de compartir, la miniatura desaparece y no se guarda nada en el servidor (la imagen solo pasa por la petición).

## API

| Método | Ruta | Para qué |
| --- | --- | --- |
| GET | `/api/health` | UptimeRobot / Render health check |
| GET | `/api/config` | Config pública (modelos, voces, capacidades) |
| POST | `/api/chat` | `{ message, history, memory, settings, image, timezone }` |
| POST | `/api/speak` | `{ text, voice }` → trozos de audio WAV en base64 |
| POST | `/api/transcribe` | Body binario (`audio/webm`) → `{ text }` |
| POST | `/api/action` | Ejecuta una herramienta suelta (comandos) |
| GET | `/api/diagnostics` | Ping real a Groq con los modelos configurados |

Rate limits en memoria por IP: 30 chat/min, 90 speak/min, 30 transcribe/min.

## Modelos

Se cambian con variables de entorno sin tocar código:

| Variable | Por defecto | Uso |
| --- | --- | --- |
| `PEDUS_CHAT_MODEL` | `llama-3.3-70b-versatile` | Cerebro principal |
| `PEDUS_DEEP_MODEL` | `openai/gpt-oss-120b` | Preguntas largas / razonamiento |
| `PEDUS_FAST_MODEL` | `llama-3.1-8b-instant` | Respuestas de una frase |
| `PEDUS_VISION_MODEL` | `meta-llama/llama-4-scout-17b-16e-instruct` | «¿Qué ves?» |
| `PEDUS_RESEARCH_MODEL` | `groq/compound-mini` | Búsqueda web |
| `PEDUS_STT_MODEL` | `whisper-large-v3-turbo` | Transcribir |
| `PEDUS_TTS_MODEL` | `canopylabs/orpheus-v1-english` | Voz |

Si Groq retira un modelo, cámbialo aquí y reinicia. `/api/diagnostics` te dice si responde.

> Orpheus acepta ~200 caracteres por petición: el servidor trocea el texto por frases y sintetiza los trozos en paralelo, así la respuesta empieza a sonar antes.

## Probar sin gastar tokens

Incluye un mock de Groq para desarrollar la interfaz sin clave ni red:

```bash
node scripts/mock-groq.js          # terminal 1 → :4010
GROQ_API_KEY=test GROQ_BASE_URL=http://127.0.0.1:4010 npm start   # terminal 2
```

Simula chat con tool calling (pide `open_site` y luego responde), visión, Whisper y Orpheus (con su límite de 200 caracteres). Comprobaciones:

```bash
npm run check        # sintaxis de server + imports del frontend
curl localhost:3000/api/health
curl localhost:3000/api/diagnostics
```

## Estructura

```
server/
  index.js      Express, rutas y límites
  config.js     Variables de entorno y configuración pública
  groq.js       Cliente Groq (chat, whisper, orpheus)
  agent.js      Bucle de conversación + tool calling
  persona.js    Personalidad y memoria
  tools.js      Herramientas ejecutables (webs, GitHub, timers…)
  speech.js     Troceado de texto para Orpheus
public/
  index.html    Ventana flotante
  styles.css    Vidrio, orbe y animaciones
  app.js        Orquestador principal
  js/mic.js     VAD, grabación y wake word
  js/speech.js  Reproducción de Orpheus + fallback
  js/screen.js  Captura de pantalla y compresión
  js/store.js   Persistencia local
  js/api.js     Cliente HTTP
```

## Limitaciones reales

- **Wake word**: depende de `SpeechRecognition` (Chrome). Si el navegador no lo expone o está sin red, se degrada a pulsar el orbe; la transcripción de la frase sigue funcionando por Whisper.
- **Pestañas**: `window.open` requiere que el navegador no bloquee ventanas emergentes para el dominio.
- **Cámara/micrófono**: solo con HTTPS o localhost.
- **ChromeOS no permite el wake word con la pestaña cerrada.** Para que viva siempre encima, instala la PWA y fíjala en el estante; un monitor de UptimeRobot mantiene Render despierto.
- **TTS en español**: Orpheus es modelo inglés; pronuncia el español con acento. Para español nativo, pon `PEDUS_DEFAULT_VOICE` a tu gusto o desactiva «Leer en voz alta» y usa la voz del sistema (fallback automático).

## Licencia

MIT — hazlo tuyo.
