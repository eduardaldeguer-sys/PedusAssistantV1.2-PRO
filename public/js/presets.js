/**
 * 250 comandos preinstalados.
 *
 * Se resuelven en el navegador, al instante y sin gastar tokens (salvo los de tipo
 * «prompt», que mandan una petición ya redactada al modelo). Solo actúan cuando la
 * frase encaja ENTERA: «abre YouTube» lo resuelve aquí; «abre YouTube y busca gatos»
 * no encaja y pasa al modelo, que sabe hacer cosas más complejas.
 *
 * Tipos:
 *   open    abre una web            «abre Gmail», «pon Netflix», «llévame a GitHub»
 *   search  busca dentro de una web «busca gatos en YouTube»
 *   local   acción de Pedus         «qué hora es», «habla más rápido», «cállate»
 *   tool    herramienta del servidor «mis repositorios»
 *   prompt  petición al modelo      «cuéntame un chiste»
 */

/* [nombre, url, [formas de decirlo]] */
const SITES = [
  ["YouTube", "https://www.youtube.com", ["youtube", "you tube", "yutub", "yutube"]],
  ["YouTube Music", "https://music.youtube.com", ["youtube music", "youtube musica"]],
  ["Gmail", "https://mail.google.com", ["gmail", "correo", "mail", "email"]],
  ["Google", "https://www.google.com", ["google", "buscador"]],
  ["Google Drive", "https://drive.google.com", ["google drive", "drive"]],
  ["Google Docs", "https://docs.google.com/document", ["google docs", "docs", "documentos"]],
  ["Google Sheets", "https://docs.google.com/spreadsheets", ["google sheets", "sheets", "hojas de calculo"]],
  ["Google Slides", "https://docs.google.com/presentation", ["google slides", "slides", "presentaciones"]],
  ["Google Forms", "https://docs.google.com/forms", ["google forms", "forms", "formularios"]],
  ["Google Calendar", "https://calendar.google.com", ["google calendar", "calendar", "calendario", "agenda"]],
  ["Google Maps", "https://www.google.com/maps", ["google maps", "maps", "mapas"]],
  ["Google Fotos", "https://photos.google.com", ["google fotos", "fotos", "google photos"]],
  ["Google Keep", "https://keep.google.com", ["google keep", "keep", "notas"]],
  ["Google Meet", "https://meet.google.com", ["google meet", "meet"]],
  ["Google Classroom", "https://classroom.google.com", ["google classroom", "classroom"]],
  ["Google Translate", "https://translate.google.com", ["google translate", "traductor", "translate"]],
  ["Google Noticias", "https://news.google.com", ["google noticias", "noticias", "google news"]],
  ["Google Earth", "https://earth.google.com", ["google earth", "earth"]],
  ["Google Contactos", "https://contacts.google.com", ["google contactos", "contactos"]],
  ["Google Tasks", "https://tasks.google.com", ["google tasks", "tareas", "tasks"]],
  ["Google Chat", "https://chat.google.com", ["google chat"]],
  ["Google Play", "https://play.google.com", ["google play", "play store"]],
  ["Google Scholar", "https://scholar.google.com", ["google scholar", "scholar", "google academico"]],
  ["Gemini", "https://gemini.google.com", ["gemini"]],
  ["NotebookLM", "https://notebooklm.google.com", ["notebooklm", "notebook lm"]],
  ["Chrome Web Store", "https://chromewebstore.google.com", ["chrome web store", "extensiones", "tienda de chrome"]],
  ["ChatGPT", "https://chatgpt.com", ["chatgpt", "chat gpt", "openai"]],
  ["Claude", "https://claude.ai", ["claude"]],
  ["Perplexity", "https://www.perplexity.ai", ["perplexity"]],
  ["Copilot", "https://copilot.microsoft.com", ["copilot"]],
  ["Mistral", "https://chat.mistral.ai", ["mistral", "le chat"]],
  ["DeepSeek", "https://chat.deepseek.com", ["deepseek", "deep seek"]],
  ["Grok", "https://grok.com", ["grok"]],
  ["Hugging Face", "https://huggingface.co", ["hugging face", "huggingface"]],
  ["Groq", "https://console.groq.com", ["groq", "groq console"]],
  ["Arena", "https://arena.ai", ["arena"]],
  ["GitHub", "https://github.com", ["github", "git hub"]],
  ["GitLab", "https://gitlab.com", ["gitlab", "git lab"]],
  ["Render", "https://dashboard.render.com", ["render"]],
  ["UptimeRobot", "https://dashboard.uptimerobot.com", ["uptimerobot", "uptime robot"]],
  ["Vercel", "https://vercel.com/dashboard", ["vercel"]],
  ["Netlify", "https://app.netlify.com", ["netlify"]],
  ["Cloudflare", "https://dash.cloudflare.com", ["cloudflare"]],
  ["Stack Overflow", "https://stackoverflow.com", ["stack overflow", "stackoverflow"]],
  ["MDN", "https://developer.mozilla.org/es", ["mdn"]],
  ["npm", "https://www.npmjs.com", ["npm"]],
  ["CodePen", "https://codepen.io", ["codepen", "code pen"]],
  ["Replit", "https://replit.com", ["replit"]],
  ["CodeSandbox", "https://codesandbox.io", ["codesandbox", "code sandbox"]],
  ["StackBlitz", "https://stackblitz.com", ["stackblitz", "stack blitz"]],
  ["Supabase", "https://supabase.com/dashboard", ["supabase"]],
  ["Firebase", "https://console.firebase.google.com", ["firebase"]],
  ["Docker Hub", "https://hub.docker.com", ["docker hub", "docker"]],
  ["W3Schools", "https://www.w3schools.com", ["w3schools", "w3 schools"]],
  ["Can I Use", "https://caniuse.com", ["can i use", "caniuse"]],
  ["Regex101", "https://regex101.com", ["regex101", "regex"]],
  ["Excalidraw", "https://excalidraw.com", ["excalidraw"]],
  ["Figma", "https://www.figma.com", ["figma"]],
  ["Canva", "https://www.canva.com", ["canva"]],
  ["Photopea", "https://www.photopea.com", ["photopea"]],
  ["Remove BG", "https://www.remove.bg/es", ["remove bg", "quitar fondo"]],
  ["Notion", "https://www.notion.so", ["notion"]],
  ["Trello", "https://trello.com", ["trello"]],
  ["Todoist", "https://app.todoist.com", ["todoist"]],
  ["Obsidian", "https://obsidian.md", ["obsidian"]],
  ["Miro", "https://miro.com", ["miro"]],
  ["Slack", "https://app.slack.com", ["slack"]],
  ["Discord", "https://discord.com/app", ["discord"]],
  ["Telegram", "https://web.telegram.org", ["telegram"]],
  ["WhatsApp", "https://web.whatsapp.com", ["whatsapp", "whatsapp web", "wasap", "guasap"]],
  ["Messenger", "https://www.messenger.com", ["messenger"]],
  ["Zoom", "https://app.zoom.us", ["zoom"]],
  ["Teams", "https://teams.microsoft.com", ["teams", "microsoft teams"]],
  ["Outlook", "https://outlook.live.com", ["outlook", "hotmail"]],
  ["OneDrive", "https://onedrive.live.com", ["onedrive", "one drive"]],
  ["Word", "https://www.office.com/launch/word", ["word"]],
  ["Excel", "https://www.office.com/launch/excel", ["excel"]],
  ["PowerPoint", "https://www.office.com/launch/powerpoint", ["powerpoint", "power point"]],
  ["Office", "https://www.office.com", ["office", "microsoft 365"]],
  ["Dropbox", "https://www.dropbox.com", ["dropbox"]],
  ["WeTransfer", "https://wetransfer.com", ["wetransfer", "we transfer"]],
  ["iCloud", "https://www.icloud.com", ["icloud"]],
  ["Proton Mail", "https://mail.proton.me", ["proton mail", "protonmail", "proton"]],
  ["Yahoo", "https://www.yahoo.com", ["yahoo"]],
  ["Bing", "https://www.bing.com", ["bing"]],
  ["DuckDuckGo", "https://duckduckgo.com", ["duckduckgo", "duck duck go"]],
  ["Wikipedia", "https://es.wikipedia.org", ["wikipedia", "la wiki"]],
  ["Viquipedia", "https://ca.wikipedia.org", ["viquipedia", "wikipedia en catalan"]],
  ["RAE", "https://dle.rae.es", ["rae", "diccionario"]],
  ["WordReference", "https://www.wordreference.com", ["wordreference", "word reference"]],
  ["DeepL", "https://www.deepl.com/translator", ["deepl", "deep l"]],
  ["Duolingo", "https://www.duolingo.com", ["duolingo"]],
  ["Khan Academy", "https://es.khanacademy.org", ["khan academy", "khan"]],
  ["Coursera", "https://www.coursera.org", ["coursera"]],
  ["Udemy", "https://www.udemy.com", ["udemy"]],
  ["Wolfram Alpha", "https://www.wolframalpha.com", ["wolfram alpha", "wolfram"]],
  ["GeoGebra", "https://www.geogebra.org", ["geogebra"]],
  ["Desmos", "https://www.desmos.com/calculator", ["desmos", "calculadora grafica"]],
  ["Quizlet", "https://quizlet.com", ["quizlet"]],
  ["Kahoot", "https://kahoot.it", ["kahoot"]],
  ["Spotify", "https://open.spotify.com", ["spotify"]],
  ["SoundCloud", "https://soundcloud.com", ["soundcloud", "sound cloud"]],
  ["Netflix", "https://www.netflix.com", ["netflix"]],
  ["Prime Video", "https://www.primevideo.com", ["prime video", "amazon prime", "prime"]],
  ["Disney Plus", "https://www.disneyplus.com", ["disney plus", "disney"]],
  ["HBO Max", "https://www.max.com", ["hbo max", "hbo", "max"]],
  ["Movistar Plus", "https://ver.movistarplus.es", ["movistar plus", "movistar"]],
  ["Filmin", "https://www.filmin.es", ["filmin"]],
  ["Apple TV", "https://tv.apple.com", ["apple tv"]],
  ["Crunchyroll", "https://www.crunchyroll.com", ["crunchyroll"]],
  ["Twitch", "https://www.twitch.tv", ["twitch"]],
  ["Kick", "https://kick.com", ["kick"]],
  ["RTVE Play", "https://www.rtve.es/play", ["rtve play", "rtve", "la uno"]],
  ["3Cat", "https://www.3cat.cat", ["3cat", "tv3", "tres cat"]],
  ["Atresplayer", "https://www.atresplayer.com", ["atresplayer", "antena 3"]],
  ["Mitele", "https://www.mitele.es", ["mitele", "telecinco"]],
  ["DAZN", "https://www.dazn.com", ["dazn"]],
  ["IMDb", "https://www.imdb.com", ["imdb"]],
  ["FilmAffinity", "https://www.filmaffinity.com/es", ["filmaffinity", "film affinity"]],
  ["JustWatch", "https://www.justwatch.com/es", ["justwatch", "just watch"]],
  ["X", "https://x.com", ["x", "twitter"]],
  ["Instagram", "https://www.instagram.com", ["instagram", "insta"]],
  ["Facebook", "https://www.facebook.com", ["facebook"]],
  ["TikTok", "https://www.tiktok.com", ["tiktok", "tik tok"]],
  ["Reddit", "https://www.reddit.com", ["reddit"]],
  ["LinkedIn", "https://www.linkedin.com", ["linkedin", "linked in"]],
  ["Pinterest", "https://www.pinterest.es", ["pinterest"]],
  ["Threads", "https://www.threads.net", ["threads"]],
  ["Bluesky", "https://bsky.app", ["bluesky", "blue sky"]],
  ["Amazon", "https://www.amazon.es", ["amazon"]],
  ["AliExpress", "https://es.aliexpress.com", ["aliexpress", "ali express"]],
  ["eBay", "https://www.ebay.es", ["ebay"]],
  ["Wallapop", "https://es.wallapop.com", ["wallapop"]],
  ["Vinted", "https://www.vinted.es", ["vinted"]],
  ["El Corte Ingles", "https://www.elcorteingles.es", ["el corte ingles", "corte ingles"]],
  ["PcComponentes", "https://www.pccomponentes.com", ["pccomponentes", "pc componentes"]],
  ["MediaMarkt", "https://www.mediamarkt.es", ["mediamarkt", "media markt"]],
  ["Zara", "https://www.zara.com/es", ["zara"]],
  ["Mercadona", "https://www.mercadona.es", ["mercadona"]],
  ["Carrefour", "https://www.carrefour.es", ["carrefour"]],
  ["Idealista", "https://www.idealista.com", ["idealista"]],
  ["Glovo", "https://glovoapp.com/es", ["glovo"]],
  ["PayPal", "https://www.paypal.com", ["paypal", "pay pal"]],
  ["CaixaBank", "https://www.caixabank.es", ["caixabank", "la caixa"]],
  ["BBVA", "https://www.bbva.es", ["bbva"]],
  ["Santander", "https://www.bancosantander.es", ["santander", "banco santander"]],
  ["Agencia Tributaria", "https://sede.agenciatributaria.gob.es", ["agencia tributaria", "hacienda"]],
  ["Booking", "https://www.booking.com", ["booking"]],
  ["Airbnb", "https://www.airbnb.es", ["airbnb"]],
  ["Skyscanner", "https://www.skyscanner.es", ["skyscanner", "sky scanner"]],
  ["Renfe", "https://www.renfe.com", ["renfe"]],
  ["Rodalies", "https://rodalies.gencat.cat", ["rodalies", "cercanias"]],
  ["TMB", "https://www.tmb.cat", ["tmb", "metro de barcelona"]],
  ["Vueling", "https://www.vueling.com", ["vueling"]],
  ["AEMET", "https://www.aemet.es", ["aemet", "el tiempo"]],
  ["El Pais", "https://elpais.com", ["el pais"]],
  ["El Mundo", "https://www.elmundo.es", ["el mundo"]],
  ["La Vanguardia", "https://www.lavanguardia.com", ["la vanguardia"]],
  ["El Periodico", "https://www.elperiodico.com", ["el periodico"]],
  ["20 Minutos", "https://www.20minutos.es", ["20 minutos", "veinte minutos"]],
  ["Marca", "https://www.marca.com", ["marca"]],
  ["As", "https://as.com", ["as", "diario as"]],
  ["Mundo Deportivo", "https://www.mundodeportivo.com", ["mundo deportivo"]],
  ["Sport", "https://www.sport.es", ["sport"]],
  ["BBC", "https://www.bbc.com/mundo", ["bbc"]],
  ["Xataka", "https://www.xataka.com", ["xataka"]],
  ["Steam", "https://store.steampowered.com", ["steam"]],
  ["Roblox", "https://www.roblox.com", ["roblox"]],
  ["Minecraft", "https://www.minecraft.net", ["minecraft"]],
  ["Chess", "https://www.chess.com", ["chess", "ajedrez"]],
  ["Wordle", "https://lapalabradeldia.com", ["wordle", "la palabra del dia"]],
  ["Speedtest", "https://www.speedtest.net/es", ["speedtest", "test de velocidad"]],
  ["iLovePDF", "https://www.ilovepdf.com/es", ["ilovepdf", "i love pdf"]],
  ["Google Fonts", "https://fonts.google.com", ["google fonts", "fuentes"]]
];

