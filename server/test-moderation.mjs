// Tests : protection contre les abus, salles protégées / verrouillées / bannissement, minuteur de vote et joueurs inactifs,
// historique et revanche, chat et réactions, notifications push, comptes et classement, surveillance du serveur.
// Usage : node server/build.mjs && node server/test-moderation.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGameServer } from './server.mjs';
import { createLimiter, clientIp } from './limits.mjs';
import { createAccounts } from './accounts.mjs';
import { createPusher } from './push.mjs';
import { Client, E, deps, eq, lobby, makeRoom, must, mustFail, ok, playToEnd, rawHttp, send, silent, sleep, stats } from './test-helpers.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mm-mod-'));
let clock = 50_000_000;
const now = () => clock;
const start = async (opts = {}) => {
  const srv = createGameServer({ now, tickMs: 3_600_000, logger: silent, ...opts });
  const port = await srv.listen(0, '127.0.0.1');
  return { srv, port, url: `ws://127.0.0.1:${port}` };
};

/* =========================================================== unités : limiteur, adresse du client, notifications =========================================================== */

{
  let t = 0;
  const l = createLimiter({ max: 3, windowMs: 1000, now: () => t });
  eq([l.hit('a'), l.hit('a'), l.hit('a'), l.hit('a')], [true, true, true, false], 'le 4e événement de la fenêtre est refusé');
  ok(l.hit('b'), 'une autre clé a sa propre fenêtre');
  t = 1000; ok(l.hit('a'), 'la fenêtre suivante repart de zéro');
  t = 5000; l.sweep(); eq(l.size, 0, 'les fenêtres expirées sont oubliées');

  const req = (xff, addr = '10.0.0.1') => ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: addr } });
  eq(clientIp(req('1.2.3.4'), 0), '10.0.0.1', 'sans proxy de confiance, l\'en-tête est ignoré (falsifiable)');
  eq(clientIp(req('6.6.6.6, 1.2.3.4'), 1), '1.2.3.4', 'un proxy : on lit la dernière entrée, celle que NOTRE proxy a ajoutée');
  eq(clientIp(req('9.9.9.9, 6.6.6.6, 1.2.3.4'), 2), '6.6.6.6', 'deux proxys : l\'avant-dernière');
  eq(clientIp(req(undefined), 1), '10.0.0.1', 'pas d\'en-tête : adresse de la connexion');
}

{
  // notifications : filtre des jetons, une par appareil et par intervalle, jetons morts renvoyés, jamais d'exception
  let t = 0; const calls = [];
  let answer = { data: [{ status: 'ok' }] };
  const pusher = createPusher({ now: () => t, minGapMs: 20000, fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { json: async () => answer }; } });
  const good = 'ExponentPushToken[abcdefghijklmnop]';
  eq(await pusher.send([{ token: 'pas-un-jeton', title: 'x', body: 'y' }]), [], 'jeton invalide : rien n\'est envoyé');
  eq(calls.length, 0, 'aucun appel réseau pour un jeton invalide');
  await pusher.send([{ token: good, title: 'T', body: 'B', data: { code: 'ABCD' } }]);
  eq([calls.length, calls[0].body[0].to, calls[0].body[0].body, calls[0].body[0].data.code], [1, good, 'B', 'ABCD'], 'un message correctement formé');
  await pusher.send([{ token: good, title: 'T', body: 'B2' }]);
  eq(calls.length, 1, 'pas deux notifications à la suite pour le même appareil');
  t = 25000; answer = { data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] };
  eq(await pusher.send([{ token: good, title: 'T', body: 'B3' }]), [good], 'un appareil désinscrit est signalé pour suppression');
  const broken = createPusher({ now: () => 0, fetchImpl: async () => { throw new Error('réseau coupé'); } });
  eq(await broken.send([{ token: good, title: 'T', body: 'B' }]), [], 'une panne du service ne lève jamais d\'exception');
}

/* =========================================================== moteur : verrou, bannissement, options =========================================================== */

{
  let { room } = lobby(4, { 1: 'acc-bob' });
  room = must(send(room, 0, { t: 'lock', locked: true }), 'verrouillage');
  const j = E.joinRoom(room, 'Neuf', deps());
  ok('error' in j && j.code === 'locked', 'salle verrouillée : on n\'entre plus');
  mustFail(send(room, 1, { t: 'lock', locked: false }), /hôte/, 'un invité ne verrouille pas');
  ok(E.findSeatByToken(room, room.seats[1].token), 'les joueurs déjà inscrits gardent leur siège (reconnexion possible)');
  room = must(send(room, 0, { t: 'lock', locked: false }), 'déverrouillage');
  ok(!('error' in E.joinRoom(room, 'Neuf', deps())), 'déverrouillée : on peut entrer');

  // bannissement : par pseudo (sans tenir compte de la casse) et par compte
  const bob = room.seats[1];
  room = must(send(room, 0, { t: 'ban', seatId: bob.id }), 'bannissement');
  ok(!room.seats.some((s) => s.id === bob.id), 'le joueur banni perd son siège');
  const again = E.joinRoom(room, 'p1', deps());
  ok('error' in again && again.code === 'banned', 'même pseudo (casse différente) : refusé');
  const byAccount = E.joinRoom(room, 'AutrePseudo', deps(), 'acc-bob');
  ok('error' in byAccount && byAccount.code === 'banned', 'même compte sous un autre pseudo : refusé');
  ok(!('error' in E.joinRoom(room, 'Quelqu\'un', deps(), 'acc-autre')), 'un autre joueur entre normalement');
  mustFail(send(room, 0, { t: 'ban', seatId: 0 }), /introuvable/, 'l\'hôte ne se bannit pas lui-même');
  mustFail(send(room, 2, { t: 'ban', seatId: 3 }), /hôte/, 'un invité ne bannit pas');
  // une fois la manche lancée : pas de bannissement d'un joueur en pleine manche
  const started = must(send(lobby(4).room, 0, { t: 'start' }), 'démarrage');
  mustFail(send(started, 0, { t: 'ban', seatId: 1 }), /manche/, 'pas de bannissement en pleine manche');

  // options
  eq(must(send(room, 0, { t: 'options', voteSec: 60, chat: true }), 'options').voteSec, 60, 'durée de vote réglée');
  mustFail(send(room, 0, { t: 'options', voteSec: 31 }), /invalide/, 'durée hors liste refusée');
  mustFail(send(room, 1, { t: 'options', chat: true }), /hôte/, 'un invité ne règle pas les options');

  // pseudos : caractères invisibles et inversion de sens d'écriture retirés
  const sneaky = E.joinRoom(room, 'A\u202edmin\u200b\u0000X', deps());
  ok(!('error' in sneaky) && !/[\u202e\u200b\u0000]/.test(sneaky.room.seats.at(-1).name), 'pseudo nettoyé des caractères d\'usurpation');
}

