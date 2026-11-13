/**
 * Comprobación sin dependencias:
 *   - sintaxis de TODOS los módulos (servidor, scripts y frontend),
 *   - que los imports relativos existen,
 *   - que cada id que usa app.js existe en index.html,
 *   - que el service worker cachea todos los módulos del frontend,
 *   - que hay exactamente 250 comandos preinstalados, sin duplicados.
 */
import { readFile, readdir, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const errors = [];

const list = async (dir) =>
  (await readdir(path.join(root, dir))).filter((f) => /\.m?js$/.test(f)).map((f) => path.join(dir, f));

const files = [...(await list('server')), ...(await list('scripts')), ...(await list('public')), ...(await list('public/js'))];

for (const file of files) {
  const full = path.join(root, file);
  try {
    execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' });
  } catch (error) {
    errors.push(`${file}: sintaxis → ${String(error.stderr || error.message).split('\n').slice(0, 4).join(' ')}`);
    continue;
  }
  const code = await readFile(full, 'utf8');
  for (const [, spec] of code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    await access(path.resolve(path.dirname(full), spec)).catch(() => errors.push(`${file}: import roto → ${spec}`));
  }
}

const html = await readFile(path.join(root, 'public/index.html'), 'utf8');
const app = await readFile(path.join(root, 'public/app.js'), 'utf8');
for (const [, id] of app.matchAll(/\$\('([\w-]+)'\)/g)) {
  if (!html.includes(`id="${id}"`)) errors.push(`app.js usa #${id}, que no existe en index.html`);
}

const sw = await readFile(path.join(root, 'public/sw.js'), 'utf8');
for (const file of ['app.js', ...(await list('public/js')).map((f) => f.replace('public/', ''))]) {
  if (!sw.includes(`'./${file}'`)) errors.push(`sw.js no cachea ./${file}`);
}

// Los comandos preinstalados tienen que ser exactamente 250, sin ids ni frases repetidas.
const { PRESETS, normalizeText } = await import(path.join(root, 'public/js/presets.js'));
if (PRESETS.length !== 250) errors.push(`presets.js tiene ${PRESETS.length} comandos, deberían ser 250`);
if (new Set(PRESETS.map((p) => p.id)).size !== PRESETS.length) errors.push('presets.js tiene ids repetidos');
const phrases = new Map();
for (const p of PRESETS) {
  for (const phrase of [...(p.phrases || []), ...(p.names || []).map((n) => `abre ${n}`)]) {
    if (phrase !== normalizeText(phrase)) errors.push(`presets.js: «${phrase}» no está normalizada (sin acentos ni mayúsculas)`);
    if (phrases.has(phrase)) errors.push(`presets.js: «${phrase}» está en ${phrases.get(phrase)} y en ${p.id}`);
    phrases.set(phrase, p.id);
  }
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ ${files.length} módulos: sintaxis, imports, ids del HTML y service worker correctos.`);