/* Búsquedas: {q} es lo que dices. */
const SEARCHES = [
  ['YouTube', 'https://www.youtube.com/results?search_query={q}', ['busca (.+) en (?:youtube|you tube)', '(?:pon|ponme|reproduce) (.+) en (?:youtube|you tube)', 'videos? de (.+)']],
  ['Google', 'https://www.google.com/search?q={q}', ['busca (.+) en google', 'googlea (.+)', 'busca en google (.+)']],
  ['Wikipedia', 'https://es.wikipedia.org/w/index.php?search={q}', ['busca (.+) en (?:la )?wikipedia', 'wikipedia de (.+)']],
  ['Spotify', 'https://open.spotify.com/search/{q}', ['busca (.+) en spotify', '(?:pon|ponme|reproduce) (.+) en spotify']],
  ['Google Maps', 'https://www.google.com/maps/search/{q}', ['busca (.+) en (?:google )?(?:maps|mapas|el mapa)', 'donde (?:esta|queda) (.+)', 'como (?:llego|llegar|ir|voy) a (.+)']],
  ['Amazon', 'https://www.amazon.es/s?k={q}', ['busca (.+) en amazon', 'compra (.+) en amazon']],
  ['GitHub', 'https://github.com/search?q={q}', ['busca (.+) en (?:github|git hub)']],
  ['Imágenes', 'https://www.google.com/search?tbm=isch&q={q}', ['(?:busca |ensename |muestrame )?(?:imagenes|fotos) de (.+)']],
  ['Noticias', 'https://news.google.com/search?q={q}&hl=es', ['(?:busca )?noticias (?:de|sobre) (.+)']],
  ['Traductor', 'https://translate.google.com/?sl=auto&tl=en&text={q}', ['(?:como se dice|traduce) (.+) (?:en|al) ingles']],
  ['Diccionario RAE', 'https://dle.rae.es/{q}', ['(?:que significa|define|definicion de) (.+)']],
  ['Reddit', 'https://www.reddit.com/search/?q={q}', ['busca (.+) en reddit']],
];

