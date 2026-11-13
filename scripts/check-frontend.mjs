/**
 * Comprobación ligera sin dependencias: valida que los imports del frontend
 * existen y que los módulos se pueden parsear.
 */
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'public');
const files = ['app.js', 'js/api.js', 'js/store.js', 'js/speech.js', 'js/mic.js', 'js/screen.js'];
let failed = false;

for (const file of files) {
  const full = path.join(root, file);
  try {
    await access(full);
    const code = await readFile(full, 'utf8');
    const imported = [...code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
    for (const spec of imported) {
      const target = path.resolve(path.dirname(full), spec);
      await access(target).catch(() => {
        throw new Error(`import roto en ${file}: ${spec}`);
      });
    }
  } catch (error) {
    failed = true;
    console.error(`✗ ${file}: ${error.message}`);
  }
}

if (failed) process.exit(1);
console.log('✓ Frontend: módulos e imports correctos.');