/* =========================================================== moteur : minuteur de vote, joueurs inactifs =========================================================== */

{
  const T0 = 1_000_000_000;
  let { room } = lobby(8);
  room = must(send(room, 0, { t: 'settings', patch: { autoUndercover: false, undercoverCount: 1 } }), 'un seul undercover');
  room = must(send(room, 0, { t: 'options', voteSec: 30 }), 'vote limité à 30 s');
  room = must(send(room, 0, { t: 'start' }, T0), 'démarrage');
  for (const sid of room.roster) room = must(send(room, sid, { t: 'seen' }, T0), 'carte lue');
  room = must(send(room, 0, { t: 'startVote' }, T0), 'ouverture du vote');
  eq(room.voteEndsAt, T0 + 30_000, 'le vote reçoit son échéance dès son ouverture');
  eq(E.viewFor(room, 1, T0).game.vote.endsAt, T0 + 30_000, 'les joueurs voient l\'échéance');

  const civils = room.game.players.filter((p) => p.baseRole === 'civil' && room.roster[p.id] !== 0).map((p) => p.id);
  const [absent, v1, v2, v3] = civils;
  const seatOf = (pid) => room.roster[pid];
  const living = () => room.game.players.filter((p) => !p.eliminated).map((p) => p.id);
  /** Tout le monde (sauf `abstain`) vote `target` ; la cible, elle, vote pour `absent`. */
  const castVotes = (target, abstain, now) => {
    for (const pid of living()) {
      if (abstain.includes(pid)) continue;
      room = must(send(room, seatOf(pid), { t: 'vote', target: pid === target ? absent : target }, now), `vote de ${pid}`);
    }
  };

  // Vote 1 : l'absent ne vote pas → le dépouillement attend la fin du temps
  castVotes(v1, [absent], T0 + 1000);
  eq(room.game.modal, 'none', 'tant que l\'absent n\'a pas voté et que le temps court, on attend');
  ok(E.tick(room, T0 + 29_000) === room, 'avant l\'échéance : rien ne change');
  room = E.tick(room, T0 + 30_001);
  ok(room.game.players[v1].eliminated, 'à l\'échéance, le vote est dépouillé avec les bulletins reçus');
  eq(room.idle[absent], 1, 'l\'absent a un vote manqué');
  ok(!E.viewFor(room, 1, 0).game.players[absent].idle, 'un vote manqué ne suffit pas pour être « inactif »');
  room = must(send(room, 0, { t: 'continue' }, T0 + 30_002), 'continuer');
  eq(room.voteEndsAt, T0 + 30_002 + 30_000, 'chaque nouveau vote repart pour 30 s');

  // Vote 2 : même absence → inactif
  castVotes(v2, [absent], T0 + 31_000);
  room = E.tick(room, T0 + 60_100);
  ok(room.game.players[v2].eliminated && room.idle[absent] === 2, 'deuxième vote manqué');
  ok(E.viewFor(room, 1, 0).game.players[absent].idle === true, 'l\'absent est marqué inactif pour tous');
  room = must(send(room, 0, { t: 'continue' }, T0 + 60_200), 'continuer');

  // Vote 3 : l'inactif ne bloque plus → dépouillement immédiat, sans attendre le minuteur
  castVotes(v3, [absent], T0 + 61_000);
  ok(room.game.players[v3].eliminated, 'le dernier vote requis suffit : l\'inactif ne bloque plus');
  room = must(send(room, 0, { t: 'continue' }, T0 + 61_100), 'continuer');
  if (room.game.phase === 'vote') {
    room = must(send(room, seatOf(absent), { t: 'vote', target: living().find((p) => p !== absent) }, T0 + 62_000), 'retour de l\'inactif');
    ok(room.idle[absent] === undefined, 'un joueur qui revient voter n\'est plus inactif');
  } else ok(true, 'la partie s\'est terminée avant le quatrième vote');
}

{
  // personne ne vote : le temps repart (rien à dépouiller) ; vote forcé par l'hôte quand une carte n'a pas été lue
  const T0 = 2_000_000_000;
  let { room } = lobby(4);
  room = must(send(room, 0, { t: 'options', voteSec: 30 }), 'options');
  room = must(send(room, 0, { t: 'start' }, T0), 'démarrage');
  mustFail(send(room, 0, { t: 'startVote' }, T0), /carte/, 'sans « force », toutes les cartes doivent être lues');
  room = must(send(room, 1, { t: 'seen' }, T0), 'une carte lue');
  mustFail(send(room, 1, { t: 'startVote', force: true }, T0), /hôte/, 'seul l\'hôte force');
  room = must(send(room, 0, { t: 'startVote', force: true }, T0), 'vote forcé par l\'hôte');
  ok(room.game.phase === 'vote' && room.game.players.every((p) => p.viewed), 'les cartes non lues sont comptées comme lues');
  const end = room.voteEndsAt;
  room = E.tick(room, end + 5);
  ok(room.game.phase === 'vote' && room.voteEndsAt === end + 5 + 30_000 && /Personne/.test(room.tieNote), 'personne n\'a voté : le temps repart, aucune élimination');
}