/* Acciones locales: [acción, título, [frases exactas], (opcional) [expresiones]] */
const LOCALS = [
  ['time', 'Decir la hora', ['que hora es', 'dime la hora', 'la hora', 'que hora tenemos', 'me dices la hora']],
  ['date', 'Decir la fecha', ['que dia es', 'que dia es hoy', 'a que dia estamos', 'que fecha es', 'que fecha es hoy', 'dime la fecha']],
  ['stop', 'Callarse', ['para', 'calla', 'callate', 'silencio', 'basta', 'ya esta', 'vale ya', 'para de hablar', 'detente', 'stop']],
  ['repeat', 'Repetir lo último', ['repite', 'repitelo', 'repite eso', 'otra vez', 'que has dicho', 'como dices', 'puedes repetir']],
  ['mute', 'Dejar de leer en voz alta', ['silenciate', 'no hables', 'modo silencio', 'desactiva la voz', 'quita la voz']],
  ['unmute', 'Volver a hablar', ['vuelve a hablar', 'activa la voz', 'ya puedes hablar', 'habla', 'quita el silencio', 'pon la voz']],
  ['settings', 'Abrir ajustes', ['abre ajustes', 'abre los ajustes', 'ajustes', 'configuracion', 'abre la configuracion', 'abre configuracion']],
  ['settings-close', 'Cerrar ajustes', ['cierra ajustes', 'cierra los ajustes', 'cierra la configuracion', 'cierra configuracion']],
  ['commands', 'Ver los comandos', ['abre los comandos', 'ensename los comandos', 'lista de comandos', 'que comandos tienes', 'muestrame los comandos']],
  ['pip', 'Abrir la mini ventana', ['mini ventana', 'abre la mini ventana', 'ventana flotante', 'modo flotante', 'hazte pequeno', 'ponte en pequeno']],
  ['pip-close', 'Cerrar la mini ventana', ['cierra la mini ventana', 'vuelve a la pagina', 'quita la mini ventana', 'hazte grande']],
  ['theme-light', 'Tema claro', ['tema claro', 'modo claro', 'pon el tema claro', 'pon modo claro']],
  ['theme-dark', 'Tema oscuro', ['tema oscuro', 'modo oscuro', 'pon el tema oscuro', 'pon modo oscuro', 'modo noche']],
  ['rate-up', 'Hablar más rápido', ['habla mas rapido', 'mas rapido', 'acelera', 'habla mas deprisa']],
  ['rate-down', 'Hablar más despacio', ['habla mas despacio', 'mas despacio', 'habla mas lento', 'mas lento', 'no tan rapido']],
  ['rate-reset', 'Velocidad normal', ['velocidad normal', 'habla normal', 'habla a velocidad normal']],
  ['voice-diana', 'Voz Diana', ['voz diana', 'pon la voz de diana', 'cambia la voz a diana', 'habla como diana']],
  ['voice-hannah', 'Voz Hannah', ['voz hannah', 'voz hana', 'pon la voz de hannah', 'cambia la voz a hannah']],
  ['voice-autumn', 'Voz Autumn', ['voz autumn', 'pon la voz de autumn', 'cambia la voz a autumn']],
  ['voice-austin', 'Voz Austin', ['voz austin', 'pon la voz de austin', 'cambia la voz a austin']],
  ['voice-daniel', 'Voz Daniel', ['voz daniel', 'pon la voz de daniel', 'cambia la voz a daniel', 'habla como daniel']],
  ['voice-troy', 'Voz Troy', ['voz troy', 'pon la voz de troy', 'cambia la voz a troy']],
  ['voice-female', 'Voz de mujer', ['voz de mujer', 'voz femenina', 'pon voz de chica', 'habla con voz de mujer']],
  ['voice-male', 'Voz de hombre', ['voz de hombre', 'voz masculina', 'pon voz de chico', 'habla con voz de hombre']],
  ['engine-system', 'Voz del sistema (español nativo)', ['voz del sistema', 'usa la voz del sistema', 'voz en espanol', 'habla en espanol nativo', 'voz nativa']],
  ['engine-groq', 'Voz neuronal de Groq', ['voz neuronal', 'usa la voz neuronal', 'voz de groq', 'usa la voz de groq']],
  ['style-equilibrado', 'Personalidad equilibrada', ['modo equilibrado', 'modo normal', 'personalidad normal']],
  ['style-breve', 'Respuestas breves', ['modo breve', 'se breve', 'responde corto', 'respuestas cortas', 'se mas breve']],
  ['style-tecnico', 'Modo técnico', ['modo tecnico', 'se tecnico', 'responde en tecnico', 'se mas tecnico']],
  ['style-divertido', 'Modo divertido', ['modo divertido', 'se divertido', 'modo gracioso', 'se mas gracioso']],
  ['clear', 'Borrar la conversación', ['borra la conversacion', 'olvida la conversacion', 'empieza de cero', 'nueva conversacion', 'borra el historial']],
  ['memory', 'Decir lo que recuerda de ti', ['que recuerdas de mi', 'que sabes de mi', 'que sabes sobre mi', 'dime lo que recuerdas']],
  ['memory-clear', 'Olvidar todo sobre ti', ['olvidalo todo', 'olvida todo sobre mi', 'borra tu memoria', 'borra la memoria']],
  ['help', 'Explicar qué puede hacer', ['que puedes hacer', 'que sabes hacer', 'ayuda', 'para que sirves', 'como funcionas']],
  ['count', 'Cuántos comandos tiene', ['cuantos comandos tienes', 'cuantos comandos sabes', 'cuantos comandos hay']],
  ['screen', 'Mirar tu pantalla', ['mira mi pantalla', 'que ves', 'que ves en mi pantalla', 'que hay en mi pantalla', 'mira la pantalla', 'analiza mi pantalla', 'mira esto']],
  ['screen-summary', 'Resumir tu pantalla', ['resume mi pantalla', 'resume la pantalla', 'resume lo que ves', 'resumeme esto', 'resume esta pagina']],
  ['screen-stop', 'Dejar de compartir pantalla', ['deja de compartir', 'deja de compartir pantalla', 'deja de mirar mi pantalla', 'no mires mi pantalla']],
  ['timer', 'Poner un temporizador', [], ['(?:pon|ponme|crea|inicia|activa|prepara)? ?(?:un |una |el |la )?(?:temporizador|alarma|cuenta atras|cronometro) (?:de |en |dentro de |para dentro de |para )?(.+)', 'avisame (?:en|dentro de) (.+)']],
  ['timer-cancel', 'Cancelar temporizadores', ['cancela el temporizador', 'cancela los temporizadores', 'quita el temporizador', 'para el temporizador', 'cancela la alarma', 'quita la alarma']],
  ['timer-list', 'Cuánto queda de temporizador', ['cuanto queda', 'cuanto queda de temporizador', 'cuanto falta', 'cuanto tiempo queda']],
  ['reload', 'Reiniciarse', ['reiniciate', 'reinicia', 'recarga', 'recarga la pagina', 'actualizate']],
  ['model', 'Decir qué modelo usa', ['que modelo usas', 'que modelo eres', 'que ia eres', 'que cerebro usas', 'con que modelo funcionas']],
  ['voice-test', 'Prueba de voz', ['prueba de voz', 'prueba tu voz', 'probando', 'como suenas', 'di algo']],
  ['diagnostics', 'Comprobar la conexión con Groq', ['comprueba groq', 'prueba groq', 'estas bien', 'funcionas bien', 'haz un diagnostico', 'comprueba la conexion']],
  ['coin', 'Lanzar una moneda', ['lanza una moneda', 'tira una moneda', 'cara o cruz', 'echalo a suertes']],
  ['dice', 'Tirar un dado', ['tira un dado', 'lanza un dado', 'tira el dado', 'tira los dados']],
  ['random', 'Número al azar', ['dime un numero', 'dime un numero al azar', 'numero aleatorio', 'un numero del uno al cien', 'elige un numero']],
  ['thanks', 'Dar las gracias', ['gracias', 'muchas gracias', 'gracias pedus', 'te lo agradezco', 'genial gracias', 'perfecto gracias']],
  ['hello', 'Saludar', ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'que tal', 'hola que tal', 'como estas', 'estas ahi', 'me oyes']],
  ['bye', 'Despedirse', ['adios', 'hasta luego', 'buenas noches', 'nos vemos', 'hasta manana', 'chao']],
  ['name', 'Decir quién es', ['como te llamas', 'quien eres', 'cual es tu nombre', 'que eres']],
];

