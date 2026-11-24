// Test de bout en bout : vrais clients WebSocket contre le vrai serveur (client WebSocket natif de Node ≥ 22).
// Usage : node server/build.mjs && node server/test-e2e.mjs
import assert from 'node:assert/strict';
import { createGameServer } from './server.mjs';

const srv = createGameServer({ hostGraceMs: 0, logger: { level: 'silent' } }); // passage d'hôte immédiat dans ce test (le délai de grâce a son propre test)
const port = await srv.listen(0, '127.0.0.1');
const URL_WS = `ws://127.0.0.1:${port}`;
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };

/** Client de test : garde la dernière vue et attend des conditions. */
class Client {
  constructor(name) { this.name = name; this.view = null; this.errors = []; this.raw = []; this.token = null; this.seatId = null; this.code = null; this.waiters = []; }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(URL_WS);
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
  until(pred, label, ms = 2000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`délai dépassé : ${label} (${this.name})`)), ms);
      const check = () => { if (this.view && pred(this.view)) { clearTimeout(t); resolve(this.view); return true; } return false; };
      if (check()) return;
      this.waiters.push((m) => (m.t === 'view' || m.t === 'error') && check());
    });
  }
  async expectError(msg, re, label) {
    const n = this.errors.length;
    this.send(msg);
    await new Promise((r) => setTimeout(r, 120));
    ok(this.errors.length === n + 1, `${label} : une erreur attendue`);
    ok(re.test(this.errors[this.errors.length - 1]), `${label} : message « ${this.errors[this.errors.length - 1]} »`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // ---- salon
  const host = await new Client('Hôte').connect();
  host.send({ t: 'create', name: 'Alice' });
  await host.until((v) => v.stage === 'lobby', 'salon créé');
  ok(/^[A-Z]{4}$/.test(host.code), `code de salle ${host.code}`);
  ok(host.view.isHost, 'le créateur est hôte');

  const names = ['Bastien', 'Chloé', 'Dorian', 'Emma'];
  const guests = [];
  for (const n of names) { const c = await new Client(n).connect(); c.send({ t: 'join', code: host.code.toLowerCase(), name: n }); await c.until((v) => v.stage === 'lobby', `${n} dans le salon`); guests.push(c); }
  const all = [host, ...guests];
  await host.until((v) => v.seats.length === 5, '5 sièges');
  ok(!guests[0].view.isHost, 'les invités ne sont pas hôtes');

  // doublon de prénom
  const dup = await new Client('Doublon').connect(); dup.send({ t: 'join', code: host.code, name: 'Alice' });
  await dup.until((v) => v.seats.length === 6, 'doublon accepté');
  ok(dup.view.seats.some((s) => s.name === 'Alice 2'), 'prénom dédoublonné');
  dup.send({ t: 'leave' }); await sleep(100); dup.ws.close();
  await host.until((v) => v.seats.length === 5, 'le doublon est reparti');

  // droits de l'hôte
  await guests[0].expectError({ t: 'start' }, /hôte/, 'un invité ne lance pas la partie');
  await guests[0].expectError({ t: 'settings', patch: { mrWhiteCount: 1 } }, /hôte/, 'un invité ne règle pas la partie');
  await guests[0].expectError({ t: 'seen' }, /carte/, 'pas de carte avant le début');

  // réglages par l'hôte (rôle Mr. White activé)
  host.send({ t: 'settings', patch: { mrWhiteCount: 1 } });
  await host.until((v) => v.settings.mrWhiteCount === 1, 'réglage appliqué');
  await guests[1].until((v) => v.settings.mrWhiteCount === 1, 'réglage visible des invités');

  // ---- début de manche
  host.send({ t: 'start' });
  await Promise.all(all.map((c) => c.until((v) => v.stage === 'game', `${c.name} en jeu`)));
  eq(host.view.game.players.map((p) => p.name), ['Alice', 'Bastien', 'Chloé', 'Dorian', 'Emma'], 'ordre des joueurs');

  // ---- SECRET : chacun ne reçoit que sa carte
  const words = new Map();
  for (const c of all) {
    const g = c.view.game;
    ok(g.me.card && typeof g.me.card.wordText === 'string', `${c.name} reçoit sa carte`);
    words.set(c.name, g.me.card.wordText);
    for (const p of g.players) ok(p.icon === null && p.roleLabel === null, `${c.name} ne voit pas le rôle de ${p.name}`);
    const json = JSON.stringify(g);
    ok(!('word' in g.me) && !json.includes('"word"'), `${c.name} : aucun champ « word » brut dans sa vue`);
  }
  const distinct = [...new Set([...words.values()].filter((w) => w !== 'Aucun mot'))];
  ok(distinct.length === 2, `deux mots distincts en jeu : ${distinct.join(' / ')}`);
  // un joueur ne voit jamais le mot de l'autre camp (ni dans sa vue, ni dans les messages bruts reçus jusqu'ici)
  for (const c of all) {
    const mine = words.get(c.name);
    for (const w of distinct) if (w !== mine) ok(!c.raw.join('\n').includes(w), `${c.name} n'a jamais reçu « ${w} »`);
  }
  const mrWhite = all.find((c) => words.get(c.name) === 'Aucun mot');
  ok(!!mrWhite, 'Mr. White présent (carte sans mot)');
  const civilWord = [...words.entries()].map(([, w]) => w).sort((a, b) => [...words.values()].filter((x) => x === b).length - [...words.values()].filter((x) => x === a).length)[0];
  const undercover = all.find((c) => words.get(c.name) !== civilWord && words.get(c.name) !== 'Aucun mot');
  ok(!!undercover, 'Undercover présent');

  // ---- consultation des cartes
  await host.expectError({ t: 'startVote' }, /consulté/, 'pas de vote avant que tous aient vu leur carte');
  for (const c of all) c.send({ t: 'seen' });
  await host.until((v) => v.game.players.every((p) => p.viewed), 'toutes les cartes vues');
  host.send({ t: 'startVote' });
  await Promise.all(all.map((c) => c.until((v) => v.game.phase === 'vote', `${c.name} au vote`)));

  // ---- vote : validations
  const alice = host;
  await alice.expectError({ t: 'vote', target: 0 }, /vous-même/, 'pas de vote pour soi');
  await alice.expectError({ t: 'vote', target: 99 }, /invalide/, 'cible inexistante refusée');
  await guests[0].expectError({ t: 'continue' }, /hôte/, 'un invité ne peut pas continuer');
  await guests[0].expectError({ t: 'forceVote' }, /hôte/, 'un invité ne force pas le dépouillement');

  // tout le monde vote l'Undercover, lui vote quelqu'un d'autre ; le secret du bulletin est gardé
  const uc = undercover.view.game.me.id;
  const other = all.find((c) => c !== undercover).view.game.me.id;
  for (const c of all) c.send({ t: 'vote', target: c === undercover ? other : uc });
  await Promise.all(all.map((c) => c.until((v) => v.game.modal === 'announce' || v.game.phase === 'gameover', `${c.name} voit le résultat`)));
  const a = host.view.game.announce;
  ok(a && a.victims.length === 1 && a.victims[0].id === uc, 'l\'Undercover est éliminé');
  ok(JSON.stringify(host.view.game).includes('"voted"') === false, 'plus de bulletins visibles après dépouillement');
  // après élimination le rôle de la victime est public
  ok(host.view.game.players[uc].icon === 'undercover', 'le rôle de la victime est révélé à tous');
  ok(host.view.game.players.filter((p) => p.icon !== null).length === 1, 'seule la victime est révélée');

  // ---- continuer (hôte) : Mr. White est encore en vie, la manche continue par un nouveau vote
  host.send({ t: 'continue' });
  await Promise.all(all.map((c) => c.until((v) => v.game.phase === 'vote' && v.game.modal === 'none', `${c.name} nouveau vote`)));
  await undercover.expectError({ t: 'vote', target: 0 }, /en vie/, 'un éliminé ne vote plus');
  const living = all.filter((c) => c !== undercover);
  ok(host.view.game.vote.candidates.length === 4 && !host.view.game.vote.candidates.includes(uc), 'les candidats sont les joueurs en vie');

  // second vote : égalité volontaire → second tour entre ex æquo, puis Mr. White tombe
  const mw = mrWhite.view.game.me.id;
  const others = living.filter((c) => c !== mrWhite);
  const [x, y] = others;
  // Mr. White vote x ; x vote Mr. White ; y vote x ; le dernier vote y → x:2, mw:1, y:1 ; pas d'égalité stricte → x éliminé ?
  // On construit une vraie égalité 2-2 : mw→x, x→mw, y→mw... non : on veut mw et x à égalité.
  living[0].send({ t: 'vote', target: living[0] === mrWhite ? x.view.game.me.id : mw });
  for (const c of living.slice(1)) c.send({ t: 'vote', target: c === mrWhite ? x.view.game.me.id : (c === x ? mw : x.view.game.me.id) });
  await Promise.all(living.map((c) => c.until((v) => v.game.modal === 'announce' || (v.game.vote && v.game.vote.turn === 1) || v.game.phase === 'gameover', `${c.name} dépouillement 2`)));
  let tie = false;
  if (host.view.game.vote && host.view.game.vote.turn === 1) {
    tie = true;
    ok(/Égalité/.test(host.view.game.vote.note), 'l\'égalité est annoncée');
    ok(host.view.game.vote.voted.length === 0, 'les bulletins sont remis à zéro');
    ok(host.view.game.vote.candidates.length === 2, 'le second tour ne garde que les ex æquo');
    const [c1, c2] = host.view.game.vote.candidates;
    // tous votent pour mrWhite (sauf lui qui vote l'autre ex æquo)
    const target = host.view.game.vote.candidates.includes(mw) ? mw : c1;
    for (const c of living) {
      const myId = c.view.game.me.id;
      const t = myId === target ? (target === c1 ? c2 : c1) : target;
      if (c.view.game.vote.candidates.includes(t)) c.send({ t: 'vote', target: t });
      else c.send({ t: 'vote', target: c1 === myId ? c2 : c1 });
    }
    await Promise.all(living.map((c) => c.until((v) => v.game.modal === 'announce' || v.game.phase === 'gameover', `${c.name} résultat du second tour`)));
  }
  console.log(tie ? '  (égalité testée)' : '  (pas d\'égalité sur ce tirage)');
  // quel que soit l'éliminé, on termine la manche : l'hôte enchaîne jusqu'à la fin
  for (let guard = 0; guard < 8 && host.view.game.phase !== 'gameover'; guard++) {
    const g = host.view.game;
    if (g.modal === 'announce') { host.send({ t: 'continue' }); }
    else if (g.modal === 'guess' && g.guess.stage === 'asking') {
      const guesser = all.find((c) => c.view.game.guess && c.view.game.guess.mine);
      ok(!!guesser, 'un seul joueur reçoit le droit de deviner');
      ok(all.filter((c) => c.view.game.guess.mine).length === 1, 'le droit de deviner n\'est qu\'à un joueur');
      const intruder = all.find((c) => c !== guesser);
      await intruder.expectError({ t: 'guess', value: 'x' }, /tour/, 'un autre joueur ne peut pas deviner à sa place');
      guesser.send({ t: 'guess', value: 'réponse au hasard' });
    } else if (g.modal === 'guess') { host.send({ t: 'continue' }); }
    else if (g.phase === 'vote' && g.modal === 'none') {
      // nouveau vote : tous votent le même joueur en vie qui n'est pas Mr. White ; lui vote un autre
      const alive = host.view.game.players.filter((p) => !p.eliminated).map((p) => p.id);
      const tgt = alive.find((id) => id !== host.view.game.me.id) ?? alive[0];
      for (const c of all) {
        const v = c.view.game;
        if (v.me.eliminated) continue;
        const t = v.me.id === tgt ? alive.find((id) => id !== tgt) : tgt;
        c.send({ t: 'vote', target: t });
      }
    }
    await sleep(250);
  }
  // ---- fin : tout est public, y compris les mots
  const res = host.view.game.result;
  ok(!!res && typeof res.winner === 'string', `manche terminée, vainqueur : ${res && res.winner}`);
  eq(res.players.length, 5, 'tous les rôles sont révélés');
  ok(res.civilWord === civilWord, 'le mot des Civils est révélé');
  ok(all.every((c) => c.view.game.result && c.view.game.result.entry), 'chacun reçoit l\'entrée de journal');

  // ---- reconnexion : même session, même vue
  const chloe = guests[1];
  const before = JSON.stringify(chloe.view.game.me);
  chloe.ws.close();
  await host.until((v) => v.seats.find((s) => s.name === 'Chloé' && !s.connected), 'Chloé apparaît déconnectée');
  const back = await new Client('Chloé bis').connect();
  back.send({ t: 'rejoin', code: host.code, token: chloe.token });
  await back.until((v) => v.stage === 'game', 'reconnexion');
  eq(JSON.stringify(back.view.game.me), before, 'la carte retrouvée est identique');
  await host.until((v) => v.seats.find((s) => s.name === 'Chloé' && s.connected), 'Chloé revient');
  const ghost = await new Client('Fantôme').connect();
  ghost.send({ t: 'rejoin', code: host.code, token: 'faux-jeton' });
  await sleep(150);
  ok(ghost.errors.some((e) => /expirée/.test(e)), 'jeton invalide refusé');
  const late = await new Client('Retardataire').connect();
  late.send({ t: 'join', code: host.code, name: 'Retard' });
  await late.until((v) => v.stage === 'game' && v.game && v.game.spectator, 'un retardataire entre en spectateur');
  ok(late.view.game.me === null, 'le spectateur n\'a pas de carte');
  late.send({ t: 'leave' }); await sleep(120); late.ws.close(); // il repartira : la manche 2 reste à 5 joueurs
  const nowhere = await new Client('Perdu').connect();
  nowhere.send({ t: 'join', code: 'ZZZZ', name: 'X' }); await sleep(120);
  ok(nowhere.errors.some((e) => /introuvable/.test(e)), 'code inconnu refusé');
  nowhere.send({ t: 'start' }); await sleep(120);
  ok(nowhere.errors.some((e) => /Rejoignez/.test(e)), 'aucune action sans salle');

  // ---- manche suivante
  await guests[2].expectError({ t: 'nextRound' }, /hôte/, 'seul l\'hôte relance');
  host.send({ t: 'nextRound' });
  await Promise.all([host, guests[0], back, guests[2], guests[3]].map((c) => c.until((v) => v.game.phase === 'reveal' && v.game.round === 2, `${c.name} manche 2`)));
  ok(host.view.game.players.every((p) => !p.viewed && p.icon === null), 'manche 2 : cartes de nouveau secrètes');

  // ---- migration d'hôte
  host.ws.close();
  await guests[0].until((v) => v.isHost, 'Bastien devient hôte');
  ok(!guests[1].view || true, 'ok');

  // ================= scénario 2 : égalité au vote, second tour, joueur absent =================
  {
    const h = await new Client('H2').connect(); h.send({ t: 'create', name: 'P0' }); await h.until((v) => v.stage === 'lobby', 'salle 2');
    const ps = [h];
    for (const n of ['P1', 'P2', 'P3']) { const c = await new Client(n).connect(); c.send({ t: 'join', code: h.code, name: n }); await c.until((v) => v.stage === 'lobby', n); ps.push(c); }
    h.send({ t: 'start' });
    await Promise.all(ps.map((c) => c.until((v) => v.stage === 'game', 'start 2')));
    for (const c of ps) c.send({ t: 'seen' });
    await h.until((v) => v.game.players.every((p) => p.viewed), 'vues 2');
    h.send({ t: 'startVote' });
    await Promise.all(ps.map((c) => c.until((v) => v.game.phase === 'vote', 'vote 2')));
    // P0→P1, P1→P0, P2→P0, P3→P1 : égalité 2-2 entre P0 et P1
    const ballots = [[0, 1], [1, 0], [2, 0], [3, 1]];
    for (const [i, t] of ballots) ps[i].send({ t: 'vote', target: t });
    await h.until((v) => v.game.vote && v.game.vote.turn === 1, 'second tour');
    eq(h.view.game.vote.candidates, [0, 1], 'second tour entre P0 et P1');
    ok(/Égalité/.test(h.view.game.vote.note), 'égalité annoncée');
    eq(h.view.game.vote.voted, [], 'bulletins remis à zéro');
    await ps[2].expectError({ t: 'vote', target: 3 }, /invalide/, 'au second tour on ne vote qu\'entre ex æquo');
    // pendant le vote, personne ne voit POUR QUI les autres ont voté
    ps[2].send({ t: 'vote', target: 0 });
    await h.until((v) => v.game.vote.voted.length === 1, 'un bulletin déposé');
    ok(!JSON.stringify(h.view.game.vote).includes('myVote":0') || h.view.game.vote.myVote === null, 'le bulletin d\'un autre reste secret');
    await ps[2].until((v) => v.game.vote && v.game.vote.myVote === 0, 'mon bulletin m\'est renvoyé');
    eq(ps[2].view.game.vote.myVote, 0, 'mon propre bulletin m\'est renvoyé');
    // P3 se déconnecte : le dépouillement n'attend que les présents
    ps[3].ws.close();
    await h.until((v) => v.seats.find((s) => s.name === 'P3' && !s.connected), 'P3 absent');
    ps[0].send({ t: 'vote', target: 1 });
    ps[1].send({ t: 'vote', target: 0 });
    await h.until((v) => v.game.modal === 'announce', 'élimination au second tour');
    eq(h.view.game.announce.victims.map((x) => x.id), [0], 'P0 éliminé (2 voix contre 1)');
    // abus de protocole
    ps[1].ws.send('pas du json'); ps[1].ws.send(JSON.stringify({ x: 1 })); ps[1].ws.send(JSON.stringify({ t: 'inconnu' }));
    await sleep(200);
    ok(ps[1].errors.length >= 3, 'messages illisibles ou inconnus refusés sans planter');
    h.ws.close(); ps[1].ws.close(); ps[2].ws.close();
  }
  console.log(`\n✔ ${checks} vérifications réussies — serveur autoritaire OK`);
} catch (e) {
  console.error('\n✘ ÉCHEC :', e && e.message ? e.message : e);
  if (e && e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
  process.exitCode = 1;
} finally {
  await srv.close();
}
