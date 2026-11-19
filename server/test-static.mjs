// Test du service de l'application web : /, /local (accès direct), fichiers hachés, 404, protection contre la remontée de dossier.
// Usage : node server/build.mjs && node server/test-static.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createGameServer } from './server.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-static-'));
fs.mkdirSync(path.join(dir, '_expo', 'static', 'js'), { recursive: true });
fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>MythoMytho</title>');
fs.writeFileSync(path.join(dir, 'sw.js'), '// sw');
fs.writeFileSync(path.join(dir, '_expo', 'static', 'js', 'entry-abc.js'), 'console.log(1)');
fs.writeFileSync(path.join(os.tmpdir(), 'mm-secret.txt'), 'secret');

const srv = createGameServer({ staticDir: dir });
const port = await srv.listen(0, '127.0.0.1');
const get = (p, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: p, method }, (res) => {
    let body = ''; res.on('data', (c) => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.on('error', reject); req.end();
});
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

for (const route of ['/', '/local', '/local/game', '/scores', '/custom-pairs']) {
  const r = await get(route);
  ok(r.status === 200 && r.body.includes('MythoMytho') && r.headers['content-type'].startsWith('text/html'), `${route} sert l'application`);
  ok(r.headers['cache-control'] === 'no-cache', `${route} jamais figé en cache`);
}
const js = await get('/_expo/static/js/entry-abc.js');
ok(js.status === 200 && js.headers['content-type'].startsWith('text/javascript') && /immutable/.test(js.headers['cache-control']), 'bundle haché : cache long');
ok((await get('/sw.js')).headers['cache-control'] === 'no-cache', 'service worker : toujours revalidé');
ok((await get('/absent.js')).status === 404, 'fichier absent : 404');
ok((await get('/local', 'HEAD')).status === 200, 'HEAD accepté');
ok((await get('/local', 'POST')).status === 404, 'POST refusé');
ok((await get('/../mm-secret.txt')).status !== 200 || !(await get('/../mm-secret.txt')).body.includes('secret'), 'remontée de dossier bloquée');
ok(!(await get('/%2e%2e/mm-secret.txt')).body.includes('secret'), 'remontée encodée bloquée');
const h = await get('/health');
ok(h.status === 200 && JSON.parse(h.body).ok === true, '/health toujours disponible');

await srv.close();
console.log(`✔ ${n} vérifications réussies — service de l'application OK`);
