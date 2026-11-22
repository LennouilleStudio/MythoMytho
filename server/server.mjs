// Serveur de parties MythoMytho : HTTP + WebSocket (RFC 6455) sans aucune dépendance.
// Le serveur est le seul maître de la partie : il exécute le moteur de salle (src/net, même code que l'application),
// valide chaque intention d'un joueur et ne lui renvoie que SA vue filtrée.
//
//   node server/build.mjs && node server/server.mjs        (PORT=8787 par défaut ; ALLOWED_ORIGINS=https://a.fr,https://b.fr)
// Il sert aussi l'application web exportée (`expo export -p web` → dist/, ou STATIC_DIR=…) : un seul processus pour /, /local et le jeu en ligne.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as E from './dist/engine.mjs';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 64 * 1024; // assez pour les 300 paires personnalisées de l'hôte
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/* ------------------------------------------------------------------ WebSocket minimal (côté serveur) */

function frame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6); }
  return Buffer.concat([header, payload]);
}

/** Prend la main sur une socket « upgrade » et expose send / close / ping. Les trames clients doivent être masquées. */
function acceptWebSocket(req, socket, handlers) {
  const key = req.headers['sec-websocket-key'];
  if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return null; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);

  let buf = Buffer.alloc(0);
  let fragments = [];
  const ws = {
    open: true, alive: true, ctx: null,
    send(text) { if (ws.open) socket.write(frame(0x1, Buffer.from(text))); },
    ping() { if (ws.open) socket.write(frame(0x9, Buffer.alloc(0))); },
    close(code = 1000) {
      if (!ws.open) return;
      ws.open = false;
      const p = Buffer.alloc(2); p.writeUInt16BE(code, 0);
      socket.end(frame(0x8, p));
    },
    terminate() { ws.open = false; socket.destroy(); },
  };
  const protocolError = (code) => { ws.close(code); };

  socket.on('data', (chunk) => {
    ws.alive = true;
    buf = Buffer.concat([buf, chunk]);
    while (ws.open && buf.length >= 2) {
      const b0 = buf[0]; const b1 = buf[1];
      const fin = (b0 & 0x80) !== 0; const op = b0 & 0x0f; const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f; let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; if (buf.readUInt32BE(2) !== 0) return protocolError(1009); len = buf.readUInt32BE(6); off = 10; }
      if (!masked) return protocolError(1002);
      if (len > MAX_FRAME) return protocolError(1009);
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4);
      const payload = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);

      if (op === 0x8) { ws.close(1000); return; }
      if (op === 0x9) { if (ws.open) socket.write(frame(0xa, payload)); continue; }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x0) {
        if (op === 0x1) fragments = [];
        fragments.push(payload);
        if (fin) {
          const text = Buffer.concat(fragments).toString('utf8');
          fragments = [];
          if (text.length <= MAX_FRAME) handlers.message(ws, text);
        }
        continue;
      }
      return protocolError(1003); // trames binaires non prises en charge
    }
  });
  socket.on('close', () => { const was = ws.open; ws.open = false; handlers.close(ws, was); });
  socket.on('error', () => { ws.open = false; socket.destroy(); });
  return ws;
}

/* ------------------------------------------------------------------ fichiers statiques (application web exportée) */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

/**
 * Sert `root` : fichier exact s'il existe, sinon `index.html` pour toute adresse sans extension (/local, /scores… : application monopage,
 * le routeur côté client prend le relais). Retourne false si rien n'est servi (le serveur répond alors 404).
 */
function serveStatic(root, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return false; }
  if (pathname.includes('\0')) return false;
  const rootAbs = path.resolve(root);
  const candidate = path.resolve(rootAbs, '.' + pathname);
  if (candidate !== rootAbs && !candidate.startsWith(rootAbs + path.sep)) return false; // pas de remontée hors du dossier
  let file = candidate;
  let stat = null;
  try { stat = fs.statSync(file); if (stat.isDirectory()) { file = path.join(file, 'index.html'); stat = fs.statSync(file); } } catch { stat = null; }
  if (!stat || !stat.isFile()) {
    if (path.extname(pathname) !== '') return false; // fichier réclamé mais absent : vrai 404
    file = path.join(rootAbs, 'index.html');
    try { stat = fs.statSync(file); } catch { return false; }
    if (!stat.isFile()) return false;
  }
  const ext = path.extname(file).toLowerCase();
  const hashed = /[\\/]_expo[\\/]static[\\/]|[\\/]assets[\\/]assets[\\/]/.test(file);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}

