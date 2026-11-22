import {
  CUSTOM_THEME_KEY, MAX_PLAYERS, MIN_PLAYERS, ROLE_NAMES, assignRound, baseRoleKey, buildScoreEntry, defaultSettings, describeCard, describeWarning,
  gameOverText, pickWordPair, playerWon, sanitizeCustomPairs, sanitizeSettings, type GameSettings, type Player, type UsedPairs, type WordPair, type WordTheme,
} from '@/domain';
import { cardIcon, secretCardIcon } from '@/features/roleMeta';
import { alive, gameReducer, initialGameState, playerOf, type GameAction, type GameState } from '@/state/gameReducer';
import { PROTOCOL_VERSION, type ClientMsg, type GameView, type PlayerView, type PublicPlayer, type ResultPlayer } from './protocol';

/**
 * Moteur d'une salle : TypeScript pur, sans horloge ni réseau (l'heure et les jetons arrivent par `Deps`), donc testable
 * et exécutable tel quel sur le serveur. Toute la partie vit ici ; les clients n'en reçoivent que des vues filtrées.
 */

export interface Seat { readonly id: number; readonly name: string; readonly token: string; readonly connected: boolean }

export interface RoomState {
  readonly code: string;
  readonly hostId: number;
  readonly seats: readonly Seat[];
  readonly nextSeatId: number;
  readonly settings: GameSettings;
  readonly game: GameState;
  /** Sièges dans l'ordre des joueurs de la manche : l'indice est l'identifiant du joueur dans `game`. */
  readonly roster: readonly number[];
  readonly round: number;
  readonly used: UsedPairs;
  /** Bulletins en cours : électeur (joueur) → cible (joueur). */
  readonly ballots: Readonly<Record<number, number>>;
  readonly voteTurn: number;
  readonly restrictTo: readonly number[] | null;
  readonly tieNote: string | null;
  readonly timerEndsAt: number | null;
  readonly timerTotalSec: number;
  /** Le serveur a constaté la fin du minuteur (voir `tick`). */
  readonly timerOver: boolean;
  /** Paires personnalisées de l'hôte (thème « Mes paires » de la salle). */
  readonly customPairs: readonly WordPair[];
  readonly notices: readonly string[];
}

export interface Deps {
  readonly now: number;
  readonly token: () => string;
  readonly themes: readonly WordTheme[];
  readonly missions: Parameters<typeof assignRound>[0]['missions'];
}

export type Outcome = { readonly room: RoomState; readonly error?: undefined } | { readonly room: RoomState; readonly error: string };

const ok = (room: RoomState): Outcome => ({ room });
const fail = (room: RoomState, error: string): Outcome => ({ room, error });

export const MAX_NAME = 16;

function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return s.slice(0, MAX_NAME);
}