/* Herramientas del servidor: [herramienta, argumentos, título, [frases]] */
const TOOLS = [
  ['github_repos', {}, 'Tus repositorios de GitHub', ['mis repos', 'mis repositorios', 'mira mis repos', 'mira mi github', 'ensename mis repos', 'que repos tengo']],
  ['github_profile', {}, 'Tu perfil de GitHub', ['mi perfil de github', 'mi github', 'como va mi github', 'cuantos seguidores tengo en github']],
];

/* Peticiones ya redactadas para el modelo: [título, prompt, [frases]] */
const PROMPTS = [
  ['Contar un chiste', 'Cuéntame un chiste corto y bueno, distinto a los típicos.', ['cuentame un chiste', 'dime un chiste', 'un chiste', 'hazme reir', 'otro chiste']],
  ['Dato curioso', 'Dime un dato curioso sorprendente en dos frases.', ['dime un dato curioso', 'dato curioso', 'cuentame algo curioso', 'cuentame algo interesante', 'sorprendeme']],
  ['Frase motivadora', 'Dame una frase motivadora breve y nada cursi.', ['motivame', 'dame animos', 'una frase motivadora', 'dime algo motivador']],
  ['Noticias de hoy', 'Busca en internet y resúmeme en cuatro frases las noticias más importantes de hoy en España.', ['noticias de hoy', 'que ha pasado hoy', 'las noticias', 'dime las noticias', 'resumen de noticias', 'que noticias hay']],
  ['El tiempo', 'Busca en internet la previsión del tiempo de hoy y mañana para mi ciudad (si no sabes cuál es, usa Barcelona) y dímela en dos frases.', ['que tiempo hace', 'que tiempo hara hoy', 'va a llover', 'que tiempo hara manana', 'el tiempo de hoy', 'hace frio']],
  ['Modo estudio', 'A partir de ahora actúa como un profesor paciente: explícame lo que te pregunte paso a paso y comprueba que lo entiendo. Confírmalo en una frase.', ['modo estudio', 'modo profesor', 'ayudame a estudiar']],
  ['Modo traductor', 'A partir de ahora traduce al inglés todo lo que te diga, sin añadir nada más. Confírmalo en una frase.', ['modo traductor', 'modo traduccion', 'traduce lo que diga']],
  ['Resumir la conversación', 'Resume en tres frases lo que hemos hablado hasta ahora.', ['resume la conversacion', 'de que hemos hablado', 'resumen de la conversacion', 'haz un resumen']],
  ['Idea para tu proyecto', 'Dame una idea concreta y original para mejorar mi proyecto actual, en dos frases.', ['dame una idea', 'una idea para mi proyecto', 'dame ideas', 'inspirame']],
  ['Adivinanza', 'Dime una adivinanza y espera a que responda antes de dar la solución.', ['dime una adivinanza', 'una adivinanza', 'juguemos a las adivinanzas']],
];