/* =========================================================== moteur : historique, revanche, issue, chat =========================================================== */

{
  let { room } = lobby(5);
  mustFail(send(room, 0, { t: 'rematch' }), /terminée/, 'pas de revanche hors fin de manche');
  room = must(send(room, 0, { t: 'start' }), 'démarrage');
  mustFail(send(room, 0, { t: 'rematch' }), /terminée/, 'pas de revanche en pleine manche');
  room = playToEnd(room, 0);
  const view = E.viewFor(room, 1, 0);
  eq(view.history.length, 1, 'la manche terminée figure dans l\'historique');
  const h = view.history[0];
  ok(h.turns.length >= 1 && h.turns.every((t) => t.votes.length > 0 && t.eliminated), 'le déroulé contient les votes de chaque tour');
  ok(h.players.length === 5 && h.players.every((p) => p.roleLabel), 'les rôles sont révélés à la fin');
  ok(h.civilWord && h.undercoverWord, 'les deux mots sont donnés');
  const o = E.outcomeOf(room);
  ok(o && o.players.length === 5 && o.players.every((p) => typeof p.won === 'boolean'), 'issue de la partie par siège');
  const key = o.key;
  mustFail(send(room, 1, { t: 'rematch' }), /hôte/, 'seul l\'hôte lance la revanche');
  room = must(send(room, 0, { t: 'rematch' }), 'revanche');
  ok(room.round === 1 && room.game.phase === 'reveal' && room.game.round === 1, 'la revanche repart à la manche 1');
  eq(E.viewFor(room, 1, 0).history.length, 1, 'l\'historique de la salle est conservé');
  eq(E.outcomeOf(room), null, 'pas d\'issue tant que la nouvelle partie n\'est pas finie');
  room = playToEnd(room, 0);
  ok(E.outcomeOf(room).key !== key, 'chaque partie a sa propre clé (comptée une seule fois)');
  eq(E.viewFor(room, 1, 0).history.length, 2, 'deux manches dans l\'historique');
  room = must(send(room, 0, { t: 'nextRound' }), 'manche suivante');
  eq(room.history.length, 2, 'l\'historique ne grossit pas deux fois pour la même manche');
}

{
  let { room } = lobby(4);
  ok(/désactivé/.test(E.chatBlock(room, 1)), 'chat désactivé par défaut');
  room = must(send(room, 0, { t: 'options', chat: true }), 'chat activé');
  eq(E.chatBlock(room, 1), null, 'chat activé : on peut écrire dans le salon');
  room = must(send(room, 0, { t: 'start' }), 'démarrage');
  eq(E.chatBlock(room, 1), null, 'un joueur en vie peut écrire');
  const spec = E.joinRoom(room, 'Spec', deps()); room = spec.room;
  ok(/spectateurs/.test(E.chatBlock(room, spec.seatId)), 'un spectateur n\'écrit pas pendant la manche');
  const pid = 2; const sid = room.roster[pid];
  room = { ...room, game: { ...room.game, players: room.game.players.map((p) => (p.id === pid ? { ...p, eliminated: true } : p)) } };
  ok(/éliminés/.test(E.chatBlock(room, sid)), 'un joueur éliminé reste silencieux');
  eq(E.cleanChat('  salut \u202e\u0000 tout   le monde  '), 'salut tout le monde', 'texte nettoyé');
  eq(E.cleanChat('   '), null, 'message vide ignoré');
  eq(E.cleanChat('x'.repeat(500)).length, 140, 'longueur plafonnée à 140');
  eq([E.isReaction('🔥'), E.isReaction('<script>'), E.isReaction(42)], [true, false, false], 'seules les réactions prévues passent');
}

{
  // résumé partageable d'une manche
  const r = { round: 2, winner: 'civils', title: 'Les civils gagnent', civilWord: 'Chat', undercoverWord: 'Tigre',
    players: [{ name: 'Ana', roleLabel: 'Civil', won: true, eliminated: false }, { name: 'Bo', roleLabel: 'Undercover', won: false, eliminated: true }],
    turns: [{ votes: [{ from: 'Ana', to: 'Bo' }, { from: 'Bo', to: 'Ana' }], eliminated: 'Bo', note: null }] };
  const txt = E.roundText(r);
  ok(txt.includes('Manche 2 — Les civils gagnent') && txt.includes('Mots : Chat / Tigre') && txt.includes('Tour 1 : Ana→Bo, Bo→Ana ⇒ Bo éliminé(e)') && txt.includes('Ana (Civil, gagne)') && txt.includes('Bo (Undercover)'), 'le résumé contient mots, votes, éliminés et rôles');
  eq(E.historyText([r, { ...r, round: 3 }]).split('\n\n').length, 2, 'les manches sont séparées par une ligne vide');
}

/* =========================================================== serveur : limites contre les abus =========================================================== */

