// Tests des fonctions multijoueur : spectateurs, paires personnalisées, passage d'hôte, minuteur serveur, sauvegarde / redémarrage.
// Moteur (logique pure, horloge fournie) puis serveur réel (WebSocket, horloge injectée).
// Usage : node server/build.mjs && node server/test-features.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import * as E from './dist/engine.mjs';
import { createGameServer } from './server.mjs';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* =========================================================== moteur (sans réseau) =========================================================== */

let n = 0;
const deps = (now = 1_000_000) => ({ now, token: () => `tok${++n}`, themes: E.BUILTIN_THEMES, missions: E.MISSION_POOL });
const send = (room, seat, msg, now) => E.handle(room, seat, msg, deps(now));
const must = (out, label) => { assert.equal(out.error, undefined, `${label} : ${out.error}`); checks++; return out.room; };
const mustFail = (out, re, label) => { ok(out.error && re.test(out.error), `${label} : « ${out.error} »`); return out.room; };

function lobby(count = 5) {
  const made = E.createRoom('TEST', 'P0', deps());
  let room = made.room;
  const seats = [0];
  for (let i = 1; i < count; i++) { const j = E.joinRoom(room, `P${i}`, deps()); room = j.room; seats.push(j.seatId); }
  return { room, seats };
}

/** Joue la manche jusqu'à sa fin (tout le monde vote le premier joueur en vie qui n'est pas l'hôte). */
function playToEnd(room, hostSeat, now) {
  for (let guard = 0; guard < 60 && room.game.phase !== 'gameover'; guard++) {
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

// ---- spectateurs
{
  let { room, seats } = lobby(5);
  room = must(send(room, 0, { t: 'start' }), 'démarrage');
  const words = seats.map((s) => E.viewFor(room, s, 0).game.me.card.wordText).filter((w) => w !== 'Aucun mot');

  const j = E.joinRoom(room, 'Retard', deps());
  ok(!('error' in j), 'on peut rejoindre une partie en cours');
  room = j.room; const spec = j.seatId;
  const sv = E.viewFor(room, spec, 0);
  ok(sv.stage === 'game' && sv.game.spectator === true && sv.game.me === null, 'le nouvel arrivant est spectateur, sans carte');
  eq(sv.game.spectators, ['Retard'], 'le spectateur est listé');
  eq(sv.game.players.length, 5, 'la manche garde ses 5 joueurs');
  const json = JSON.stringify(sv);
  for (const w of new Set(words)) ok(!json.includes(w), `le spectateur ne voit pas le mot « ${w} »`);
  ok(sv.game.players.every((p) => p.icon === null && p.roleLabel === null), 'le spectateur ne voit aucun rôle');
  mustFail(send(room, spec, { t: 'seen' }), /carte/, 'un spectateur ne consulte pas de carte');
  mustFail(send(room, spec, { t: 'start' }), /hôte/, 'un spectateur n\'est pas hôte');
  const pv = E.viewFor(room, 1, 0);
  eq(pv.game.spectators, ['Retard'], 'les joueurs voient aussi qu\'un spectateur regarde');

  // vote : un spectateur ne vote pas et ne bloque pas le dépouillement
  for (const sid of room.roster) { const o = send(room, sid, { t: 'seen' }); room = o.error ? room : o.room; }
  room = must(send(room, 0, { t: 'startVote' }), 'vote');
  mustFail(send(room, spec, { t: 'vote', target: 1 }), /en vie/, 'un spectateur ne vote pas');
  ok(E.viewFor(room, spec, 0).game.vote.canVote === false, 'canVote faux pour un spectateur');
  // on ne retire pas un joueur en cours de manche, mais un spectateur oui
  mustFail(send(room, 0, { t: 'kick', seatId: 1 }), /manche/, 'pas de renvoi d\'un joueur en pleine manche');
  const kicked = must(send(room, 0, { t: 'kick', seatId: spec }), 'renvoi d\'un spectateur');
  ok(!kicked.seats.some((s) => s.id === spec), 'le spectateur renvoyé disparaît');
  room = kicked;

  // fin de manche → le spectateur joue à la manche suivante
  room = playToEnd(room, 0);
  room = must(send(room, 0, { t: 'nextRound' }), 'manche 2');
  eq(room.roster.length, 5, 'manche 2 : 5 joueurs (le spectateur renvoyé n\'y est plus)');

  // un spectateur présent à la fin entre dans la manche suivante ; un joueur absent n'y entre pas
  room = playToEnd(room, 0);
  const j2 = E.joinRoom(room, 'Retard2', deps()); room = j2.room;
  room = E.setConnected(room, 3, false); // P3 part
  room = must(send(room, 0, { t: 'nextRound' }), 'manche 3');
  eq(room.roster.length, 5, 'manche 3 : 5 joueurs = 4 présents + le spectateur, l\'absent est exclu');
  ok(room.roster.includes(j2.seatId) && !room.roster.includes(3), 'le spectateur devient joueur, l\'absent non');
  ok(room.seats.some((s) => s.id === 3), 'l\'absent garde son siège');
  const back = E.viewFor(E.setConnected(room, 3, true), 3, 0);
  ok(back.game.spectator === true, 'l\'absent qui revient regarde la manche en cours');
  // un spectateur qui part n'occupe plus de place
  const j3 = E.joinRoom(room, 'Fugitif', deps()); room = j3.room;
  room = must(send(room, j3.seatId, { t: 'leave' }), 'départ du spectateur');
  ok(!room.seats.some((s) => s.id === j3.seatId), 'le spectateur parti n\'a plus de siège');
}

// ---- paires personnalisées
{
  let { room } = lobby(4);
  const mine = [['Zorglub', 'Blorp', 2], ['Quasar', 'Pulsar', 1], ['Zorglub', 'Blorp', 3], ['seul'], 'n\'importe quoi', ['Pareil', 'pareil', 1]];
  mustFail(send(room, 1, { t: 'pairs', pairs: mine }), /hôte/, 'un invité n\'envoie pas de paires');
  room = must(send(room, 0, { t: 'pairs', pairs: mine }), 'envoi des paires');
  eq(room.customPairs.map((p) => p[0]), ['Zorglub', 'Quasar'], 'doublons et paires invalides écartés côté serveur');
  eq(E.viewFor(room, 2, 0).customPairCount, 2, 'tout le salon voit le nombre de paires');
  const big = Array.from({ length: 500 }, (_, i) => [`mot${i}`, `autre${i}`, 1]);
  eq(must(send(room, 0, { t: 'pairs', pairs: big }), 'très grosse liste').customPairs.length, 300, 'plafonné à 300 paires');
  eq(must(send(room, 0, { t: 'pairs', pairs: 'x' }), 'format invalide').customPairs.length, 0, 'un format invalide vide la liste sans planter');
  room = must(send(room, 0, { t: 'pairs', pairs: mine }), 'renvoi des paires');

  // le thème « Mes paires » est tiré, et seulement s'il est coché
  room = must(send(room, 0, { t: 'settings', patch: { selectedThemes: { perso: true } } }), 'réglage du thème');
  room = must(send(room, 0, { t: 'start' }), 'démarrage');
  const ws = new Set(['Zorglub', 'Blorp', 'Quasar', 'Pulsar']);
  ok(ws.has(room.game.civilWord) && ws.has(room.game.undercoverWord), `la paire tirée vient de « Mes paires » : ${room.game.civilWord} / ${room.game.undercoverWord}`);
  mustFail(send(room, 0, { t: 'pairs', pairs: [] }), /salon/, 'pas de changement de paires en cours de manche');
}

// ---- passage d'hôte
{
  let { room } = lobby(4);
  room = must(send(room, 0, { t: 'promote', seatId: 2 }), 'passage d\'hôte');
  ok(room.hostId === 2, 'P2 est hôte');
  mustFail(send(room, 0, { t: 'promote', seatId: 1 }), /hôte/, 'l\'ancien hôte n\'a plus la main');
  mustFail(send(room, 2, { t: 'promote', seatId: 2 }), /introuvable/, 'on ne se désigne pas soi-même');
  mustFail(send(room, 2, { t: 'promote', seatId: 99 }), /introuvable/, 'siège inexistant');
  room = E.setConnected(room, 1, false);
  mustFail(send(room, 2, { t: 'promote', seatId: 1 }), /hors ligne/, 'pas de passage à un absent');

  // délai de grâce : l'hôte déconnecté garde son rôle jusqu'à electHost
  let r = lobby(4).room;
  r = E.setConnected(r, 0, false, true);
  ok(r.hostId === 0, 'avec keepHost, l\'hôte déconnecté garde son rôle');
  r = E.electHost(r);
  ok(r.hostId !== 0 && r.seats.find((s) => s.id === r.hostId).connected, 'electHost désigne un joueur connecté');
  ok(E.electHost(r) === r, 'electHost ne change rien si l\'hôte est présent');
}

// ---- minuteur jugé par le serveur
{
  let { room, seats } = lobby(4);
  room = must(send(room, 0, { t: 'settings', patch: { timerEnabled: true, timerDurationMin: 1 } }), 'minuteur activé');
  const T0 = 5_000_000;
  room = must(send(room, 0, { t: 'start' }, T0), 'démarrage');
  for (const s of seats) room = must(send(room, s, { t: 'seen' }, T0), `carte lue par ${s}`);
  ok(room.timerEndsAt === T0 + 60_000, 'le minuteur démarre quand tout le monde a lu sa carte');
  ok(E.tick(room, T0 + 59_000) === room, 'avant l\'échéance : rien ne change');
  const over = E.tick(room, T0 + 60_500);
  ok(over.timerOver === true && over.game.phase === 'reveal', 'à l\'échéance : fin constatée, l\'hôte garde la main');
  ok(E.viewFor(over, 1, T0).game.timer.over === true, 'tous les joueurs reçoivent timer.over');
  ok(E.tick(over, T0 + 70_000) === over, 'la fin n\'est constatée qu\'une fois');
  const extended = must(send(over, 0, { t: 'extend' }, T0 + 61_000), '+1 min');
  ok(extended.timerOver === false && extended.timerEndsAt === T0 + 121_000, '+1 min rouvre le minuteur');

  // hôte absent à l'échéance : le vote s'ouvre tout seul
  const away = E.setConnected(room, 0, false, true);
  const auto = E.tick(away, T0 + 61_000);
  ok(auto.game.phase === 'vote' && auto.timerEndsAt === null, 'hôte absent à l\'échéance : le vote s\'ouvre');
  ok(/hôte absent/.test(E.viewFor(auto, 1, 0).game.vote.note), 'le salon en est informé');
}

// ---- lien d'invitation
{
  eq(E.parseInviteCode('abcd'), 'ABCD', 'code en minuscules accepté');
  eq(E.parseInviteCode(['wxyz', 'x']), 'WXYZ', 'paramètre répété : le premier compte');
  eq([E.parseInviteCode('ABC'), E.parseInviteCode('ABCDE'), E.parseInviteCode(''), E.parseInviteCode(undefined), E.parseInviteCode(42), E.parseInviteCode('<script>alert(1)</script>')], [null, null, null, null, null, null], 'valeurs invalides refusées');
  eq(E.inviteUrl('abcd', { webOrigin: 'https://jeu.exemple.fr', serverUrl: 'ws://x:1' }), 'https://jeu.exemple.fr/?salle=ABCD', 'web : adresse de la page');
  eq(E.inviteUrl('ABCD', { webOrigin: 'https://jeu.exemple.fr/', serverUrl: 'ws://x:1' }), 'https://jeu.exemple.fr/?salle=ABCD', 'barre finale retirée');
  eq(E.inviteUrl('ABCD', { webOrigin: null, serverUrl: 'wss://jeu.exemple.fr' }), 'https://jeu.exemple.fr/?salle=ABCD', 'natif : wss → https');
  eq(E.inviteUrl('ABCD', { webOrigin: null, serverUrl: 'ws://192.168.1.20:8787/chemin' }), 'http://192.168.1.20:8787/?salle=ABCD', 'natif : ws → http, port conservé');
  eq(E.inviteUrl('ABCD', { webOrigin: null, serverUrl: 'n\'importe quoi' }), null, 'aucune adresse connue : pas de lien');
  eq(E.inviteUrl('ABCD', { webOrigin: 'javascript:alert(1)', serverUrl: 'ws://h:1' }), 'http://h:1/?salle=ABCD', 'origine non http ignorée');
}

/* =========================================================== serveur réel =========================================================== */

class Client {
  constructor(url, name) { this.url = url; this.name = name; this.view = null; this.errors = []; this.raw = []; this.token = null; this.seatId = null; this.code = null; this.waiters = []; }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve(this);
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data); this.raw.push(ev.data);
        if (m.t === 'joined') { this.token = m.token; this.seatId = m.seatId; this.code = m.code; }
        if (m.t === 'view') this.view = m.view;
        if (m.t === 'error') this.errors.push(m.message);
        this.waiters = this.waiters.filter((w) => !w(m));
      };
    });
  }
  send(msg) { this.ws.send(JSON.stringify(msg)); }
  until(pred, label, ms = 2500) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`délai dépassé : ${label} (${this.name})`)), ms);
      const check = () => { if (this.view && pred(this.view)) { clearTimeout(t); resolve(this.view); return true; } return false; };
      if (check()) return;
      this.waiters.push((m) => (m.t === 'view' || m.t === 'error') && check());
    });
  }
}

