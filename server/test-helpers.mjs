// Outils partagés par les tests : moteur sans réseau, client WebSocket, appels HTTP bruts.
import assert from 'node:assert/strict';
import http from 'node:http';
import * as E from './dist/engine.mjs';

export { E };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const stats = { checks: 0 };
export const ok = (c, m) => { assert.ok(c, m); stats.checks++; };
export const eq = (a, b, m) => { assert.deepEqual(a, b, m); stats.checks++; };
export const silent = { level: 'silent' };

/* ---------------------------------------------------------------- moteur */

let n = 0;
export const deps = (now = 1_000_000) => ({ now, token: () => `tok${++n}`, themes: E.BUILTIN_THEMES, missions: E.MISSION_POOL });
export const send = (room, seat, msg, now) => E.handle(room, seat, msg, deps(now));
export const must = (out, label) => { assert.equal(out.error, undefined, `${label} : ${out.error}`); stats.checks++; return out.room; };
export const mustFail = (out, re, label) => { ok(out.error && re.test(out.error), `${label} : « ${out.error} »`); return out.room; };

export function lobby(count = 5, account = {}) {
  const made = E.createRoom('TEST', 'P0', deps(), account[0]);
  let room = made.room;
  const seats = [0];
  for (let i = 1; i < count; i++) { const j = E.joinRoom(room, `P${i}`, deps(), account[i]); room = j.room; seats.push(j.seatId); }
  return { room, seats };
}

/** Joue la manche jusqu'à sa fin (tout le monde vote le premier joueur en vie qui n'est pas l'hôte). */
export function playToEnd(room, hostSeat, now) {
  for (let guard = 0; guard < 80 && room.game.phase !== 'gameover'; guard++) {
    const g = room.game;
    const seatOf = (pid) => room.roster[pid];
    if (g.phase === 'reveal') {
      for (const sid of room.roster) { const out = send(room, sid, { t: 'seen' }, now); if (!out.error) room = out.room; }
      room = must(send(room, hostSeat, { t: 'startVote' }, now), 'lancer le vote');
    } else if (g.modal === 'announce' || (g.modal === 'guess' && g.guess.stage === 'result')) {
      room = must(send(room, hostSeat, { t: 'continue' }, now), 'continuer');
    } else if (g.modal === 'guess') {
      room = must(send(room, seatOf(g.guessQueue[0]), { t: 'guess', value: 'au hasard' }, now), 'deviner');
    } else if (g.modal === 'pick') {
      room = must(send(room, hostSeat, { t: 'skip' }, now), 'passer le choix');
    } else if (g.phase === 'vote') {
      const living = g.players.filter((p) => !p.eliminated).map((p) => p.id);
      const target = living.find((id) => seatOf(id) !== hostSeat) ?? living[0];
      for (const pid of living) {
        const t = pid === target ? living.find((id) => id !== target) : target;
        const out = send(room, seatOf(pid), { t: 'vote', target: t }, now);
        if (!out.error) room = out.room;
      }
    }
  }
  assert.equal(room.game.phase, 'gameover', 'la manche doit se terminer');
  return room;
}

/* ---------------------------------------------------------------- réseau */

export class Client {
  constructor(url, name = '?') { this.url = url; this.name = name; this.view = null; this.errors = []; this.errorCodes = []; this.events = []; this.chatlog = null; this.raw = []; this.token = null; this.seatId = null; this.code = null; this.waiters = []; this.closed = null; }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve(this);
      this.ws.onerror = (e) => reject(e);
      this.ws.onclose = (ev) => { this.closed = ev.code; this.waiters = this.waiters.filter((w) => !w({ t: 'closed' })); };
      this.ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data); this.raw.push(ev.data);
        if (m.t === 'joined') { this.token = m.token; this.seatId = m.seatId; this.code = m.code; }
        if (m.t === 'view') this.view = m.view;
        if (m.t === 'error') { this.errors.push(m.message); this.errorCodes.push(m.code ?? null); }
        if (m.t === 'event') this.events.push(m.event);
        if (m.t === 'chatlog') this.chatlog = m.items;
        this.waiters = this.waiters.filter((w) => !w(m));
      };
    });
  }
  send(msg) { this.ws.send(JSON.stringify(msg)); }
  until(pred, label, ms = 2500) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`délai dépassé : ${label} (${this.name})`)), ms);
      const check = () => { if (pred(this)) { clearTimeout(t); resolve(this); return true; } return false; };
      if (check()) return;
      this.waiters.push(() => check());
    });
  }
  /** Attend un nouveau message d'erreur et le renvoie. */
  async nextError(label = 'erreur') {
    const before = this.errors.length;
    await this.until((c) => c.errors.length > before, label);
    return { message: this.errors[before], code: this.errorCodes[before] };
  }
  close() { try { this.ws.close(); } catch { /* déjà fermé */ } }
}

export async function connectAll(url, names) { return Promise.all(names.map((nm) => new Client(url, nm).connect())); }

/** Crée une salle de `count` joueurs (hôte + invités). */
export async function makeRoom(url, count, opts = {}) {
  const host = await new Client(url, 'H').connect();
  host.send({ t: 'create', name: 'Alice', ...(opts.create ?? {}) });
  await host.until((c) => c.view && c.view.stage === 'lobby', 'salon');
  const guests = [];
  for (let i = 1; i < count; i++) {
    const c = await new Client(url, `G${i}`).connect();
    c.send({ t: 'join', code: host.code, name: `Joueur${i}`, ...(opts.join ?? {}) });
    await c.until((x) => x.view && x.view.stage === 'lobby', `G${i} dans le salon`);
    guests.push(c);
  }
  await host.until((c) => c.view.seats.length === count, 'salon complet');
  return { host, guests, all: [host, ...guests] };
}

/** Requête HTTP brute (permet de choisir l'en-tête Origin, interdit à fetch). */
export function rawHttp(port, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: { ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let text = ''; res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* pas du JSON */ } resolve({ status: res.statusCode, headers: res.headers, text, json }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