{
  const { srv, url } = await start({ limits: { connsPerIp: 3, roomsPer10Min: 2, joinsPerMin: 4, msgPer5s: 8 } });
  const a = await new Client(url, 'a').connect(); const b = await new Client(url, 'b').connect(); const c = await new Client(url, 'c').connect();
  let refused = false;
  try { await new Client(url, 'd').connect(); } catch { refused = true; }
  ok(refused, 'au-delà de 3 connexions par adresse : la 4e est refusée (429)');
  a.send({ t: 'create', name: 'A' }); await a.until((x) => x.view, 'salle 1');
  b.send({ t: 'create', name: 'B' }); await b.until((x) => x.view, 'salle 2');
  c.send({ t: 'create', name: 'C' });
  const e = await c.nextError('3e salle');
  ok(e.code === 'limit' && /Trop de salles/.test(e.message), 'plafond de salles créées par adresse');
  a.close(); b.close(); c.close(); await sleep(60);

  const x = await new Client(url, 'x').connect();
  for (let i = 0; i < 4; i++) x.send({ t: 'join', code: `ZZ${'ABCD'[i]}Z`, name: 'X' });
  x.send({ t: 'join', code: 'ZZZZ', name: 'X' });
  await x.until((c2) => c2.errorCodes.includes('limit'), 'limite de tentatives');
  ok(x.errors.filter((m) => /introuvable/.test(m)).length === 4, 'les 4 premières tentatives sont traitées');
  ok(x.errorCodes.at(-1) === 'limit', 'la 5e est freinée : on ne peut plus essayer tous les codes');
  x.close(); await sleep(60);

  const f = await new Client(url, 'f').connect();
  for (let i = 0; i < 12; i++) f.send({ t: 'ping' });
  await f.until((c2) => c2.closed !== null, 'déconnexion pour inondation');
  eq(f.closed, 1008, 'trop de messages d\'affilée : connexion coupée (1008)');
  ok(srv.metrics.counters().rate_limited >= 3, 'les refus sont comptés');
  await srv.close();
}

{
  // un message trop gros est refusé, sauf les paires personnalisées ; un client muet est libéré
  const { srv, url } = await start();
  const { host } = await makeRoom(url, 1);
  host.send({ t: 'settings', patch: { privacy: 'x'.repeat(3000) } });
  const err = await host.nextError('trop gros');
  ok(/volumineux/.test(err.message), 'message de plus de 2 Ko refusé');
  const big = Array.from({ length: 300 }, (_, i) => [`mot-numero-${i}-long`, `autre-mot-numero-${i}`, 2]);
  host.send({ t: 'pairs', pairs: big });
  await host.until((c) => c.view.customPairCount === 300, '300 paires acceptées malgré leur taille');
  host.close(); await srv.close();
}

/* =========================================================== serveur : mot de passe, verrou, bannissement =========================================================== */

{
  const dir = tmp(); const dataFile = path.join(dir, 'rooms.json');
  const { srv, port, url } = await start({ dataFile, limits: { passwordTriesPerMin: 4 } });
  const host = await new Client(url, 'H').connect();
  host.send({ t: 'create', name: 'Alice', password: 'sésame-ouvre-toi' });
  await host.until((c) => c.view, 'salle protégée');
  ok(host.view.options.hasPassword === true, 'l\'hôte voit que la salle est protégée');

  const g = await new Client(url, 'G').connect();
  g.send({ t: 'join', code: host.code, name: 'Bob' });
  let e = await g.nextError('sans mot de passe');
  ok(e.code === 'password' && /protégée/.test(e.message), 'sans mot de passe : refusé avec un code lisible par l\'appli');
  g.send({ t: 'join', code: host.code, name: 'Bob', password: 'mauvais' });
  e = await g.nextError('mauvais');
  ok(e.code === 'password' && /incorrect/.test(e.message), 'mauvais mot de passe : refusé');
  g.send({ t: 'join', code: host.code, name: 'Bob', password: 'sésame-ouvre-toi' });
  await g.until((c) => c.view && c.view.stage === 'lobby', 'bon mot de passe');
  ok(g.view.options.hasPassword === true && !JSON.stringify(g.raw).includes('sésame'), 'le mot de passe n\'est jamais renvoyé aux clients');

  g.send({ t: 'password', password: 'piratage' });
  e = await g.nextError('invité change le mot de passe');
  ok(/hôte/.test(e.message), 'seul l\'hôte change le mot de passe');

  const t1 = await new Client(url, 'T1').connect();
  for (let i = 0; i < 5; i++) t1.send({ t: 'join', code: host.code, name: 'Essai', password: `faux${i}` });
  await t1.until((c) => c.errorCodes.includes('limit'), 'essais limités');
  await sleep(100);
  eq(t1.errorCodes, ['password', 'limit', 'limit', 'limit', 'limit'], 'après 4 essais par minute (3 déjà faits plus haut depuis cette adresse), les suivants sont freinés');
  t1.close();

  // sauvegardé sans le mot de passe en clair, et toujours exigé après redémarrage
  srv.flush();
  const saved = fs.readFileSync(dataFile, 'utf8');
  ok(!saved.includes('sésame') && /"hash"/.test(saved), 'le fichier de sauvegarde ne contient qu\'une empreinte');
  eq(fs.statSync(dataFile).mode & 0o077, 0, 'sauvegarde lisible par son seul propriétaire');
  const code = host.code;
  host.close(); g.close(); await srv.close();
  const b = await start({ dataFile });
  const late = await new Client(b.url, 'L').connect();
  late.send({ t: 'join', code, name: 'Carl' });
  e = await late.nextError('après redémarrage');
  ok(e.code === 'password', 'après redémarrage, la salle exige toujours son mot de passe');
  late.close(); await b.srv.close();

  // retirer le mot de passe
  const c2 = await start();
  const h2 = await new Client(c2.url, 'H').connect();
  h2.send({ t: 'create', name: 'Alice', password: 'abc' }); await h2.until((c) => c.view, 'salle');
  h2.send({ t: 'password', password: null });
  await h2.until((c) => c.view.options.hasPassword === false, 'mot de passe retiré');
  const g2 = await new Client(c2.url, 'G').connect();
  g2.send({ t: 'join', code: h2.code, name: 'Bob' });
  await g2.until((c) => c.view && c.view.stage === 'lobby', 'entrée libre');
  g2.close(); h2.close(); await c2.srv.close();
  void port;
}

