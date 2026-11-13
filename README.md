# PedusAssistant 1.2 PRO

Asistente de voz flotante para ChromeOS. Dices **«Okey Pedus»**, te escucha, te contesta hablando, abre tus apps, mira tu pantalla y consulta GitHub. Funciona entero en la web de Render.

```
micrófono → Whisper (Groq) → modelo de chat (Groq) → TTS (Groq o voz del sistema) → altavoz
                                ↑
                        herramientas: abrir webs · búsqueda web · temporizadores
                        memoria · cambiar voz · GitHub · visión de pantalla
```

## Lo que hace

| Capacidad | Cómo |
| --- | --- |
| Wake word **«Okey Pedus»** | `SpeechRecognition` del navegador en bucle + fallback a pulsar el orbe |
| Escucharte | VAD por RMS, grabación de la frase completa y **Whisper large v3 turbo** (Groq) |
| Hablarte | TTS neuronal de Groq en streaming, o la voz del sistema (español nativo) — se elige en Ajustes → Voz |
| Mini ventana | Ventanita flotante siempre visible (como el minirreproductor de Spotify) con el orbe que reacciona a la voz |
| Pensar | El mejor modelo de chat activo en tu cuenta de Groq, con *tool calling* en bucle (hasta 4 rondas) |
| Ver tu pantalla | `getDisplayMedia` → captura comprimida → modelo de visión de Groq |
| Abrir cosas | «Okey Pedus, abre ChatGPT» → pestaña nueva, o comandos propios sin gastar tokens |
| Buscar en internet | Sistema *compound* de Groq con búsqueda web integrada |
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
3. Rellena `GROQ_API_KEY` y, muy recomendable, `PEDUS_ACCESS_KEY` (opcionales: `GITHUB_TOKEN`, `PEDUS_GITHUB_USER`).
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

## Mini ventana flotante

Pedus puede vivir en una ventanita siempre encima de todo, redimensionable, con el orbe reaccionando a tu voz y a la suya.

- **Manual**: botón de la cabecera (el del rectángulo con otro dentro).
- **Automática**: al cambiar de pestaña, Chrome la abre solo. La primera vez pide permiso («Picture-in-picture automático»); hace falta que el micrófono esté activo y que la opción esté marcada en *Ajustes → Sistema*.
- **Tamaño**: arrastra los bordes. Pequeña = solo el orbe; mediana = orbe, onda y subtítulo; alta = también la conversación y el cuadro de texto. Se recuerda el último tamaño.
- Usa la API *Document Picture-in-Picture*: Chrome/Edge de escritorio y ChromeOS. En otros navegadores el botón no aparece.
- Si usas la PWA instalada y cambias a otra *ventana* (no pestaña), Chrome no la abre solo: pulsa el botón.

## Clave de acceso

Sin `PEDUS_ACCESS_KEY`, cualquiera que conozca la URL puede usar tu Pedus y gastar tu cuenta de Groq. Con ella, la web la pide una vez y la guarda en el navegador. `/api/health` sigue abierto para UptimeRobot.

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
| POST | `/api/speak` | `{ text, voice, stream }` → trozos de audio WAV en base64 (con `stream: true`, NDJSON según se generan) |
| POST | `/api/transcribe` | Body binario (`audio/webm`) → `{ text }` |
| POST | `/api/action` | Ejecuta una herramienta suelta (comandos) |
| GET | `/api/diagnostics` | Ping real a Groq + qué modelo se usa para cada función |

Rate limits en memoria por IP (más un tope global de 4× por si alguien rota IPs): 30 chat/min, 90 speak/min, 30 transcribe/min, 30 action/min, 6 diagnostics/min.

## Modelos

**No hace falta configurar nada.** Groq retira modelos a menudo, así que Pedus no depende de nombres fijos (`server/models.js`):

1. Al arrancar pide a Groq la lista de modelos activos de tu cuenta.
2. Para cada función usa el primero de su lista de preferencias que exista de verdad.
3. Si un modelo falla por estar retirado o sin acceso, lo descarta y prueba el siguiente.