async function room(url, count) {
  const host = await new Client(url, 'H').connect();
  host.send({ t: 'create', name: 'Alice' });
  await host.until((v) => v.stage === 'lobby', 'salon');
  const guests = [];
  for (let i = 1; i < count; i++) {
    const c = await new Client(url, `G${i}`).connect();
    c.send({ t: 'join', code: host.code, name: `Joueur${i}` });
    await c.until((v) => v.stage === 'lobby', `G${i} dans le salon`);
    guests.push(c);
  }
  await host.until((v) => v.seats.length === count, 'salon complet');
  return { host, guests, all: [host, ...guests] };
}

let clock = 10_000_000;
const now = () => clock;

// ---- délai de grâce de l'hôte (horloge injectée)
{
  const srv = createGameServer({ now, hostGraceMs: 5000, tickMs: 3_600_000, logger: { level: 'silent' } });
  const port = await srv.listen(0, '127.0.0.1');
  const url = `ws://127.0.0.1:${port}`;
  const { host, guests } = await room(url, 3);
  host.ws.close();
  await guests[0].until((v) => v.seats[0].connected === false, 'l\'hôte apparaît hors ligne');
  ok(guests[0].view.isHost === false && guests[1].view.isHost === false, 'pendant le délai de grâce, personne ne prend la place de l\'hôte');
  clock += 4000; srv.tick(); await sleep(80);
  ok(guests[0].view.isHost === false, 'à 4 s : toujours pas de changement');
  // retour de l'hôte dans le délai : il garde son rôle
  const back = await new Client(url, 'H bis').connect();
  back.send({ t: 'rejoin', code: host.code, token: host.token });
  await back.until((v) => v.isHost === true, 'l\'hôte revient et reste hôte');
  clock += 20_000; srv.tick(); await sleep(80);
  ok(back.view.isHost && !guests[0].view.isHost, 'après le délai, l\'hôte présent n\'est pas remplacé');
  // nouvelle absence, cette fois jusqu'au bout du délai
  back.ws.close();
  await guests[0].until((v) => v.seats[0].connected === false, 'hôte à nouveau hors ligne');
  clock += 6000; srv.tick();
  await guests[0].until((v) => v.isHost, 'passé 5 s, le premier joueur connecté devient hôte');
  ok(guests[0].view.seats.find((s) => s.host).name === 'Joueur1', 'Joueur1 est le nouvel hôte');
  for (const c of guests) c.ws.close();
  await srv.close();
}