function uniqueName(seats: readonly Seat[], wanted: string): string {
  const base = wanted || 'Joueur';
  const taken = new Set(seats.map((s) => s.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 100; i++) {
    const cand = `${base.slice(0, MAX_NAME - 3)} ${i}`;
    if (!taken.has(cand.toLowerCase())) return cand;
  }
  return `${base.slice(0, 10)} ${Date.now() % 1000}`;
}

/* ------------------------------------------------------------------ salle & sièges */

export function createRoom(code: string, hostName: string, deps: Deps): { room: RoomState; seatId: number; token: string } {
  const token = deps.token();
  const name = cleanName(hostName) || 'Hôte';
  const room: RoomState = {
    code, hostId: 0, seats: [{ id: 0, name, token, connected: true }], nextSeatId: 1,
    settings: defaultSettings, game: initialGameState, roster: [], round: 1, used: {}, ballots: {}, voteTurn: 0, restrictTo: null,
    tieNote: null, timerEndsAt: null, timerTotalSec: 0, timerOver: false, customPairs: [], notices: [],
  };
  return { room, seatId: 0, token };
}

/** En cours de manche, un nouvel arrivant devient spectateur : il regarde et joue à partir de la manche suivante. */
export function joinRoom(room: RoomState, rawName: string, deps: Deps): { room: RoomState; seatId: number; token: string } | { error: string } {
  if (room.seats.length >= MAX_PLAYERS) return { error: `Salle pleine (${MAX_PLAYERS} joueurs).` };
  const name = uniqueName(room.seats, cleanName(rawName));
  const token = deps.token();
  const seat: Seat = { id: room.nextSeatId, name, token, connected: true };
  return { room: { ...room, seats: [...room.seats, seat], nextSeatId: room.nextSeatId + 1 }, seatId: seat.id, token };
}

export function findSeatByToken(room: RoomState, token: string): Seat | undefined {
  return room.seats.find((s) => s.token === token);
}

/**
 * Marque un siège (dé)connecté. Par défaut, si l'hôte part, le premier joueur connecté reprend tout de suite le rôle d'hôte.
 * Avec `keepHost`, l'hôte garde son rôle (le serveur laisse un délai de grâce, puis appelle `electHost`).
 */
export function setConnected(room: RoomState, seatId: number, connected: boolean, keepHost = false): RoomState {
  const seats = room.seats.map((s) => (s.id === seatId ? { ...s, connected } : s));
  let hostId = room.hostId;
  const host = seats.find((s) => s.id === hostId);
  if (!keepHost && (!host || !host.connected)) hostId = seats.find((s) => s.connected)?.id ?? hostId;
  const next: RoomState = { ...room, seats, hostId };
  // Un joueur qui part ne doit pas bloquer un vote déjà complet côté présents.
  return next.game.active && next.game.phase === 'vote' && next.game.modal === 'none' ? maybeTally(next).room : next;
}

/** Passe la main au premier joueur connecté si l'hôte est absent (les joueurs de la manche passent avant les spectateurs). */
export function electHost(room: RoomState): RoomState {
  const host = room.seats.find((s) => s.id === room.hostId);
  if (host && host.connected) return room;
  const live = room.seats.filter((s) => s.connected);
  const next = live.find((s) => room.roster.includes(s.id)) ?? live[0];
  return next ? { ...room, hostId: next.id } : room;
}

function removeSeat(room: RoomState, seatId: number): RoomState {
  const seats = room.seats.filter((s) => s.id !== seatId);
  let hostId = room.hostId;
  if (hostId === seatId) hostId = seats.find((s) => s.connected)?.id ?? seats[0]?.id ?? hostId;
  return { ...room, seats, hostId };
}

/* ------------------------------------------------------------------ utilitaires de manche */

const playerIdOf = (room: RoomState, seatId: number): number => room.roster.indexOf(seatId);
const seatIdOf = (room: RoomState, playerId: number): number | undefined => room.roster[playerId];
const isConnected = (room: RoomState, playerId: number): boolean => {
  const sid = seatIdOf(room, playerId);
  return room.seats.some((s) => s.id === sid && s.connected);
};

function act(room: RoomState, action: GameAction): RoomState {
  return { ...room, game: gameReducer(room.game, action) };
}

const allViewed = (g: GameState): boolean => g.players.length > 0 && g.players.every((p) => p.viewed);

/** Thèmes de la salle : ceux du jeu + « Mes paires » de l'hôte quand il en a envoyé. */
function themesOf(room: RoomState, deps: Deps): readonly WordTheme[] {
  return room.customPairs.length > 0
    ? [...deps.themes, { key: CUSTOM_THEME_KEY, label: 'Mes paires', desc: 'Paires personnalisées de l\'hôte', pairs: room.customPairs, custom: true }]
    : deps.themes;
}

function launch(room: RoomState, round: number, deps: Deps): Outcome {
  // Joueurs de la manche = sièges connectés. Un absent ne bloque ni les cartes ni le vote ; à son retour il regarde, puis joue à la manche suivante.
  // Un spectateur parti sans jamais jouer ne garde pas son siège.
  const kept = room.seats.filter((s) => s.connected || room.roster.includes(s.id));
  const players = kept.filter((s) => s.connected);
  if (players.length < MIN_PLAYERS) return fail(room, `Il faut au moins ${MIN_PLAYERS} joueurs connectés.`);
  const names = players.map((s) => s.name);
  const settings = sanitizeSettings({ ...room.settings, playerCount: names.length });
  const themes = themesOf(room, deps);
  const selected = Object.keys(settings.selectedThemes).filter((k) => themes.some((t) => t.key === k));
  const draw = pickWordPair({ themes, selectedKeys: selected, difficulty: settings.difficulty, used: room.used });
  if (!draw) return fail(room, 'Aucune paire de mots disponible.');
  const assign = assignRound({
    names, undercoverCount: settings.undercoverCount, mrWhiteCount: settings.mrWhiteCount, espionCount: settings.espionCount,
    roles: settings.roles, pair: draw.pair, missions: deps.missions,
  });
  const notices = [...draw.notices];
  const w = assign.warnings[0];
  if (w) notices.push(describeWarning(w));
  const game = gameReducer(initialGameState, { type: 'START', round, assign, pair: draw.pair });
  return ok({
    ...room, seats: kept, settings, game, round, used: draw.used, roster: players.map((s) => s.id),
    ballots: {}, voteTurn: 0, restrictTo: null, tieNote: null, timerEndsAt: null, timerTotalSec: 0, timerOver: false, notices,
  });
}

/* ------------------------------------------------------------------ vote */

function candidates(room: RoomState): number[] {
  const living = alive(room.game).map((p) => p.id);
  return room.restrictTo ? room.restrictTo.filter((id) => living.includes(id)) : living;
}

/** Dépouille quand tous les électeurs présents ont voté. Égalité : second tour entre ex æquo, puis tirage au sort. */
function maybeTally(room: RoomState, force = false): Outcome {
  const voters = alive(room.game).filter((p) => isConnected(room, p.id)).map((p) => p.id);
  const cast = Object.keys(room.ballots).map(Number).filter((v) => voters.includes(v));
  if (cast.length === 0) return force ? fail(room, 'Personne n\'a encore voté.') : ok(room);
  if (!force && cast.length < voters.length) return ok(room);

  const counts = new Map<number, number>();
  for (const v of cast) { const t = room.ballots[v]; if (t !== undefined) counts.set(t, (counts.get(t) ?? 0) + 1); }
  const top = Math.max(...counts.values());
  const leaders = [...counts.entries()].filter(([, c]) => c === top).map(([id]) => id).sort((a, b) => a - b);

  let chosen: number;
  let note: string | null = null;
  if (leaders.length === 1) {
    chosen = leaders[0] as number;
  } else if (room.voteTurn === 0 && leaders.length < candidates(room).length) {
    const names = leaders.map((id) => playerOf(room.game, id)?.name ?? '?').join(', ');
    return ok({ ...room, ballots: {}, voteTurn: 1, restrictTo: leaders, tieNote: `Égalité entre ${names} : nouveau vote entre eux.` });
  } else {
    chosen = leaders[Math.floor(Math.random() * leaders.length)] as number;
    note = 'Égalité persistante : le sort a désigné le joueur éliminé.';
  }
  const next = act(act(room, { type: 'ASK_ELIMINATE', id: chosen }), { type: 'CONFIRM_ELIMINATE' });
  return ok({ ...next, ballots: {}, voteTurn: 0, restrictTo: null, tieNote: note });
}

/* ------------------------------------------------------------------ messages */

const isHost = (room: RoomState, seatId: number): boolean => room.hostId === seatId;

export function handle(room: RoomState, seatId: number, msg: ClientMsg, deps: Deps): Outcome {
  const g = room.game;
  const me = playerIdOf(room, seatId);
  const host = isHost(room, seatId);
  const needHost = (): Outcome | null => (host ? null : fail(room, 'Seul l\'hôte peut faire cela.'));

  switch (msg.t) {
    case 'ping': return ok(room);

    case 'settings': {
      const h = needHost(); if (h) return h;
      if (g.active) return fail(room, 'Les réglages se modifient dans le salon.');
      if (!msg.patch || typeof msg.patch !== 'object') return fail(room, 'Réglages invalides.');
      const settings = sanitizeSettings({ ...room.settings, ...msg.patch, playerCount: room.seats.length });
      return ok({ ...room, settings });
    }

    case 'kick': {
      const h = needHost(); if (h) return h;
      if (g.active && room.roster.includes(msg.seatId)) return fail(room, 'On ne retire pas un joueur en cours de manche.');
      if (msg.seatId === room.hostId || !room.seats.some((s) => s.id === msg.seatId)) return fail(room, 'Joueur introuvable.');
      return ok(removeSeat(room, msg.seatId));
    }

    case 'promote': {
      const h = needHost(); if (h) return h;
      const target = room.seats.find((s) => s.id === msg.seatId);
      if (!target || target.id === room.hostId) return fail(room, 'Joueur introuvable.');
      if (!target.connected) return fail(room, 'Ce joueur est hors ligne.');
      return ok({ ...room, hostId: target.id });
    }

    case 'pairs': {
      const h = needHost(); if (h) return h;
      if (g.active) return fail(room, 'Les paires se modifient dans le salon.');
      return ok({ ...room, customPairs: sanitizeCustomPairs(msg.pairs) });
    }

    case 'leave': {
      // Hors manche, ou spectateur : le siège disparaît. Un joueur en pleine manche garde sa place (il peut revenir).
      if (!g.active || me < 0) return ok(removeSeat(room, seatId));
      return ok(setConnected(room, seatId, false));
    }

    case 'start': {
      const h = needHost(); if (h) return h;
      if (g.active) return fail(room, 'La partie a déjà commencé.');
      return launch(room, 1, deps);
    }

    case 'seen': {
      if (!g.active || g.phase !== 'reveal' || me < 0) return fail(room, 'Pas de carte à consulter.');
      const p = playerOf(g, me);
      if (!p || p.viewed) return ok(room);
      let next = act(act(room, { type: 'OPEN_CARD', id: me }), { type: 'CLOSE_CARD' });
      if (allViewed(next.game) && next.settings.timerEnabled && next.timerEndsAt === null) {
        const total = next.settings.timerDurationMin * 60;
        next = { ...next, timerEndsAt: deps.now + total * 1000, timerTotalSec: total };
      }
      return ok(next);
    }

    case 'startVote': {
      const h = needHost(); if (h) return h;
      if (g.phase !== 'reveal' || !allViewed(g)) return fail(room, 'Tous les joueurs doivent avoir consulté leur carte.');
      return ok({ ...act(room, { type: 'START_VOTE' }), timerEndsAt: null, timerOver: false, ballots: {}, voteTurn: 0, restrictTo: null, tieNote: null });
    }

    case 'extend': {
      const h = needHost(); if (h) return h;
      if (room.timerEndsAt === null) return fail(room, 'Aucun minuteur en cours.');
      return ok({ ...room, timerEndsAt: Math.max(room.timerEndsAt, deps.now) + 60000, timerTotalSec: room.timerTotalSec + 60, timerOver: false });
    }

    case 'vote': {
      if (g.phase !== 'vote' || g.modal !== 'none') return fail(room, 'Le vote n\'est pas ouvert.');
      const voter = playerOf(g, me);
      if (!voter || voter.eliminated) return fail(room, 'Seuls les joueurs en vie votent.');
      if (!Number.isInteger(msg.target) || !candidates(room).includes(msg.target)) return fail(room, 'Cible invalide.');
      if (msg.target === me) return fail(room, 'Vous ne pouvez pas voter pour vous-même.');
      return maybeTally({ ...room, ballots: { ...room.ballots, [me]: msg.target } });
    }

    case 'forceVote': {
      const h = needHost(); if (h) return h;
      if (g.phase !== 'vote' || g.modal !== 'none') return fail(room, 'Le vote n\'est pas ouvert.');
      return maybeTally(room, true);
    }

    case 'continue': {
      const h = needHost(); if (h) return h;
      if (g.modal === 'announce') return ok(act(room, { type: 'ANNOUNCE_CONTINUE' }));
      if (g.modal === 'guess' && g.guess.stage === 'result') return ok(act(room, { type: 'GUESS_CONTINUE' }));
      return fail(room, 'Rien à poursuivre.');
    }

    case 'pick': {
      if (g.modal !== 'pick') return fail(room, 'Aucun choix en attente.');
      const actor = g.pickPurpose === 'orion' ? g.pendingOrionId : g.pendingPrometheusId;
      if (actor === null || actor !== me) return fail(room, 'Ce choix ne vous revient pas.');
      const target = playerOf(g, msg.target);
      if (!target || target.eliminated || target.id === me) return fail(room, 'Cible invalide.');
      return ok(act(room, { type: 'PICK_TARGET', id: msg.target }));
    }

    case 'guess': {
      if (g.modal !== 'guess' || g.guess.stage !== 'asking') return fail(room, 'Personne ne devine pour l\'instant.');
      if (g.guessQueue[0] !== me) return fail(room, 'Ce n\'est pas votre tour de deviner.');
      const value = msg.value === null ? null : typeof msg.value === 'string' ? msg.value.trim().slice(0, 40) : undefined;
      if (value === undefined || value === '') return fail(room, 'Réponse vide.');
      return ok(act(room, { type: 'GUESS_SUBMIT', value }));
    }

    case 'skip': {
      const h = needHost(); if (h) return h;
      if (g.modal === 'guess' && g.guess.stage === 'asking') return ok(act(room, { type: 'GUESS_SUBMIT', value: null }));
      if (g.modal === 'pick') {
        const actor = g.pickPurpose === 'orion' ? g.pendingOrionId : g.pendingPrometheusId;
        const pool = alive(g).filter((p) => p.id !== actor);
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (!pick) return fail(room, 'Aucune cible possible.');
        return ok(act(room, { type: 'PICK_TARGET', id: pick.id }));
      }
      return fail(room, 'Rien à passer.');
    }

    case 'lie': {
      const h = needHost(); if (h) return h;
      return g.phase === 'gameover' ? ok(act(room, { type: 'ANSWER_LIE', value: msg.value })) : fail(room, 'La manche n\'est pas terminée.');
    }
    case 'mission': {
      const h = needHost(); if (h) return h;
      return g.phase === 'gameover' ? ok(act(room, { type: 'ANSWER_MISSION', value: msg.value })) : fail(room, 'La manche n\'est pas terminée.');
    }

    case 'nextRound': {
      const h = needHost(); if (h) return h;
      if (g.phase !== 'gameover') return fail(room, 'La manche n\'est pas terminée.');
      return launch(room, room.round + 1, deps);
    }

    case 'toLobby': {
      const h = needHost(); if (h) return h;
      if (!g.active) return ok(room);
      // Les absents quittent le salon : on ne ramène que les joueurs connectés.
      const kept = room.seats.filter((s) => s.connected);
      return ok({ ...room, seats: kept, hostId: kept.some((s) => s.id === room.hostId) ? room.hostId : (kept[0]?.id ?? room.hostId), game: initialGameState, roster: [], ballots: {}, restrictTo: null, tieNote: null, timerEndsAt: null, timerOver: false, notices: [] });
    }

    case 'create': case 'join': case 'rejoin':
      return fail(room, 'Déjà connecté à une salle.');

    default:
      // Message venu du réseau : le type TypeScript ne garantit rien à l'exécution.
      return fail(room, 'Action inconnue.');
  }
}

/* ------------------------------------------------------------------ horloge */

/**
 * Appelé régulièrement par le serveur : le minuteur de discussion est jugé ICI, avec l'horloge du serveur, pas par chaque client.
 * À la fin du temps, tous reçoivent `timer.over` au même instant. Si l'hôte est hors ligne à ce moment, le vote s'ouvre tout seul
 * (sinon la partie resterait bloquée) ; sinon la main reste à l'hôte. Renvoie la même salle s'il n'y a rien à changer.
 */
export function tick(room: RoomState, now: number): RoomState {
  const g = room.game;
  if (!g.active || g.phase !== 'reveal' || room.timerEndsAt === null || room.timerOver || now < room.timerEndsAt) return room;
  const over: RoomState = { ...room, timerOver: true };
  const hostHere = room.seats.some((s) => s.id === room.hostId && s.connected);
  if (hostHere || !allViewed(g)) return over;
  return { ...act(over, { type: 'START_VOTE' }), timerEndsAt: null, timerOver: false, ballots: {}, voteTurn: 0, restrictTo: null, tieNote: 'Temps écoulé et hôte absent : le vote est ouvert.' };
}

/* ------------------------------------------------------------------ vue filtrée */

function publicPlayer(room: RoomState, p: Player, reveal: boolean): PublicPlayer {
  const shown = reveal || p.eliminated;
  return {
    id: p.id, seatId: seatIdOf(room, p.id) ?? -1, name: p.name, connected: isConnected(room, p.id), eliminated: p.eliminated, viewed: p.viewed,
    icon: shown ? cardIcon(p, true) : null, roleLabel: shown ? ROLE_NAMES[baseRoleKey(p)] : null,
  };
}

function gameView(room: RoomState, seatId: number): GameView | null {
  const g = room.game;
  const meId = playerIdOf(room, seatId);
  const mine = playerOf(g, meId);
  if (!g.active) return null;
  // Pas de carte pour ce siège : il est arrivé (ou revenu) en cours de manche → spectateur.
  const over = g.phase === 'gameover';
  const myCard = mine ? describeCard(mine, { players: g.players, showRole: room.settings.showRole, civilWordHint: g.civilWordHint }) : null;
  const players = g.players.map((p) => publicPlayer(room, p, over));
  const modal = g.modal === 'announce' || g.modal === 'pick' || g.modal === 'guess' ? g.modal : 'none';
  const name = (id: number | null): string => playerOf(g, id)?.name ?? '';
  const spectators = room.seats.filter((s) => !room.roster.includes(s.id)).map((s) => s.name);

  const pickActor = g.pickPurpose === 'orion' ? g.pendingOrionId : g.pendingPrometheusId;
  const guesser = g.guessQueue[0] ?? null;

  let result: GameView['result'] = null;
  if (over && g.winner) {
    const text = gameOverText(g.winner, g.winnerReason, g.winnerDetail, g.players, g.civilWord);
    const rp: ResultPlayer[] = g.players.map((p) => ({
      id: p.id, name: p.name, icon: cardIcon(p, true), roleLabel: ROLE_NAMES[baseRoleKey(p)], won: playerWon(p, g.winner as NonNullable<typeof g.winner>, g.winnerPlayerId), eliminated: p.eliminated,
    }));
    const mytho = g.players.find((p) => p.mytho);
    const hercule = g.players.find((p) => p.hercule);
    result = {
      winner: g.winner, title: text.title, subtitle: text.subtitle, civilWord: g.civilWord, undercoverWord: g.undercoverWord, players: rp,
      lie: g.lie, mission: g.mission, askLie: mytho ? mytho.name : null, askMission: hercule ? { name: hercule.name, mission: hercule.mission } : null,
      entry: buildScoreEntry({ players: g.players, winner: g.winner, winnerPlayerId: g.winnerPlayerId, round: g.round, theme: g.pairTheme, pairDifficulty: g.pairDifficulty, groups: [] }),
    };
  }

  return {
    phase: g.phase, round: g.round, spectator: !mine, spectators, modal, players,
    me: mine && myCard ? { id: mine.id, card: myCard, icon: secretCardIcon(mine, myCard.roleLine !== ''), eliminated: mine.eliminated, viewed: mine.viewed } : null,
    timer: room.timerEndsAt !== null ? { endsAt: room.timerEndsAt, totalSec: room.timerTotalSec, over: room.timerOver } : null,
    vote: g.phase === 'vote' && modal === 'none' ? {
      candidates: candidates(room),
      voted: Object.keys(room.ballots).map(Number),
      myVote: room.ballots[meId] ?? null,
      canVote: !!mine && !mine.eliminated,
      turn: room.voteTurn,
      note: room.tieNote,
    } : null,
    announce: modal === 'announce' && g.announce ? {
      headline: g.announce.headline, lines: g.announce.lines, text: g.announce.text, button: g.announce.button,
      victims: g.announce.victimIds.flatMap((id) => {
        const p = playerOf(g, id);
        return p ? [{ id: p.id, name: p.name, icon: cardIcon(p, true), roleLabel: ROLE_NAMES[baseRoleKey(p)] }] : [];
      }),
    } : null,
    pick: modal === 'pick' && g.pickPurpose ? {
      purpose: g.pickPurpose, byName: name(pickActor), mine: pickActor === meId,
      candidates: pickActor === meId ? alive(g).filter((p) => p.id !== meId).map((p) => p.id) : [],
    } : null,
    guess: modal === 'guess' ? (g.guess.stage === 'asking'
      ? { stage: 'asking', byName: name(guesser), mine: guesser === meId }
      : { stage: 'result', byName: g.guess.playerName, mine: false, outcome: g.guess.outcome, guess: g.guess.guess, hasNext: g.guess.hasNext }) : null,
    result,
  };
}

/** La vue d'UN joueur : sa carte, l'état public, rien d'autre. */
export function viewFor(room: RoomState, seatId: number, now: number): PlayerView {
  return {
    v: PROTOCOL_VERSION, code: room.code, seatId, isHost: room.hostId === seatId, serverNow: now,
    stage: room.game.active ? 'game' : 'lobby',
    seats: room.seats.map((s) => ({ id: s.id, name: s.name, connected: s.connected, host: s.id === room.hostId })),
    settings: room.settings, customPairCount: room.customPairs.length, notices: room.notices, game: gameView(room, seatId),
  };
}
