// Serveur de parties MythoMytho : HTTP + WebSocket (RFC 6455) sans aucune dépendance.
// Le serveur est le seul maître de la partie : il exécute le moteur de salle (src/net, même code que l'application),
// valide chaque intention d'un joueur et ne lui renvoie que SA vue filtrée.
// Autour du moteur : limites anti-abus (limits.mjs), comptes et classement (accounts.mjs), notifications push (push.mjs),
// journaux et statistiques (metrics.mjs), sauvegarde des salles (DATA_DIR), service de l'application web exportée.
//
//   node server/build.mjs && node server/server.mjs        (PORT=8787 par défaut ; ALLOWED_ORIGINS=https://a.fr,https://b.fr ;
//                                                          DATA_DIR, TRUST_PROXY, ADMIN_TOKEN, LOG_LEVEL : voir le README)
// Il sert aussi l'application web exportée (`expo export -p web` → dist/, ou STATIC_DIR=…) : un seul processus pour /, /local et le jeu en ligne.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as E from './dist/engine.mjs';
import { createAccounts } from './accounts.mjs';
import { clientIp, createLimiter } from './limits.mjs';
import { createMetrics } from './metrics.mjs';
import { PUSH_TOKEN, createPusher } from './push.mjs';

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

const SAVE_VERSION = 2;
const SAVE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // une sauvegarde plus vieille que ça est ignorée