/* ------------------------------------------------------------------ */

export const normalizeText = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const LEAD = /^(?:por favor|porfa|oye|venga|a ver|pues|pedus|me puedes|puedes|podrias|quiero que|necesito que|anda)\s+/;
const TRAIL = /\s+(?:por favor|porfa|ahora|ya|anda|gracias|pedus|ahora mismo|un momento)$/;

/** Quita cortesías: «oye, ¿puedes abrir YouTube, por favor?» → «abrir youtube». */
export function stripPoliteness(text) {
  let t = normalizeText(text);
  for (let i = 0; i < 4; i += 1) {
    const next = t.replace(LEAD, '').replace(TRAIL, '');
    if (next === t) break;
    t = next;
  }
  return t;
}

const OPEN_RE =
  /^(?:abre la pagina de|abre la web de|abre la app de|quiero abrir|quiero ver|quiero ir a|llevame a|muestrame|ensename|entra en|entra a|vete a|vamos a|abreme|abrir|abre|abra|ponme|pon|lanza|inicia|ve a|ir a)\s+(?:el |la |los |las |mi |mis |al |a |lo de )?(.+)$/;

const compile = (list) => list.map((src) => new RegExp(`^${src}$`));

export const PRESETS = [
  ...SITES.map(([label, url, names]) => ({
    id: `open:${names[0]}`,
    type: 'open',
    category: 'Abrir webs',
    title: label,
    example: `abre ${label}`,
    url,
    names,
  })),
  ...SEARCHES.map(([label, url, patterns]) => ({
    id: `search:${normalizeText(label)}`,
    type: 'search',
    category: 'Buscar',
    title: `Buscar en ${label}`,
    example: patterns[0].replace('(.+)', '…').replace(/\(\?:([^|)]+)[^)]*\)\??/g, '$1'),
    url,
    label,
    patterns: compile(patterns),
  })),
  ...LOCALS.map(([action, title, phrases, patterns = []]) => ({
    id: `local:${action}`,
    type: 'local',
    category: 'Pedus',
    title,
    example: phrases[0] || 'pon un temporizador de 5 minutos',
    action,
    phrases,
    patterns: compile(patterns),
  })),
  ...TOOLS.map(([tool, args, title, phrases]) => ({
    id: `tool:${tool}`,
    type: 'tool',
    category: 'GitHub',
    title,
    example: phrases[0],
    tool,
    args,
    phrases,
  })),
  ...PROMPTS.map(([title, prompt, phrases]) => ({
    id: `prompt:${normalizeText(title)}`,
    type: 'prompt',
    category: 'Preguntar al modelo',
    title,
    example: phrases[0],
    prompt,
    phrases,
  })),
];