// ---- minuteur : l'échéance est annoncée par le serveur à tous les clients
{
  const srv = createGameServer({ now, tickMs: 3_600_000, logger: { level: 'silent' } });
  const port = await srv.listen(0, '127.0.0.1');
  const { host, guests, all } = await room(`ws://127.0.0.1:${port}`, 4);
  host.send({ t: 'settings', patch: { timerEnabled: true, timerDurationMin: 1 } });
  await host.until((v) => v.settings.timerEnabled, 'minuteur réglé');
  host.send({ t: 'start' });
  await Promise.all(all.map((c) => c.until((v) => v.stage === 'game', 'en jeu')));
  for (const c of all) c.send({ t: 'seen' });
  await Promise.all(all.map((c) => c.until((v) => v.game.timer && v.game.timer.over === false, 'minuteur lancé')));
  clock += 61_000; srv.tick();
  await Promise.all(all.map((c) => c.until((v) => v.game.timer && v.game.timer.over === true, `${c.name} reçoit la fin du minuteur`)));
  ok(true, 'tous les clients reçoivent timer.over');
  // spectateur arrivé en cours de manche, via le réseau : aucune carte ni aucun mot
  const late = await new Client(`ws://127.0.0.1:${port}`, 'Retard').connect();
  late.send({ t: 'join', code: host.code, name: 'Retard' });
  await late.until((v) => v.game && v.game.spectator, 'spectateur en ligne');
  const words = new Set(all.map((c) => c.view.game.me.card.wordText).filter((w) => w !== 'Aucun mot'));
  for (const w of words) ok(!late.raw.join('\n').includes(w), `le spectateur n'a jamais reçu « ${w} »`);
  // paires personnalisées : 300 paires passent la limite de trame
  const big = Array.from({ length: 300 }, (_, i) => [`mot-numero-${i}-long`, `autre-mot-numero-${i}`, 2]);
  host.send({ t: 'toLobby' });
  await host.until((v) => v.stage === 'lobby', 'retour au salon');
  host.send({ t: 'pairs', pairs: big });
  await host.until((v) => v.customPairCount === 300, '300 paires reçues par le serveur');
  for (const c of [...guests, late]) c.ws.close();
  host.ws.close();
  await srv.close();
}