/** Écrit les salles dans `file` (fichier temporaire puis renommage : jamais de fichier à moitié écrit). Droits 0600 : il contient les jetons de session. */
function saveRooms(file, rooms, t) {
  const data = {
    v: SAVE_VERSION, savedAt: t,
    rooms: [...rooms.values()].map((e) => ({
      room: e.room, idleMs: Math.max(0, t - e.last), pw: e.pw, bannedIps: [...e.bannedIps], push: [...e.push], statsKey: e.statsKey,
    })),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Relit les salles : tous les sièges repassent « hors ligne » (les clients se reconnectent avec leur jeton). Fichier absent, abîmé ou d'une autre version → aucune salle. */
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
    out.push({
      room: { ...r, seats: r.seats.map((s) => ({ ...s, connected: false })) }, last: t - (Number(item.idleMs) || 0),
      pw: item.pw && typeof item.pw.hash === 'string' && typeof item.pw.salt === 'string' ? item.pw : null,
      bannedIps: Array.isArray(item.bannedIps) ? item.bannedIps.filter((x) => typeof x === 'string') : [],
      push: Array.isArray(item.push) ? item.push.filter((p) => Array.isArray(p) && Number.isInteger(p[0]) && PUSH_TOKEN.test(String(p[1]))) : [],
      statsKey: Number.isFinite(item.statsKey) ? item.statsKey : null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ mots de passe de salle */

const roomPwHash = (pw, salt) => crypto.createHmac('sha256', salt).update(pw).digest('hex');
const cleanPw = (raw) => (typeof raw === 'string' ? raw.trim().slice(0, 64) : '');

function setRoomPassword(entry, raw) {
  const pw = cleanPw(raw);
  if (!pw) { entry.pw = null; return; }
  const salt = crypto.randomBytes(8).toString('hex');
  entry.pw = { salt, hash: roomPwHash(pw, salt) };
}

function roomPasswordOk(entry, raw) {
  if (!entry.pw) return true;
  const h = Buffer.from(roomPwHash(cleanPw(raw), entry.pw.salt), 'hex');
  const ref = Buffer.from(entry.pw.hash, 'hex');
  return h.length === ref.length && crypto.timingSafeEqual(h, ref);
}

const safeEqualText = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest(); const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

/* ------------------------------------------------------------------ serveur de parties */

const LIMIT_DEFAULTS = {
  connsPerIp: 40,        // connexions WebSocket simultanées par adresse (une classe derrière une box = une adresse)
  connsPerMin: 120,      // nouvelles connexions par minute et par adresse
  roomsPer10Min: 10,     // salles créées par adresse
  joinsPerMin: 40,       // tentatives de rejoindre (code, mot de passe) par adresse : freine l'essai de tous les codes
  passwordTriesPerMin: 8,// essais de mot de passe par adresse et par salle
  apiPerMin: 90, loginPerMin: 10, registerPerHour: 5,
  maxRooms: 5000,        // plafond global : au-delà, « serveur complet »
  msgPer5s: 40,          // messages par connexion
  chatPer10s: 6, reactPer10s: 12,
  maxMessage: 2048,      // octets d'un message (hors paires personnalisées)
};

export function createGameServer({
  allowedOrigins = null, now = () => Date.now(), roomTtlMs = 30 * 60 * 1000, staticDir = null,
  /** Fichier JSON où sauvegarder les salles (null = tout en mémoire). */
  dataFile = null,
  /** Fichier des comptes (null = en mémoire : perdus au redémarrage). */
  accountsFile = null,
  /** Délai avant de passer la main si l'hôte est déconnecté (une coupure réseau brève ne doit pas le destituer). 0 = tout de suite. */
  hostGraceMs = 15000,
  /** Période de l'horloge de salle (minuteur, passage d'hôte). */
  tickMs = 1000,
  /** Nombre de proxys de confiance devant le serveur (0 = aucun : on lit l'adresse de la connexion). */
  trustProxyHops = 0,
  /** Jeton qui ouvre /stats et /metrics (absent = ces pages n'existent pas). */
  adminToken = null,
  limits = {},
  /** Remplace `fetch` pour les notifications (tests). */
  pushFetch = undefined,
  /** { level: 'debug'|'info'|'warn'|'error'|'silent', sink: (ligne, niveau) => void } */
  logger = {},
} = {}) {
  const L = { ...LIMIT_DEFAULTS, ...limits };
  const metrics = createMetrics({ now, ...logger });
  const log = metrics.log;
  const accounts = createAccounts({ file: accountsFile, now });
  const pusher = createPusher({
    fetchImpl: pushFetch === undefined ? globalThis.fetch : pushFetch, now,
    onResult: (r) => { metrics.inc('push_sent', r.sent); metrics.inc('push_failed', r.failed); if (r.error) log('warn', 'push_error', { error: r.error }); },
  });
  const lim = {
    conns: createLimiter({ max: L.connsPerMin, windowMs: 60000, now }),
    rooms: createLimiter({ max: L.roomsPer10Min, windowMs: 600000, now }),
    joins: createLimiter({ max: L.joinsPerMin, windowMs: 60000, now }),
    pw: createLimiter({ max: L.passwordTriesPerMin, windowMs: 60000, now }),
    api: createLimiter({ max: L.apiPerMin, windowMs: 60000, now }),
    login: createLimiter({ max: L.loginPerMin, windowMs: 60000, now }),
    register: createLimiter({ max: L.registerPerHour, windowMs: 3600000, now }),
  };
  const ipConns = new Map();

  /** code → { room, conns: Map<seatId, Set<ws>>, last, hostAwaySince, pw, bannedIps: Set, push: Map<seatId, jeton>, chat: [], statsKey, snap } */
  const rooms = new Map();
  const sockets = new Set();

  const snapOf = (room) => ({ games: room.games, phase: room.game.active ? room.game.phase : 'lobby', voteKey: room.voteKey });
  const makeEntry = (room, extra = {}) => ({
    room, conns: new Map(), last: now(), hostAwaySince: null, pw: null, bannedIps: new Set(), push: new Map(), chat: [], statsKey: null,
    snap: snapOf(room), ...extra,
  });

  // Sauvegarde différée : regroupe les rafales de messages en une seule écriture.
  let saveTimer = null;
  const flush = () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    accounts.flush();
    if (!dataFile) return;
    try { saveRooms(dataFile, rooms, now()); } catch (err) { log('error', 'save_failed', { error: String(err && err.message) }); }
  };
  const dirty = () => { if (dataFile && !saveTimer) { saveTimer = setTimeout(flush, 400); saveTimer.unref?.(); } };
  if (dataFile) {
    const t = now();
    for (const x of loadRooms(dataFile, t)) {
      rooms.set(x.room.code, makeEntry(x.room, { last: x.last, hostAwaySince: t, pw: x.pw, bannedIps: new Set(x.bannedIps), push: new Map(x.push), statsKey: x.statsKey }));
    }
    if (rooms.size > 0) log('info', 'rooms_restored', { rooms: rooms.size });
  }

  const deps = () => ({
    now: now(), token: () => crypto.randomBytes(16).toString('hex'),
    themes: E.BUILTIN_THEMES, missions: E.MISSION_POOL,
  });
  const send = (ws, msg) => ws.send(JSON.stringify(msg));
  const fail = (ws, message, code) => send(ws, { t: 'error', message, ...(code ? { code } : {}) });

  function newCode() {
    for (let n = 0; n < 200; n++) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
    throw new Error('plus de code de salle disponible');
  }

  /** Effets d'un changement d'état : statistiques de compte (une fois par partie) et notifications aux joueurs hors ligne. */
  function afterChange(entry) {
    const room = entry.room;
    const before = entry.snap; const after = snapOf(room);
    entry.snap = after;
    const o = E.outcomeOf(room);
    if (o && entry.statsKey !== o.key) {
      entry.statsKey = o.key;
      metrics.inc('games_finished');
      for (const p of o.players) if (p.account) accounts.record(p.account, p.won);
      log('info', 'game_finished', { room: room.code, round: room.round, players: o.players.length });
    }
    if (entry.push.size === 0) return;
    let body = null;
    if (after.games !== before.games) body = `La manche ${room.round} commence : lisez votre carte.`;
    else if (after.phase === 'gameover' && before.phase !== 'gameover') body = 'La manche est terminée : découvrez les rôles.';
    else if (after.voteKey && after.voteKey !== before.voteKey) body = 'Le vote est ouvert : à vous de voter.';
    if (!body) return;
    const messages = [];
    for (const [seatId, token] of entry.push) {
      const seat = room.seats.find((s) => s.id === seatId);
      if (seat && !seat.connected && (room.roster.includes(seatId) || !room.game.active)) messages.push({ token, title: 'MythoMytho', body, data: { code: room.code } });
    }
    if (messages.length > 0) {
      pusher.send(messages).then((dead) => {
        for (const tk of dead) for (const [sid, v] of entry.push) if (v === tk) { entry.push.delete(sid); entry.room = E.setReachable(entry.room, sid, false); }
        if (dead.length > 0) dirty();
      }).catch(() => {});
    }
  }

  function broadcast(entry) {
    afterChange(entry);
    const t = now();
    const extra = { hasPassword: !!entry.pw };
    for (const [seatId, set] of entry.conns) {
      if (!entry.room.seats.some((s) => s.id === seatId)) continue;
      const view = E.viewFor(entry.room, seatId, t, extra);
      for (const ws of set) send(ws, { t: 'view', view });
    }
  }

  function broadcastEvent(entry, event) {
    for (const set of entry.conns.values()) for (const ws of set) send(ws, { t: 'event', event });
  }

  function attach(entry, seatId, ws, token) {
    // Une seule connexion active par siège : la plus récente remplace l'ancienne (reconnexion, autre onglet).
    const old = entry.conns.get(seatId);
    if (old) for (const o of old) { o.ctx = null; o.close(1000); }
    entry.conns.set(seatId, new Set([ws]));
    ws.ctx = { code: entry.room.code, seatId };
    entry.last = now();
    send(ws, { t: 'joined', code: entry.room.code, token, seatId });
    if (entry.room.chatOn && entry.chat.length > 0) send(ws, { t: 'chatlog', items: entry.chat });
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
      metrics.inc('errors');
      log('error', 'message_failed', { error: String(err && err.message) });
      if (ws.open) fail(ws, 'Message invalide.');
    }
  }

  /** Compte lié au jeton envoyé par le client : null (aucun), { error }, ou le compte. */
  function accountOf(msg) {
    if (msg.account === undefined || msg.account === null || msg.account === '') return null;
    return accounts.resolve(msg.account) ?? { error: 'Session de compte expirée : reconnectez-vous.' };
  }

  function dispatch(ws, text) {
    let msg;
    try { msg = JSON.parse(text); } catch { return fail(ws, 'Message illisible.'); }
    if (!msg || typeof msg.t !== 'string') return fail(ws, 'Message invalide.');
    metrics.inc('messages');
    // Anti-inondation : `msgPer5s` messages par fenêtre de 5 s et par connexion.
    const t0 = now();
    ws.win = ws.win && t0 - ws.win.start < 5000 ? ws.win : { start: t0, n: 0 };
    if (++ws.win.n > L.msgPer5s) { metrics.inc('rate_limited'); log('warn', 'flood_disconnect', { ip: ws.ip }); return ws.close(1008); }
    if (msg.t === 'ping') return send(ws, { t: 'pong' });
    if (text.length > L.maxMessage && msg.t !== 'pairs') return fail(ws, 'Message trop volumineux.');

    if (!ws.ctx) {
      if (msg.t === 'create') {
        if (!lim.rooms.hit(ws.ip)) { metrics.inc('rate_limited'); log('warn', 'rooms_rate_limited', { ip: ws.ip }); return fail(ws, 'Trop de salles créées depuis cette connexion : réessayez dans quelques minutes.', 'limit'); }
        if (rooms.size >= L.maxRooms) return fail(ws, 'Le serveur est complet : réessayez plus tard.', 'busy');
        const acct = accountOf(msg);
        if (acct && acct.error) return fail(ws, acct.error);
        const code = newCode();
        const made = E.createRoom(code, acct ? acct.pseudo : msg.name, deps(), acct ? acct.id : undefined);
        const entry = makeEntry(made.room);
        if (msg.password) setRoomPassword(entry, msg.password);
        rooms.set(code, entry);
        metrics.inc('rooms_created');
        log('info', 'room_created', { room: code, protected: !!entry.pw });
        attach(entry, made.seatId, ws, made.token);
        dirty();
        return broadcast(entry);
      }
      if (msg.t === 'join' || msg.t === 'rejoin') {
        if (!lim.joins.hit(ws.ip)) { metrics.inc('rate_limited'); log('warn', 'join_rate_limited', { ip: ws.ip }); return fail(ws, 'Trop de tentatives : patientez une minute.', 'limit'); }
        const entry = rooms.get(String(msg.code ?? '').toUpperCase().trim());
        if (!entry) return fail(ws, 'Salle introuvable : vérifiez le code.');
        if (msg.t === 'rejoin') {
          const seat = E.findSeatByToken(entry.room, String(msg.token ?? ''));
          if (!seat) return fail(ws, 'Session expirée : rejoignez la salle avec son code.');
          entry.room = E.setConnected(entry.room, seat.id, true, hostGraceMs > 0);
          if (seat.id === entry.room.hostId) entry.hostAwaySince = null;
          attach(entry, seat.id, ws, seat.token);
          dirty();
          return broadcast(entry);
        }
        if (entry.bannedIps.has(ws.ip)) return fail(ws, 'Vous avez été banni de cette salle.', 'banned');
        if (entry.pw) {
          if (!lim.pw.hit(`${ws.ip}|${entry.room.code}`)) { metrics.inc('rate_limited'); return fail(ws, 'Trop d\'essais de mot de passe : patientez une minute.', 'limit'); }
          if (!roomPasswordOk(entry, msg.password)) return fail(ws, msg.password ? 'Mot de passe incorrect.' : 'Cette salle est protégée par un mot de passe.', 'password');
        }
        const acct = accountOf(msg);
        if (acct && acct.error) return fail(ws, acct.error);
        if (acct && entry.room.seats.some((s) => s.account === acct.id)) return fail(ws, 'Ce compte est déjà dans la salle.');
        const res = E.joinRoom(entry.room, acct ? acct.pseudo : msg.name, deps(), acct ? acct.id : undefined);
        if ('error' in res) return fail(ws, res.error, res.code);
        entry.room = res.room;
        attach(entry, res.seatId, ws, res.token);
        dirty();
        return broadcast(entry);
      }
      return fail(ws, 'Rejoignez d\'abord une salle.');
    }

    const entry = rooms.get(ws.ctx.code);
    if (!entry) { ws.ctx = null; return fail(ws, 'La salle n\'existe plus.'); }
    const seatId = ws.ctx.seatId;
    const seat = entry.room.seats.find((s) => s.id === seatId);
    if (!seat) { ws.ctx = null; return fail(ws, 'Vous n\'êtes plus dans cette salle.'); }

    // Messages traités par le serveur lui-même (ils ne modifient pas l'état du moteur de salle).
    if (msg.t === 'chat' || msg.t === 'react') {
      const bucket = (ws.lim ??= {
        chat: createLimiter({ max: L.chatPer10s, windowMs: 10000, now }), react: createLimiter({ max: L.reactPer10s, windowMs: 10000, now }),
      })[msg.t];
      if (!bucket.hit('x')) { metrics.inc('rate_limited'); return fail(ws, 'Doucement : trop de messages à la suite.', 'limit'); }
      if (msg.t === 'react') {
        if (!E.isReaction(msg.emoji)) return fail(ws, 'Réaction inconnue.');
        return broadcastEvent(entry, { kind: 'react', seatId, name: seat.name, emoji: msg.emoji, at: now() });
      }
      const block = E.chatBlock(entry.room, seatId);
      if (block) return fail(ws, block);
      const clean = E.cleanChat(msg.text);
      if (!clean) return;
      const event = { kind: 'chat', seatId, name: seat.name, text: clean, at: now() };
      entry.chat.push(event); if (entry.chat.length > 40) entry.chat.shift();
      return broadcastEvent(entry, event);
    }
    if (msg.t === 'push') {
      if (msg.token === null) { entry.push.delete(seatId); entry.room = E.setReachable(entry.room, seatId, false); }
      else if (typeof msg.token === 'string' && PUSH_TOKEN.test(msg.token)) { entry.push.set(seatId, msg.token); entry.room = E.setReachable(entry.room, seatId, true); }
      else return fail(ws, 'Jeton de notification invalide.');
      return dirty();
    }
    if (msg.t === 'password') {
      if (entry.room.hostId !== seatId) return fail(ws, 'Seul l\'hôte peut faire cela.');
      setRoomPassword(entry, msg.password);
      dirty();
      return broadcast(entry);
    }

    // Bannir : on retient aussi les adresses du joueur renvoyé (salle uniquement ; une adresse partagée est donc bannie pour cette salle seulement).
    const banIps = msg.t === 'ban' && entry.room.hostId === seatId ? [...(entry.conns.get(msg.seatId) ?? [])].map((s) => s.ip) : [];

    const out = E.handle(entry.room, seatId, msg, deps());
    entry.last = now();
    if (out.error) return fail(ws, out.error);
    entry.room = out.room;
    if (msg.t === 'ban') { for (const ip of banIps) if (ip) entry.bannedIps.add(ip); log('info', 'player_banned', { room: entry.room.code }); }

    // Siège retiré (renvoi, bannissement, départ volontaire) : on prévient et on libère la connexion.
    for (const [sid, set] of [...entry.conns]) {
      if (entry.room.seats.some((s) => s.id === sid)) continue;
      for (const sock of set) {
        if (msg.t === 'kick') send(sock, { t: 'error', message: 'L\'hôte vous a retiré du salon.' });
        if (msg.t === 'ban') send(sock, { t: 'error', message: 'Vous avez été banni de cette salle.', code: 'banned' });
        sock.ctx = null;
      }
      entry.conns.delete(sid); entry.push.delete(sid);
    }
    if (entry.room.seats.length === 0) { rooms.delete(entry.room.code); dirty(); return; }
    broadcast(entry); dirty();
  }

  /**
   * Horloge des salles : fin de minuteur / de vote constatée par le serveur, et passage d'hôte quand l'hôte est absent depuis plus de `hostGraceMs`.
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

  /* ---- API HTTP : comptes, classement, statistiques */

  const json = (res, status, body, extra = {}) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
    res.end(body === null ? undefined : JSON.stringify(body));
  };

  /** En-têtes CORS : l'application native (ou le web en développement) appelle l'API depuis une autre origine. Renvoie false si l'origine est refusée. */
  function cors(req, res) {
    const origin = req.headers.origin;
    if (!origin) return true;
    let same = false; try { same = new URL(origin).host === req.headers.host; } catch { /* origine illisible */ }
    if (allowedOrigins && !same && !allowedOrigins.includes(origin)) return false;
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('access-control-max-age', '600');
    return true;
  }

  function readJson(req, max = 4096) {
    return new Promise((resolve, reject) => {
      let size = 0; let over = false; const chunks = [];
      const tooBig = () => { if (!over) { over = true; reject(Object.assign(new Error('trop gros'), { status: 413 })); } };
      if (Number(req.headers['content-length']) > max) tooBig();
      // Au-delà de la limite on cesse de stocker ; la connexion est fermée une fois la réponse 413 envoyée.
      req.on('data', (c) => { size += c.length; if (size > max) tooBig(); else if (!over) chunks.push(c); });
      req.on('end', () => { if (over) return; try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('JSON invalide'), { status: 400 })); } });
      req.on('error', reject);
    });
  }

  const bearer = (req) => { const h = String(req.headers.authorization ?? ''); return h.startsWith('Bearer ') ? h.slice(7).trim() : ''; };

  function gauges() {
    let connected = 0; let inGame = 0;
    for (const e of rooms.values()) { connected += e.conns.size; if (e.room.game.active) inGame++; }
    const mem = process.memoryUsage();
    return { rooms: rooms.size, rooms_in_game: inGame, seats_connected: connected, sockets: sockets.size, accounts: accounts.count, uptime_seconds: metrics.uptimeSec(), rss_bytes: mem.rss, heap_used_bytes: mem.heapUsed };
  }

  async function handleApi(req, res, ip) {
    if (!cors(req, res)) return json(res, 403, { error: 'Origine refusée.' });
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    metrics.inc('http_api');
    if (!lim.api.hit(ip)) { metrics.inc('rate_limited'); return json(res, 429, { error: 'Trop de requêtes : patientez une minute.' }, { 'retry-after': '60' }); }
    const url = new URL(req.url, 'http://x');
    const route = `${req.method} ${url.pathname}`;
    try {
      if (route === 'GET /api/leaderboard') return json(res, 200, { players: accounts.leaderboard(Number(url.searchParams.get('limit')) || 20) });
      if (route === 'GET /api/me') {
        const acct = accounts.resolve(bearer(req));
        return acct ? json(res, 200, { account: acct }) : json(res, 401, { error: 'Non connecté.' });
      }
      if (route === 'POST /api/register' || route === 'POST /api/login') {
        const register = route.endsWith('register');
        if (!(register ? lim.register : lim.login).hit(ip)) { metrics.inc('rate_limited'); log('warn', register ? 'register_rate_limited' : 'login_rate_limited', { ip }); return json(res, 429, { error: 'Trop de tentatives : réessayez plus tard.' }, { 'retry-after': '60' }); }
        const body = await readJson(req);
        const out = register ? await accounts.register(body.pseudo, body.password) : await accounts.login(body.pseudo, body.password);
        if (out.error) {
          if (!register) { metrics.inc('login_failed'); log('warn', 'login_failed', { ip }); }
          return json(res, out.conflict ? 409 : register ? 400 : 401, { error: out.error });
        }
        metrics.inc(register ? 'accounts_registered' : 'logins');
        return json(res, register ? 201 : 200, out);
      }
      if (route === 'POST /api/logout') { accounts.logout(bearer(req)); return json(res, 204, null); }
      if (route === 'DELETE /api/account') {
        const body = await readJson(req);
        const out = await accounts.remove(bearer(req), body.password);
        if (out.error) return json(res, out.error === 'Non connecté.' ? 401 : 403, { error: out.error });
        metrics.inc('accounts_deleted');
        return json(res, 204, null);
      }
      return json(res, 404, { error: 'Introuvable.' });
    } catch (err) {
      if (err && err.status) {
        if (err.status === 413) res.on('finish', () => req.socket.destroy());
        return json(res, err.status, { error: err.status === 413 ? 'Requête trop volumineuse.' : 'Requête invalide.' }, err.status === 413 ? { connection: 'close' } : {});
      }
      metrics.inc('errors'); log('error', 'api_failed', { error: String(err && err.message) });
      return json(res, 500, { error: 'Erreur du serveur.' });
    }
  }

  function handleAdmin(req, res) {
    if (!adminToken) return false;
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/stats' && url.pathname !== '/metrics') return false;
    if (!safeEqualText(bearer(req), adminToken)) { res.writeHead(401, { 'www-authenticate': 'Bearer' }); res.end(); return true; }
    if (url.pathname === '/metrics') { res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store' }); res.end(metrics.prometheus(gauges())); return true; }
    json(res, 200, { gauges: gauges(), counters: metrics.counters(), node: process.version });
    return true;
  }

  const server = http.createServer((req, res) => {
    const ip = clientIp(req, trustProxyHops);
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size })); }
    if (req.url.startsWith('/api/')) { void handleApi(req, res, ip); return; }
    if (handleAdmin(req, res)) return;
    if (staticDir && serveStatic(staticDir, req, res)) return;
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(staticDir ? 'Introuvable.' : 'MythoMytho — serveur de parties (WebSocket).');
  });
  server.on('upgrade', (req, socket) => {
    const origin = req.headers.origin;
    // Liste blanche d'origines ; la page servie par ce même serveur (origine = Host de la requête) est toujours acceptée.
    const sameOrigin = (() => { try { return !!origin && new URL(origin).host === req.headers.host; } catch { return false; } })();
    if (allowedOrigins && !sameOrigin && (!origin || !allowedOrigins.includes(origin))) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const ip = clientIp(req, trustProxyHops);
    if ((ipConns.get(ip) ?? 0) >= L.connsPerIp || !lim.conns.hit(ip)) {
      metrics.inc('rate_limited'); log('warn', 'connection_refused', { ip });
      socket.end('HTTP/1.1 429 Too Many Requests\r\nRetry-After: 60\r\n\r\n'); return;
    }
    const ws = acceptWebSocket(req, socket, {
      message: onMessage,
      close: (sock) => {
        sockets.delete(sock); detach(sock);
        const n = (ipConns.get(sock.ip) ?? 1) - 1; if (n <= 0) ipConns.delete(sock.ip); else ipConns.set(sock.ip, n);
      },
    });
    if (ws) { ws.ip = ip; ws.born = now(); sockets.add(ws); ipConns.set(ip, (ipConns.get(ip) ?? 0) + 1); metrics.inc('connections'); }
  });

  // Battement : une socket muette depuis 2 cycles est coupée (la salle la verra comme déconnectée).
  const beat = setInterval(() => {
    const t = now();
    for (const ws of sockets) {
      if (!ws.alive) { ws.terminate(); continue; }
      // Une connexion qui ne rejoint aucune salle en 60 s ne sert à rien : on la libère (elle compte dans la limite par adresse).
      if (!ws.ctx && t - ws.born > 60000) { ws.close(1008); continue; }
      ws.alive = false; ws.ping();
    }
    let purged = false;
    for (const [code, entry] of rooms) if (entry.conns.size === 0 && t - entry.last > roomTtlMs) { rooms.delete(code); purged = true; log('info', 'room_expired', { room: code }); }
    if (purged) dirty();
    for (const l of Object.values(lim)) l.sweep();
    accounts.sweep(); pusher.sweep();
  }, 20000);
  beat.unref?.();

  return {
    server, rooms, accounts, metrics, tick: tickRooms, flush,
    /** Diffuse l'état courant d'une salle (tests : après avoir modifié `rooms.get(code).room` directement). */
    touch: (code) => { const e = rooms.get(code); if (e) { broadcast(e); dirty(); } },
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
  const srv = createGameServer({
    allowedOrigins: origins, staticDir: hasApp ? staticDir : null,
    dataFile: dataDir ? path.join(dataDir, 'rooms.json') : null, accountsFile: dataDir ? path.join(dataDir, 'accounts.json') : null,
    trustProxyHops: Number(process.env.TRUST_PROXY ?? 0) || 0, adminToken: process.env.ADMIN_TOKEN || null,
    logger: { level: process.env.LOG_LEVEL || 'info' },
  });
  const port = await srv.listen(Number(process.env.PORT ?? 8787));
  // Arrêt propre (Docker, Render, Fly envoient SIGTERM) : dernière sauvegarde puis sortie.
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { srv.flush(); process.exit(0); });
  console.log(`MythoMytho — serveur de parties sur le port ${port}${origins ? ` (origines : ${origins.join(', ')})` : ''} — ${dataDir ? `salles sauvegardées dans ${dataDir}` : 'salles en mémoire seulement (DATA_DIR pour les sauvegarder)'} — ${hasApp ? `application servie depuis ${staticDir}` : 'application absente (lancez « npm run build:web »)'}`);
}