/* ------------------------------------------------------------------ sauvegarde des salles (survivre à un redémarrage) */

const SAVE_VERSION = 1;
const SAVE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // une sauvegarde plus vieille que ça est ignorée

/** Écrit les salles dans `file` (fichier temporaire puis renommage : jamais de fichier à moitié écrit). Droits 0600 : il contient les jetons de session. */
function saveRooms(file, rooms, t) {
  const data = { v: SAVE_VERSION, savedAt: t, rooms: [...rooms.values()].map((e) => ({ room: e.room, idleMs: Math.max(0, t - e.last) })) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Relit les salles : tous les sièges repassent « hors ligne » (les clients se reconnectent avec leur jeton). Fichier absent ou abîmé → aucune salle. */
function loadRooms(file, t) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) {
    if (err && err.code !== 'ENOENT') { try { fs.renameSync(file, `${file}.abime`); } catch { /* tant pis */ } console.error('sauvegarde illisible, ignorée :', err.message); }
    return [];
  }
  if (!data || data.v !== SAVE_VERSION || !Array.isArray(data.rooms) || t - Number(data.savedAt) > SAVE_MAX_AGE_MS) return [];
  const out = [];
  for (const item of data.rooms) {
    const r = item && item.room;
    if (!r || typeof r.code !== 'string' || !Array.isArray(r.seats) || r.seats.length === 0 || !r.game || !Array.isArray(r.roster)) continue;
    out.push({ room: { ...r, seats: r.seats.map((s) => ({ ...s, connected: false })) }, last: t - (Number(item.idleMs) || 0) });
  }
  return out;
}

/* ------------------------------------------------------------------ serveur de parties */