| Función | Variable para forzarlo | Orden de preferencia |
| --- | --- | --- |
| Chat | `PEDUS_CHAT_MODEL` | `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`, Kimi K2, Qwen 3, `openai/gpt-oss-20b`… |
| Razonamiento | `PEDUS_DEEP_MODEL` | `openai/gpt-oss-120b`, Kimi K2, `llama-3.3-70b-versatile`… |
| Rápido / respaldo | `PEDUS_FAST_MODEL` | `openai/gpt-oss-20b`, `llama-3.1-8b-instant`… |
| Visión | `PEDUS_VISION_MODEL` | Llama 4 Scout, Llama 4 Maverick, cualquier modelo de visión |
| Búsqueda web | `PEDUS_RESEARCH_MODEL` | `groq/compound-mini`, `groq/compound` |
| Transcribir | `PEDUS_STT_MODEL` | `whisper-large-v3-turbo`, `whisper-large-v3` |
| Voz | `PEDUS_TTS_MODEL` | `canopylabs/orpheus-v1-english` |

Si ninguno de la lista existe, busca en el catálogo cualquier modelo que sirva para esa función. Lo que se está usando se ve en el log de arranque, en *Ajustes → Sistema* y en `/api/diagnostics`.

> Si tienes variables `PEDUS_*_MODEL` en Render con modelos antiguos, **bórralas**: se ignoran si ya no existen, pero es más limpio dejar que elija solo.

> Orpheus acepta ~200 caracteres por petición: el servidor trocea el texto por frases y envía cada trozo al navegador en cuanto está listo, así la respuesta empieza a sonar sin esperar al resto.

## Probar sin gastar tokens

Incluye un mock de Groq para desarrollar la interfaz sin clave ni red:

```bash
node scripts/mock-groq.js          # terminal 1 → :4010
GROQ_API_KEY=test GROQ_BASE_URL=http://127.0.0.1:4010 npm start   # terminal 2
```

`MOCK_MODELS="a,b" node scripts/mock-groq.js` simula un catálogo distinto (para probar qué pasa cuando Groq retira modelos).

Simula chat con tool calling (pide `open_site` y luego responde), visión, Whisper y Orpheus (con su límite de 200 caracteres). Comprobaciones:

```bash
npm run check        # sintaxis de todo, imports, ids del HTML y service worker
curl localhost:3000/api/health
curl localhost:3000/api/diagnostics
```

## Estructura

```
server/
  index.js      Express, rutas y límites
  config.js     Variables de entorno y configuración pública
  groq.js       Cliente Groq (chat, whisper, tts)
  models.js     Elección automática de modelos según el catálogo de Groq
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
  js/pip.js     Mini ventana flotante
  js/ticker.js  Reloj de animación compartido (sigue en segundo plano)
  js/api.js     Cliente HTTP
```

## Limitaciones reales

- **Wake word**: depende de `SpeechRecognition` (Chrome). Si el navegador no lo expone o está sin red, se degrada a pulsar el orbe; la transcripción de la frase sigue funcionando por Whisper.
- **Pestañas**: `window.open` requiere que el navegador no bloquee ventanas emergentes para el dominio.
- **Cámara/micrófono**: solo con HTTPS o localhost.
- **ChromeOS no permite el wake word con la pestaña cerrada.** Para que viva siempre encima, instala la PWA y fíjala en el estante; un monitor de UptimeRobot mantiene Render despierto.
- **TTS en español**: Orpheus es un modelo inglés y lee el español con acento. Para español nativo elige *Ajustes → Voz → Motor de voz → Voz del sistema*.
- **Abrir pestañas desde la mini ventana**: con la pestaña de Pedus en segundo plano, Chrome puede bloquear `window.open`; permite las ventanas emergentes para el dominio.

## Licencia

MIT — hazlo tuyo.