const byName = new Map();
const byPhrase = new Map();
const withPatterns = [];
for (const preset of PRESETS) {
  for (const name of preset.names || []) byName.set(name, preset);
  for (const phrase of preset.phrases || []) byPhrase.set(phrase, preset);
  if (preset.patterns?.length) withPatterns.push(preset);
}

/**
 * Busca el comando preinstalado que encaja con la frase entera.
 * Devuelve { preset, arg } o null. `disabled` es la lista de ids desactivados en Ajustes.
 */
export function matchPreset(text, disabled = []) {
  const t = stripPoliteness(text);
  if (!t) return null;
  const off = new Set(disabled);
  const ok = (preset) => (preset && !off.has(preset.id) ? preset : null);

  const exact = ok(byPhrase.get(t));
  if (exact) return { preset: exact, arg: '' };

  const open = t.match(OPEN_RE);
  if (open) {
    // «pon la uno»: se prueba con y sin el artículo.
    const withArticle = t.replace(/^.*?\s(?=(?:el|la|los|las|mi|mis|al|a) )/, '');
    const site = ok(byName.get(open[1])) || ok(byName.get(withArticle));
    if (site) return { preset: site, arg: '' };
  }

  for (const preset of withPatterns) {
    if (off.has(preset.id)) continue;
    for (const re of preset.patterns) {
      const m = t.match(re);
      if (m) return { preset, arg: (m[1] || '').trim() };
    }
  }
  return null;
}

const NUMBER_WORDS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cuarenta_y_cinco: 45,
  cincuenta: 50, sesenta: 60, noventa: 90, media: 0.5, medio: 0.5,
};

/** «5 minutos», «una hora y media», «30 segundos», «minuto y medio» → segundos (o null). */
export function parseDuration(text) {
  const t = normalizeText(text).replace('cuarenta y cinco', 'cuarenta_y_cinco');
  const unit = (u) => (/^h/.test(u) ? 3600 : /^m/.test(u) ? 60 : 1);
  let total = 0;
  let found = false;
  const re = /(\d+(?:[.,]\d+)?|[a-z_]+)?\s*(horas?|minutos?|min|segundos?|seg)\b(\s+y\s+(?:media|medio))?/g;
  for (const m of t.matchAll(re)) {
    const raw = m[1];
    let n = raw == null ? 1 : /^\d/.test(raw) ? Number(raw.replace(',', '.')) : NUMBER_WORDS[raw];
    if (n == null) n = 1; // «…de minuto»
    if (m[3]) n += 0.5;
    total += n * unit(m[2]);
    found = true;
  }
  return found && total > 0 ? Math.round(total) : null;
}