{
  const { srv, url } = await start();
  const { host, guests } = await makeRoom(url, 3);
  const [bob, chloe] = guests;
  host.send({ t: 'lock', locked: true });
  await host.until((c) => c.view.options.locked, 'salle verrouillée');
  const late = await new Client(url, 'L').connect();
  late.send({ t: 'join', code: host.code, name: 'Dan' });
  let e = await late.nextError('verrouillée');
  ok(e.code === 'locked', 'salle verrouillée : code « locked »');
  // un joueur inscrit se reconnecte quand même
  const chloeToken = chloe.token; chloe.close();
  await host.until((c) => c.view.seats.some((s) => s.name === 'Joueur2' && !s.connected), 'Chloé hors ligne');
  const back = await new Client(url, 'C2').connect();
  back.send({ t: 'rejoin', code: host.code, token: chloeToken });
  await back.until((c) => c.view && c.view.stage === 'lobby', 'reconnexion malgré le verrou');
  host.send({ t: 'lock', locked: false });
  await host.until((c) => !c.view.options.locked, 'déverrouillée');

  // bannissement : le joueur est coupé, et ne peut plus revenir (pseudo, adresse)
  const bobId = host.view.seats.find((s) => s.name === 'Joueur1').id;
  host.send({ t: 'ban', seatId: bobId });
  await bob.until((c) => c.errorCodes.includes('banned'), 'Bob est prévenu');
  await host.until((c) => !c.view.seats.some((s) => s.id === bobId), 'siège retiré');
  const retry = await new Client(url, 'B2').connect();
  retry.send({ t: 'join', code: host.code, name: 'Autre nom' });
  e = await retry.nextError('retour de Bob');
  ok(e.code === 'banned', 'le joueur banni ne revient pas, même sous un autre pseudo (adresse retenue pour cette salle)');
  eq(host.view.seats.map((s) => s.name), ['Alice', 'Joueur2'], 'l\'hôte et l\'autre joueur sont intacts');
  for (const c of [host, bob, back, late, retry]) c.close();
  await srv.close();
}

/* =========================================================== serveur : chat et réactions =========================================================== */

{
  const { srv, url } = await start({ limits: { chatPer10s: 3, reactPer10s: 4 } });
  const { host, guests, all } = await makeRoom(url, 3);
  const [bob, chloe] = guests;
  bob.send({ t: 'chat', text: 'salut' });
  ok(/désactivé/.test((await bob.nextError('chat coupé')).message), 'chat désactivé par défaut');
  host.send({ t: 'options', chat: true });
  await host.until((c) => c.view.options.chat, 'chat activé');
  bob.send({ t: 'chat', text: '  Bonjour \u202e tout   le monde  ' });
  await Promise.all(all.map((c) => c.until((x) => x.events.some((ev) => ev.kind === 'chat'), `${c.name} reçoit le message`)));
  const ev = host.events.find((x) => x.kind === 'chat');
  ok(ev.name === 'Joueur1' && ev.text === 'Bonjour tout le monde', 'message nettoyé, signé du pseudo (jamais d\'un autre champ)');
  bob.send({ t: 'chat', text: '   ' });
  bob.send({ t: 'react', emoji: '🔥' });
  await Promise.all(all.map((c) => c.until((x) => x.events.some((y) => y.kind === 'react' && y.emoji === '🔥'), 'réaction reçue')));
  bob.send({ t: 'react', emoji: '<img src=x>' });
  ok(/inconnue/.test((await bob.nextError('réaction invalide')).message), 'réaction hors liste refusée');
  // 3 messages max par 10 s : 1 déjà envoyé (+ le vide, compté), puis le suivant dépasse
  bob.send({ t: 'chat', text: 'deux' }); bob.send({ t: 'chat', text: 'trois' });
  await bob.until((c) => c.errorCodes.includes('limit'), 'limite du chat');
  ok(true, 'au-delà de 3 messages en 10 s : « Doucement »');

  // un joueur qui se reconnecte retrouve l'historique du chat
  const token = chloe.token; chloe.close();
  await host.until((c) => c.view.seats.some((s) => s.name === 'Joueur2' && !s.connected), 'Chloé partie');
  const back = await new Client(url, 'C2').connect();
  back.send({ t: 'rejoin', code: host.code, token });
  await back.until((c) => c.chatlog !== null, 'historique du chat');
  ok(back.chatlog.some((m) => m.text === 'Bonjour tout le monde'), 'l\'historique est renvoyé à la reconnexion');

  // un spectateur ne peut pas écrire pendant la manche
  host.send({ t: 'start' });
  await host.until((c) => c.view.stage === 'game', 'en jeu');
  const spec = await new Client(url, 'S').connect();
  spec.send({ t: 'join', code: host.code, name: 'Spect' });
  await spec.until((c) => c.view && c.view.game && c.view.game.spectator, 'spectateur');
  spec.send({ t: 'chat', text: 'je regarde' });
  ok(/spectateurs/.test((await spec.nextError('spectateur')).message), 'un spectateur n\'écrit pas pendant la manche');
  spec.send({ t: 'react', emoji: '👀' });
  await host.until((c) => c.events.some((x) => x.emoji === '👀'), 'les spectateurs peuvent réagir');
  for (const c of [...all, back, spec]) c.close();
  await srv.close();
}

/* =========================================================== serveur : notifications push =========================================================== */