// ---- sauvegarde et redémarrage
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-save-'));
  const file = path.join(dir, 'sub', 'rooms.json');
  const a = createGameServer({ now, dataFile: file, hostGraceMs: 2000, tickMs: 3_600_000, logger: { level: 'silent' } });
  const portA = await a.listen(0, '127.0.0.1');
  const { host, guests, all } = await room(`ws://127.0.0.1:${portA}`, 4);
  host.send({ t: 'start' });
  await Promise.all(all.map((c) => c.until((v) => v.stage === 'game', 'en jeu')));
  guests[0].send({ t: 'seen' });
  await guests[0].until((v) => v.game.me.viewed, 'carte lue');
  const code = host.code;
  const before = all.map((c) => JSON.stringify({ me: c.view.game.me, players: c.view.game.players, round: c.view.game.round }));
  const tokens = all.map((c) => c.token);
  a.flush();
  ok(fs.existsSync(file), 'le fichier de sauvegarde existe');
  ok((fs.statSync(file).mode & 0o077) === 0, 'le fichier n\'est lisible que par son propriétaire (0600)');
  for (const c of all) c.ws.close();
  await a.close();

  // « redémarrage » : un nouveau serveur relit le fichier
  clock += 3000;
  const b = createGameServer({ now, dataFile: file, hostGraceMs: 2000, tickMs: 3_600_000, logger: { level: 'silent' } });
  const portB = await b.listen(0, '127.0.0.1');
  ok(b.rooms.has(code), 'la salle est restaurée');
  ok([...b.rooms.get(code).room.seats].every((s) => !s.connected), 'tous les sièges repartent « hors ligne »');
  const urlB = `ws://127.0.0.1:${portB}`;
  // un invité se reconnecte avant l'hôte : il ne lui prend pas la place
  const g1 = await new Client(urlB, 'G1 bis').connect();
  g1.send({ t: 'rejoin', code, token: tokens[2] });
  await g1.until((v) => v.stage === 'game', 'invité reconnecté');
  ok(g1.view.isHost === false, 'l\'invité reconnecté en premier n\'est pas hôte');
  const h2 = await new Client(urlB, 'H bis').connect();
  h2.send({ t: 'rejoin', code, token: tokens[0] });
  await h2.until((v) => v.stage === 'game', 'hôte reconnecté');
  ok(h2.view.isHost === true, 'l\'hôte retrouve son rôle');
  const g0 = await new Client(urlB, 'G0 bis').connect();
  g0.send({ t: 'rejoin', code, token: tokens[1] });
  await g0.until((v) => v.stage === 'game', 'joueur reconnecté');
  eq(JSON.stringify({ me: g0.view.game.me, players: g0.view.game.players, round: g0.view.game.round }).includes('"viewed":true'), true, 'la carte lue est toujours « lue »');
  eq(JSON.stringify(h2.view.game.me), JSON.stringify(JSON.parse(before[0]).me), 'la carte de l\'hôte est identique après redémarrage');
  eq(JSON.stringify(g1.view.game.me), JSON.stringify(JSON.parse(before[2]).me), 'la carte d\'un invité est identique après redémarrage');
  ok(before.length === 4 && h2.view.game.players.length === 4, 'la manche reprend avec ses 4 joueurs');
  const noOne = await new Client(urlB, 'Intrus').connect();
  noOne.send({ t: 'rejoin', code, token: 'jeton-volé' }); await sleep(120);
  ok(noOne.errors.some((e) => /expirée/.test(e)), 'un faux jeton reste refusé après redémarrage');
  for (const c of [g1, h2, g0, noOne]) c.ws.close();
  await b.close();

  // sauvegarde trop ancienne, abîmée, ou d'une autre version : ignorée sans planter
  clock += 7 * 60 * 60 * 1000;
  const old = createGameServer({ now, dataFile: file, tickMs: 3_600_000 });
  eq(old.rooms.size, 0, 'une sauvegarde de plus de 6 h est ignorée'); await old.close();
  fs.writeFileSync(file, '{ pas du json');
  const bad = createGameServer({ now, dataFile: file, tickMs: 3_600_000 });
  eq(bad.rooms.size, 0, 'un fichier abîmé est ignoré'); await bad.close();
  ok(fs.existsSync(`${file}.abime`), 'le fichier abîmé est mis de côté');
  fs.writeFileSync(file, JSON.stringify({ v: 999, savedAt: clock, rooms: [] }));
  eq(createGameServer({ now, dataFile: file, tickMs: 3_600_000 }).rooms.size, 0, 'une autre version de sauvegarde est ignorée');
}

// ---- origine : la page servie par le serveur lui-même est toujours acceptée
{
  const srv = createGameServer({ allowedOrigins: ['https://autorise.example'], tickMs: 3_600_000, logger: { level: 'silent' } });
  const port = await srv.listen(0, '127.0.0.1');
  const tryUpgrade = (origin) => new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/', headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), ...(origin ? { Origin: origin } : {}) } });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(101); });
    req.on('response', (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve(0));
    req.end();
  });
  eq(await tryUpgrade('https://autorise.example'), 101, 'origine de la liste : acceptée');
  eq(await tryUpgrade(`http://127.0.0.1:${port}`), 101, 'même origine que le serveur : acceptée');
  eq(await tryUpgrade('https://pirate.example'), 403, 'autre origine : refusée');
  eq(await tryUpgrade(null), 403, 'sans origine : refusée quand une liste est définie');
  await srv.close();
}

console.log(`\n✔ ${checks} vérifications réussies — spectateurs, paires, hôte, minuteur, sauvegarde OK`);
process.exit(0);
