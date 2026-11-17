// Compile le moteur de salle (TypeScript, partagé avec l'application) en un seul module ESM pour le serveur Node.
// Usage : node server/build.mjs    (nécessite esbuild : npm i -D esbuild)
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [join(root, 'server', 'engine-entry.ts')],
  outfile: join(root, 'server', 'dist', 'engine.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node20',
  alias: { '@': join(root, 'src') },
  loader: { '.json': 'json' }, logLevel: 'info',
});