{
  const dir = tmp(); const dataFile = path.join(dir, 'rooms.json');
  const sent = []; let mode = 'ok';
  const pushFetch = async (url, init) => {
    const body = JSON.parse(init.body); sent.push(...body);
    if (mode === 'fail') throw new Error('Expo injoignable');
    return { json: async () => ({ data: body.map(() => (mode === 'dead' ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' })) }) };
  };
  const { srv, url } = await start({ pushFetch, hostGraceMs: 0, dataFile });
  const { host, guests, all } = await makeRoom(url, 4);
  const [bob, chloe, dan] = guests;
  const TOKEN_BOB = 'ExponentPushToken[bobbobbobbobbobbob]'; const TOKEN_CHLOE = 'ExponentPushToken[chloechloechloe12]';
  bob.send({ t: 'push', token: 'n-importe-quoi' });
  ok(/invalide/.test((await bob.nextError('jeton invalide')).message), 'jeton de notification invalide refusé');
  bob.send({ t: 'push', token: TOKEN_BOB }); chloe.send({ t: 'push', token: TOKEN_CHLOE });
  await sleep(100);
  bob.close();
  await host.until((c) => c.view.seats.some((s) => s.name === 'Joueur1' && !s.connected), 'Bob hors ligne');
  host.send({ t: 'start' });
  await host.until((c) => c.view.stage === 'game', 'manche lancée');
  await sleep(150);
  eq(sent.map((m) => m.to), [TOKEN_BOB], 'seul le joueur HORS LIGNE est prévenu (Chloé est connectée)');
  ok(/manche 1 commence/.test(sent[0].body) && sent[0].data.code === host.code, 'message utile, avec le code de la salle');
  ok(host.view.game.players.some((p) => p.name === 'Joueur1' && !p.connected), 'Bob, hors ligne mais joignable par notification, fait partie de la manche');

  // le vote s'ouvre sans sa carte lue (l'hôte force) : même appareil, moins de 20 s → pas de seconde notification
  chloe.send({ t: 'seen' }); host.send({ t: 'seen' }); dan.send({ t: 'seen' });
  await sleep(50);
  host.send({ t: 'startVote', force: true });
  await host.until((c) => c.view.game.phase === 'vote', 'vote ouvert');
  await sleep(100);
  eq(sent.length, 1, 'même appareil, moins de 20 s : pas de seconde notification');

  // fin de manche, 25 s plus tard : nouvelle notification ; le service dit que l'appareil n'existe plus → on l'oublie
  const entry = srv.rooms.get(host.code);
  clock += 25_000; mode = 'dead';
  entry.room = playToEnd(entry.room, entry.room.hostId, clock);
  srv.touch(host.code);
  await host.until((c) => c.view.game.phase === 'gameover', 'partie finie');
  await sleep(150);
  eq(sent.length, 2, 'fin de manche : une notification part vers l\'appareil absent');
  ok(/terminée/.test(sent[1].body) && sent[1].to === TOKEN_BOB, 'adressée à Bob (Chloé, connectée, n\'est jamais dérangée)');
  ok(!entry.push.has(bob.seatId) && entry.push.has(chloe.seatId), 'l\'appareil déclaré désinscrit est oublié, les autres restent');
  ok(entry.room.seats.find((s) => s.id === bob.seatId).reachable === false, 'et Bob n\'est plus compté comme joignable');

  // panne du service de notification : la partie continue
  mode = 'fail'; clock += 25_000;
  host.send({ t: 'nextRound' });
  await host.until((c) => c.view.game.phase === 'reveal' && c.view.game.round === 2, 'manche 2 malgré la panne du service');
  ok(true, 'une panne du service de notification ne gêne pas la partie');
  srv.flush();
  ok(fs.readFileSync(dataFile, 'utf8').includes(TOKEN_CHLOE) && !fs.readFileSync(dataFile, 'utf8').includes(TOKEN_BOB), 'les jetons valides sont sauvegardés avec la salle, pas ceux qui ont été retirés avec la salle');
  for (const c of all) c.close();
  await srv.close();
}

/* =========================================================== serveur : comptes, classement, statistiques =========================================================== */

{
  const dir = tmp(); const accountsFile = path.join(dir, 'accounts.json'); const dataFile = path.join(dir, 'rooms.json');
  const { srv, port, url } = await start({ accountsFile, dataFile, limits: { loginPerMin: 4, registerPerHour: 12 } });
  const api = (method, p, body, headers = {}) => rawHttp(port, method, p, { body, headers });
  const auth = (t) => ({ authorization: `Bearer ${t}` });
  const PW = 'motdepasse-solide-42';

  let r = await api('POST', '/api/register', { pseudo: 'a', password: PW });
  ok(r.status === 400 && /Pseudo/.test(r.json.error), 'pseudo trop court refusé');
  r = await api('POST', '/api/register', { pseudo: 'Alice', password: 'court' });
  ok(r.status === 400 && /Mot de passe/.test(r.json.error), 'mot de passe trop court refusé');
  r = await api('POST', '/api/register', { pseudo: '<b>x</b>', password: PW });
  ok(r.status === 400, 'caractères de balisage refusés dans le pseudo');
  r = await api('POST', '/api/register', { pseudo: 'Alice', password: PW });
  ok(r.status === 201 && r.json.token && r.json.account.pseudo === 'Alice' && !('hash' in r.json.account) && !('salt' in r.json.account), 'inscription : jeton + compte public (sans empreinte)');
  const alice = r.json;
  r = await api('POST', '/api/register', { pseudo: 'aLiCe', password: PW });
  eq(r.status, 409, 'pseudo déjà pris, sans tenir compte de la casse');
  r = await api('POST', '/api/login', { pseudo: 'Alice', password: 'mauvais-mot-de-passe' });
  const wrong = r;
  r = await api('POST', '/api/login', { pseudo: 'Inconnu', password: 'mauvais-mot-de-passe' });
  ok(wrong.status === 401 && r.status === 401 && wrong.json.error === r.json.error, 'pseudo inconnu et mauvais mot de passe : même réponse (pas d\'énumération)');
  r = await api('POST', '/api/login', { pseudo: 'alice', password: PW });
  ok(r.status === 200 && r.json.token && r.json.token !== alice.token, 'connexion : nouveau jeton');
  const session2 = r.json.token;
  r = await api('POST', '/api/login', { pseudo: 'alice', password: 'x' });
  eq(r.status, 401, 'mauvais mot de passe');
  r = await api('POST', '/api/login', { pseudo: 'alice', password: 'x' });
  eq(r.status, 429, 'trop de tentatives de connexion depuis la même adresse : 429');

  r = await api('GET', '/api/me', undefined, auth(alice.token));
  ok(r.status === 200 && r.json.account.pseudo === 'Alice', 'GET /api/me avec jeton');
  eq((await api('GET', '/api/me')).status, 401, 'sans jeton : 401');
  eq((await api('GET', '/api/me', undefined, auth('faux'.repeat(10)))).status, 401, 'faux jeton : 401');
  r = await api('POST', '/api/register', 'x'.repeat(6000));
  eq(r.status, 413, 'corps trop volumineux : 413');
  r = await api('POST', '/api/register', '{pas du json');
  eq(r.status, 400, 'JSON invalide : 400');

  // CORS : l'application native appelle l'API depuis une autre origine
  const cs = await start({ allowedOrigins: ['https://appli.example'] });
  r = await rawHttp(cs.port, 'OPTIONS', '/api/login', { headers: { origin: 'https://appli.example', 'access-control-request-method': 'POST' } });
  ok(r.status === 204 && r.headers['access-control-allow-origin'] === 'https://appli.example' && /authorization/.test(r.headers['access-control-allow-headers']), 'préparation CORS acceptée pour une origine autorisée');
  r = await rawHttp(cs.port, 'OPTIONS', '/api/login', { headers: { origin: 'https://pirate.example' } });
  eq(r.status, 403, 'origine inconnue : refusée');
  r = await rawHttp(cs.port, 'GET', '/api/leaderboard', { headers: { origin: `http://127.0.0.1:${cs.port}` } });
  eq(r.status, 200, 'la page servie par le serveur lui-même est toujours acceptée');
  await cs.srv.close();

  // le fichier ne contient ni mot de passe ni jeton en clair
  srv.flush();
  const file = fs.readFileSync(accountsFile, 'utf8');
  ok(!file.includes(PW) && !file.includes(alice.token) && !file.includes(session2) && /"salt"/.test(file), 'mots de passe hachés (scrypt + sel), jetons conservés sous forme d\'empreinte');
  eq(fs.statSync(accountsFile).mode & 0o077, 0, 'fichier des comptes lisible par son seul propriétaire');

  // deux autres comptes, puis une partie à trois en ligne avec des sièges liés aux comptes
  const reg = async (pseudo) => (await api('POST', '/api/register', { pseudo, password: PW })).json;
  const bob = await reg('Bob'); const chloe = await reg('Chloé');
  const host = await new Client(url, 'H').connect();
  host.send({ t: 'create', name: 'Pirate', account: alice.token });
  await host.until((c) => c.view, 'salle');
  ok(host.view.seats[0].name === 'Alice', 'le pseudo du compte remplace celui envoyé par le client');
  const c1 = await new Client(url, 'B').connect(); c1.send({ t: 'join', code: host.code, name: 'x', account: bob.token });
  const c2 = await new Client(url, 'C').connect(); c2.send({ t: 'join', code: host.code, name: 'y', account: chloe.token });
  await host.until((c) => c.view.seats.length === 3, 'trois joueurs');
  const dup = await new Client(url, 'D').connect(); dup.send({ t: 'join', code: host.code, name: 'z', account: bob.token });
  ok(/déjà dans la salle/.test((await dup.nextError('compte en double')).message), 'un même compte ne s\'assoit pas deux fois');
  const bad = await new Client(url, 'X').connect(); bad.send({ t: 'join', code: host.code, name: 'z', account: 'jeton-expire'.repeat(3) });
  ok(/expirée/.test((await bad.nextError('jeton de compte invalide')).message), 'jeton de compte invalide refusé (on ne joue pas en anonyme par erreur)');
  eq(Object.keys(host.view.seats[0]).sort(), ['connected', 'host', 'id', 'name'], 'le compte n\'est jamais exposé aux autres joueurs');

  host.send({ t: 'start' }); await host.until((c) => c.view.stage === 'game', 'manche');
  // on termine la partie côté moteur sur l'état réel de la salle (le serveur constate la fin à l'horloge suivante)
  const entry = srv.rooms.get(host.code);
  entry.room = playToEnd(entry.room, entry.room.hostId, clock);
  srv.touch(host.code);
  await host.until((c) => c.view.game.phase === 'gameover', 'partie finie');
  r = await api('GET', '/api/leaderboard');
  eq(r.json.players.map((p) => p.games), [1, 1, 1], 'chaque compte a une partie comptée');
  const o = E.outcomeOf(entry.room);
  eq(r.json.players.reduce((s, p) => s + p.wins, 0), o.players.filter((p) => p.won).length, 'les victoires correspondent à l\'issue de la partie');
  ok(r.json.players[0].rank === 1 && r.json.players.every((p, i, a) => i === 0 || a[i - 1].wins >= p.wins), 'classement trié par victoires');
  srv.touch(host.code); srv.touch(host.code);
  eq((await api('GET', '/api/leaderboard')).json.players.map((p) => p.games), [1, 1, 1], 'une partie n\'est jamais comptée deux fois');

  // redémarrage : toujours pas de double comptage, comptes et sessions conservés
  srv.flush();
  for (const c of [host, c1, c2, dup, bad]) c.close();
  await srv.close();
  const again = await start({ accountsFile, dataFile });
  for (const code of again.srv.rooms.keys()) again.srv.touch(code);
  r = await rawHttp(again.port, 'GET', '/api/leaderboard');
  eq(r.json.players.map((p) => p.games), [1, 1, 1], 'après redémarrage, la partie n\'est pas recomptée');
  r = await rawHttp(again.port, 'GET', '/api/me', { headers: auth(alice.token) });
  eq(r.status, 200, 'la session survit au redémarrage');

  // suppression du compte
  r = await rawHttp(again.port, 'DELETE', '/api/account', { body: { password: 'faux-mot-de-passe' }, headers: auth(alice.token) });
  eq(r.status, 403, 'suppression : mot de passe vérifié');
  r = await rawHttp(again.port, 'DELETE', '/api/account', { body: { password: PW }, headers: auth(alice.token) });
  eq(r.status, 204, 'compte supprimé');
  eq((await rawHttp(again.port, 'GET', '/api/me', { headers: auth(alice.token) })).status, 401, 'ses sessions sont supprimées');
  eq((await rawHttp(again.port, 'POST', '/api/login', { body: { pseudo: 'Alice', password: PW } })).status, 401, 'il n\'est plus possible de se connecter');
  eq((await rawHttp(again.port, 'GET', '/api/leaderboard')).json.players.length, 2, 'il disparaît du classement');
  eq((await rawHttp(again.port, 'POST', '/api/logout', { headers: auth(bob.token) })).status, 204, 'déconnexion');
  eq((await rawHttp(again.port, 'GET', '/api/me', { headers: auth(bob.token) })).status, 401, 'jeton révoqué après déconnexion');
  await again.srv.close();
}

{
  // comptes : sessions expirées et classement (unités)
  let t = 0;
  const acc = createAccounts({ now: () => t });
  const a = await acc.register('Zoé', 'motdepasse1'); const b = await acc.register('Yann', 'motdepasse2');
  for (let i = 0; i < 3; i++) acc.record(a.account.id, i < 1); // Zoé : 3 parties, 1 victoire
  for (let i = 0; i < 2; i++) acc.record(b.account.id, true);  // Yann : 2 parties, 2 victoires
  eq(acc.leaderboard().map((p) => p.pseudo), ['Yann', 'Zoé'], 'classement : victoires d\'abord');
  eq(acc.leaderboard(1).length, 1, 'limite respectée');
  t = 91 * 24 * 3600 * 1000;
  eq(acc.resolve(a.token), null, 'session expirée après 90 jours');
}

/* =========================================================== serveur : surveillance (journaux, /stats, /metrics) =========================================================== */

{
  const lines = [];
  const { srv, port, url } = await start({ adminToken: 'admin-secret', logger: { level: 'debug', sink: (l) => lines.push(l) }, limits: { roomsPer10Min: 1 } });
  const host = await new Client(url, 'H').connect();
  host.send({ t: 'create', name: 'Alice', password: 'sésame-secret' });
  await host.until((c) => c.view, 'salle');
  const h2 = await new Client(url, 'H2').connect();
  h2.send({ t: 'create', name: 'Pirate' });
  await h2.nextError('limite');

  eq((await rawHttp(port, 'GET', '/stats')).status, 401, '/stats exige le jeton d\'administration');
  eq((await rawHttp(port, 'GET', '/stats', { headers: { authorization: 'Bearer mauvais' } })).status, 401, 'mauvais jeton : refusé');
  let r = await rawHttp(port, 'GET', '/stats', { headers: { authorization: 'Bearer admin-secret' } });
  ok(r.status === 200 && r.json.gauges.rooms === 1 && r.json.gauges.seats_connected >= 1 && r.json.counters.rooms_created === 1, '/stats : jauges et compteurs');
  ok(r.json.counters.rate_limited >= 1 && r.json.gauges.rss_bytes > 0 && typeof r.json.gauges.uptime_seconds === 'number', 'refus comptés, mémoire et durée de fonctionnement indiquées');
  r = await rawHttp(port, 'GET', '/metrics', { headers: { authorization: 'Bearer admin-secret' } });
  ok(r.status === 200 && /^mythomytho_rooms 1$/m.test(r.text) && /^mythomytho_rooms_created_total 1$/m.test(r.text) && /# TYPE mythomytho_rooms gauge/.test(r.text), '/metrics au format Prometheus');
  const health = await rawHttp(port, 'GET', '/health');
  ok(health.status === 200 && health.json.ok === true && !('counters' in health.json), '/health reste public et minimal');

  const parsed = lines.map((l) => JSON.parse(l));
  ok(parsed.every((p) => p.ts && p.level && p.event), 'chaque ligne de journal est du JSON avec ts, level, event');
  ok(parsed.some((p) => p.event === 'room_created' && p.protected === true) && parsed.some((p) => p.event === 'rooms_rate_limited' && p.ip), 'événements utiles journalisés');
  const all = lines.join('\n');
  ok(!all.includes('sésame') && !all.includes(host.token), 'ni mot de passe ni jeton dans les journaux');
  host.close(); h2.close(); await srv.close();

  const open = await start();
  eq((await rawHttp(open.port, 'GET', '/stats')).status, 404, 'sans jeton d\'administration configuré, /stats n\'existe pas');
  await open.srv.close();
}

console.log(`\n✔ ${stats.checks} vérifications réussies — modération, limites, comptes, notifications, chat, surveillance OK`);
process.exit(0);