export function createGameServer({
  allowedOrigins = null, now = () => Date.now(), roomTtlMs = 30 * 60 * 1000, staticDir = null,
  /** Fichier JSON où sauvegarder les salles (null = tout en mémoire). */
  dataFile = null,
  /** Délai avant de passer la main si l'hôte est déconnecté (une coupure réseau brève ne doit pas le destituer). 0 = tout de suite. */
  hostGraceMs = 15000,
  /** Période de l'horloge de salle (minuteur, passage d'hôte). */
  tickMs = 1000,
} = {}) {
  /** code → { room, conns: Map<seatId, Set<ws>>, last, hostAwaySince } */
  const rooms = new Map();
  const sockets = new Set();

  // Sauvegarde différée : regroupe les rafales de messages en une seule écriture.
  let saveTimer = null;
  const flush = () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!dataFile) return;
    try { saveRooms(dataFile, rooms, now()); } catch (err) { console.error('sauvegarde impossible :', err && err.message); }
  };
  const dirty = () => { if (dataFile && !saveTimer) { saveTimer = setTimeout(flush, 400); saveTimer.unref?.(); } };
  if (dataFile) {
    const t = now();
    for (const { room, last } of loadRooms(dataFile, t)) rooms.set(room.code, { room, conns: new Map(), last, hostAwaySince: t });
    if (rooms.size > 0) console.log(`${rooms.size} salle(s) restaurée(s) depuis ${dataFile}`);
  }

  const deps = () => ({
    now: now(), token: () => crypto.randomBytes(16).toString('hex'),
    themes: E.BUILTIN_THEMES, missions: E.MISSION_POOL,
  });
  const send = (ws, msg) => ws.send(JSON.stringify(msg));

  function newCode() {
    for (let n = 0; n < 200; n++) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
    throw new Error('plus de code de salle disponible');
  }

  function broadcast(entry) {
    const t = now();
    for (const [seatId, set] of entry.conns) {
      if (!entry.room.seats.some((s) => s.id === seatId)) continue;
      const view = E.viewFor(entry.room, seatId, t);
      for (const ws of set) send(ws, { t: 'view', view });
    }
  }

  function attach(entry, seatId, ws, token) {
    // Une seule connexion active par siège : la plus récente remplace l'ancienne (reconnexion, autre onglet).
    const old = entry.conns.get(seatId);
    if (old) for (const o of old) { o.ctx = null; o.close(1000); }
    entry.conns.set(seatId, new Set([ws]));
    ws.ctx = { code: entry.room.code, seatId };
    entry.last = now();
    send(ws, { t: 'joined', code: entry.room.code, token, seatId });
  }

  function detach(ws) {
    const ctx = ws.ctx; ws.ctx = null;
    if (!ctx) return;
    const entry = rooms.get(ctx.code);
    if (!entry) return;
    const set = entry.conns.get(ctx.seatId);
    if (set) { set.delete(ws); if (set.size === 0) entry.conns.delete(ctx.seatId); }
    if (!entry.conns.has(ctx.seatId) && entry.room.seats.some((s) => s.id === ctx.seatId)) {
      entry.room = E.setConnected(entry.room, ctx.seatId, false, hostGraceMs > 0);
      if (ctx.seatId === entry.room.hostId && hostGraceMs > 0) entry.hostAwaySince = now();
    }
    entry.last = now();
    if (entry.room.seats.length === 0) { rooms.delete(ctx.code); dirty(); return; }
    broadcast(entry); dirty();
  }

  function onMessage(ws, text) {
    try { dispatch(ws, text); } catch (err) {
      // Une entrée malformée ne doit jamais faire tomber la salle des autres joueurs.
      console.error('message rejeté :', err && err.message);
      if (ws.open) send(ws, { t: 'error', message: 'Message invalide.' });
    }
  }

  function dispatch(ws, text) {
    let msg;
    try { msg = JSON.parse(text); } catch { return send(ws, { t: 'error', message: 'Message illisible.' }); }
    if (!msg || typeof msg.t !== 'string') return send(ws, { t: 'error', message: 'Message invalide.' });
    // Anti-inondation : 40 messages par fenêtre de 5 s et par connexion.
    const t0 = now();
    ws.win = ws.win && t0 - ws.win.start < 5000 ? ws.win : { start: t0, n: 0 };
    if (++ws.win.n > 40) return ws.close(1008);
    if (msg.t === 'ping') return send(ws, { t: 'pong' });

    if (!ws.ctx) {
      if (msg.t === 'create') {
        const code = newCode();
        const made = E.createRoom(code, msg.name, deps());
        const entry = { room: made.room, conns: new Map(), last: now(), hostAwaySince: null };
        rooms.set(code, entry);
        attach(entry, made.seatId, ws, made.token);
        dirty();
        return broadcast(entry);
      }
      if (msg.t === 'join' || msg.t === 'rejoin') {
        const entry = rooms.get(String(msg.code ?? '').toUpperCase().trim());
        if (!entry) return send(ws, { t: 'error', message: 'Salle introuvable : vérifiez le code.' });
        if (msg.t === 'rejoin') {
          const seat = E.findSeatByToken(entry.room, String(msg.token ?? ''));
          if (!seat) return send(ws, { t: 'error', message: 'Session expirée : rejoignez la salle avec son code.' });
          entry.room = E.setConnected(entry.room, seat.id, true, hostGraceMs > 0);
          if (seat.id === entry.room.hostId) entry.hostAwaySince = null;
          attach(entry, seat.id, ws, seat.token);
          dirty();
          return broadcast(entry);
        }
        const res = E.joinRoom(entry.room, msg.name, deps());
        if ('error' in res) return send(ws, { t: 'error', message: res.error });
        entry.room = res.room;
        attach(entry, res.seatId, ws, res.token);
        dirty();
        return broadcast(entry);
      }
      return send(ws, { t: 'error', message: 'Rejoignez d\'abord une salle.' });
    }

    const entry = rooms.get(ws.ctx.code);
    if (!entry) { ws.ctx = null; return send(ws, { t: 'error', message: 'La salle n\'existe plus.' }); }
    const seatId = ws.ctx.seatId;
    const out = E.handle(entry.room, seatId, msg, deps());
    entry.last = now();
    if (out.error) return send(ws, { t: 'error', message: out.error });
    entry.room = out.room;

    // Siège retiré (renvoi par l'hôte, départ volontaire) : on prévient et on libère la connexion.
    for (const [sid, set] of [...entry.conns]) {
      if (entry.room.seats.some((s) => s.id === sid)) continue;
      for (const sock of set) { if (msg.t === 'kick') send(sock, { t: 'error', message: 'L\'hôte vous a retiré du salon.' }); sock.ctx = null; }
      entry.conns.delete(sid);
    }
    if (entry.room.seats.length === 0) { rooms.delete(entry.room.code); dirty(); return; }
    broadcast(entry); dirty();
  }

  /**
   * Horloge des salles : fin de minuteur constatée par le serveur, et passage d'hôte quand l'hôte est absent depuis plus de `hostGraceMs`.
   * Exposée pour les tests (horloge injectée) ; appelée chaque seconde en service.
   */
  function tickRooms() {
    const t = now();
    let changed = false;
    for (const entry of rooms.values()) {
      let next = E.tick(entry.room, t);
      const hostSeat = next.seats.find((s) => s.id === next.hostId);
      if (hostSeat && !hostSeat.connected) {
        entry.hostAwaySince ??= t;
        if (t - entry.hostAwaySince >= hostGraceMs) { next = E.electHost(next); entry.hostAwaySince = null; }
      } else entry.hostAwaySince = null;
      if (next !== entry.room) { entry.room = next; broadcast(entry); changed = true; }
    }
    if (changed) dirty();
  }
  const clock = setInterval(tickRooms, tickMs);
  clock.unref?.();

  const server = http.createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size })); }
    if (staticDir && serveStatic(staticDir, req, res)) return;
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(staticDir ? 'Introuvable.' : 'MythoMytho — serveur de parties (WebSocket).');
  });
  server.on('upgrade', (req, socket) => {
    const origin = req.headers.origin;
    // Liste blanche d'origines ; la page servie par ce même serveur (origine = Host de la requête) est toujours acceptée.
    const sameOrigin = (() => { try { return !!origin && new URL(origin).host === req.headers.host; } catch { return false; } })();
    if (allowedOrigins && !sameOrigin && (!origin || !allowedOrigins.includes(origin))) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const ws = acceptWebSocket(req, socket, {
      message: onMessage,
      close: (sock) => { sockets.delete(sock); detach(sock); },
    });
    if (ws) sockets.add(ws);
  });

  // Battement : une socket muette depuis 2 cycles est coupée (la salle la verra comme déconnectée).
  const beat = setInterval(() => {
    for (const ws of sockets) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
    const t = now();
    let purged = false;
    for (const [code, entry] of rooms) if (entry.conns.size === 0 && t - entry.last > roomTtlMs) { rooms.delete(code); purged = true; }
    if (purged) dirty();
  }, 20000);
  beat.unref?.();

  return {
    server, rooms, tick: tickRooms, flush,
    listen: (port = 0, host = '0.0.0.0') => new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port))),
    close: () => new Promise((resolve) => { clearInterval(beat); clearInterval(clock); flush(); for (const ws of sockets) ws.terminate(); server.close(() => resolve()); }),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const origins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const staticDir = process.env.STATIC_DIR ?? path.join(here, '..', 'dist');
  const hasApp = fs.existsSync(path.join(staticDir, 'index.html'));
  const dataDir = process.env.DATA_DIR;
  const srv = createGameServer({ allowedOrigins: origins, staticDir: hasApp ? staticDir : null, dataFile: dataDir ? path.join(dataDir, 'rooms.json') : null });
  const port = await srv.listen(Number(process.env.PORT ?? 8787));
  // Arrêt propre (Docker, Render, Fly envoient SIGTERM) : dernière sauvegarde puis sortie.
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { srv.flush(); process.exit(0); });
  console.log(`MythoMytho — serveur de parties sur le port ${port}${origins ? ` (origines : ${origins.join(', ')})` : ''} — ${dataDir ? `salles sauvegardées dans ${dataDir}` : 'salles en mémoire seulement (DATA_DIR pour les sauvegarder)'} — ${hasApp ? `application servie depuis ${staticDir}` : 'application absente (lancez « npm run build:web »)'}`);
}
