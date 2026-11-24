import type { CardView, GameSettings, LieOutcome, MissionOutcome, ScoreEntry, Winner, WordPair } from '@/domain';
import type { IconKey } from '@/features/roleMeta';

/**
 * Protocole client ↔ serveur (JSON sur WebSocket). Le serveur est seul maître de la partie : un client envoie des
 * intentions (`ClientMsg`), le serveur les valide (droits, phase) puis renvoie à chacun SA vue filtrée (`PlayerView`).
 */
export const PROTOCOL_VERSION = 3;

/** Réactions rapides autorisées (le serveur refuse tout autre texte). */
export const REACTIONS = ['👍', '😂', '😱', '🤔', '🔥', '👀', '🙈', '💀'] as const;
export const MAX_CHAT = 140;
/** Durées de vote proposées à l'hôte, en secondes (0 = pas de limite). */
export const VOTE_SECONDS = [0, 30, 45, 60, 90, 120, 180] as const;

export type ClientMsg =
  // Connexion (avant d'avoir un siège)
  | { t: 'create'; name: string; account?: string; password?: string }
  | { t: 'join'; code: string; name: string; account?: string; password?: string }
  | { t: 'rejoin'; code: string; token: string }
  // Salon (hôte)
  | { t: 'settings'; patch: Partial<GameSettings> }
  | { t: 'kick'; seatId: number }
  /** Renvoie un joueur ET l'empêche de revenir (même pseudo, même compte, même adresse). */
  | { t: 'ban'; seatId: number }
  /** Ferme (ou rouvre) la salle aux nouveaux arrivants. */
  | { t: 'lock'; locked: boolean }
  /** Mot de passe de la salle (`null` ou vide = retiré). Traité par le serveur, qui n'en garde qu'une empreinte. */
  | { t: 'password'; password: string | null }
  /** Limite de temps du vote (secondes, 0 = aucune) et chat de la salle. */
  | { t: 'options'; voteSec?: number; chat?: boolean }
  /** Passe le rôle d'hôte à un autre joueur connecté. */
  | { t: 'promote'; seatId: number }
  /** Paires de mots personnalisées de l'hôte, utilisées par le thème « Mes paires » pour cette salle. */
  | { t: 'pairs'; pairs: readonly WordPair[] }
  | { t: 'start' }
  // Manche
  | { t: 'seen' }
  /** `force` : ouvre le vote même si des joueurs n'ont pas lu leur carte (ils sont comptés comme ayant lu). */
  | { t: 'startVote'; force?: boolean }
  | { t: 'vote'; target: number }
  | { t: 'forceVote' }
  | { t: 'pick'; target: number }
  | { t: 'guess'; value: string | null }
  | { t: 'continue' }
  | { t: 'skip' }
  | { t: 'extend' }
  | { t: 'lie'; value: Exclude<LieOutcome, null> }
  | { t: 'mission'; value: Exclude<MissionOutcome, null> }
  | { t: 'nextRound' }
  /** Nouvelle partie (manche 1) avec les mêmes joueurs et réglages. */
  | { t: 'rematch' }
  | { t: 'chat'; text: string }
  | { t: 'react'; emoji: string }
  /** Jeton de notification (Expo) de cet appareil, pour être prévenu quand la partie avance. */
  | { t: 'push'; token: string | null }
  | { t: 'toLobby' }
  | { t: 'leave' }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'joined'; code: string; token: string; seatId: number }
  | { t: 'view'; view: PlayerView }
  | { t: 'error'; message: string; /** Code lisible par l'application (ex. mot de passe requis). */ code?: 'password' | 'locked' | 'banned' | 'busy' | 'limit' }
  /** Événement éphémère (réaction, message) : ne fait pas partie de l'état de la salle. */
  | { t: 'event'; event: RoomEvent }
  | { t: 'chatlog'; items: readonly RoomEvent[] }
  | { t: 'pong' };

export type RoomEvent =
  | { readonly kind: 'react'; readonly seatId: number; readonly name: string; readonly emoji: string; readonly at: number }
  | { readonly kind: 'chat'; readonly seatId: number; readonly name: string; readonly text: string; readonly at: number };

export interface SeatView { readonly id: number; readonly name: string; readonly connected: boolean; readonly host: boolean }

/** Ce que tout le monde voit d'un joueur. `icon`/`roleLabel` n'existent qu'une fois le joueur éliminé (ou la manche finie). */
export interface PublicPlayer {
  readonly id: number;
  /** Inactif : a laissé passer deux votes de suite ; il ne bloque plus le vote tant qu'il ne rejoue pas. */
  readonly idle: boolean;
  readonly seatId: number;
  readonly name: string;
  readonly connected: boolean;
  readonly eliminated: boolean;
  readonly viewed: boolean;
  readonly icon: IconKey | null;
  readonly roleLabel: string | null;
}

export interface ResultPlayer { readonly id: number; readonly name: string; readonly icon: IconKey; readonly roleLabel: string; readonly won: boolean; readonly eliminated: boolean }

export interface GameView {
  readonly phase: 'reveal' | 'vote' | 'gameover';
  readonly round: number;
  /** Vrai si je suis arrivé en cours de manche : je regarde, sans carte, et je jouerai à la manche suivante. */
  readonly spectator: boolean;
  /** Noms des spectateurs de la manche. */
  readonly spectators: readonly string[];
  readonly modal: 'none' | 'announce' | 'pick' | 'guess';
  readonly players: readonly PublicPlayer[];
  /** Ma carte : uniquement la mienne, jamais celle d'un autre. `null` pour un spectateur. */
  readonly me: null | { readonly id: number; readonly card: CardView; readonly icon: IconKey | null; readonly eliminated: boolean; readonly viewed: boolean };
  /** `over` : constaté par le serveur (horloge de référence), identique pour tous les joueurs. */
  readonly timer: { readonly endsAt: number; readonly totalSec: number; readonly over: boolean } | null;
  readonly vote: null | {
    readonly candidates: readonly number[];
    /** Qui a voté (jamais pour qui). */
    readonly voted: readonly number[];
    readonly myVote: number | null;
    readonly canVote: boolean;
    readonly turn: number;
    readonly note: string | null;
    /** Fin du vote (heure du serveur) quand une limite de temps est réglée. */
    readonly endsAt: number | null;
  };
  readonly announce: null | {
    readonly headline: string; readonly lines: readonly string[]; readonly text: string; readonly button: string;
    readonly victims: ReadonlyArray<{ id: number; name: string; icon: IconKey; roleLabel: string }>;
  };
  readonly pick: null | { readonly purpose: 'orion' | 'prometheus'; readonly byName: string; readonly mine: boolean; readonly candidates: readonly number[] };
  readonly guess: null | {
    readonly stage: 'asking' | 'result'; readonly byName: string; readonly mine: boolean;
    readonly outcome?: 'win' | 'miss' | 'skip'; readonly guess?: string; readonly hasNext?: boolean;
  };
  readonly result: null | {
    readonly winner: Winner; readonly title: string; readonly subtitle: string;
    readonly civilWord: string; readonly undercoverWord: string;
    readonly players: readonly ResultPlayer[];
    readonly lie: LieOutcome; readonly mission: MissionOutcome;
    readonly askLie: string | null; readonly askMission: { readonly name: string; readonly mission: string } | null;
    readonly entry: ScoreEntry;
  };
}

export interface TurnSummary { readonly votes: ReadonlyArray<{ readonly from: string; readonly to: string }>; readonly eliminated: string; readonly note: string | null }
export interface RoundSummary {
  readonly round: number;
  readonly winner: Winner;
  readonly title: string;
  readonly civilWord: string;
  readonly undercoverWord: string;
  readonly players: ReadonlyArray<{ readonly name: string; readonly roleLabel: string; readonly won: boolean; readonly eliminated: boolean }>;
  readonly turns: readonly TurnSummary[];
}

export interface RoomOptions { readonly voteSec: number; readonly chat: boolean; readonly locked: boolean; readonly hasPassword: boolean }

export interface PlayerView {
  readonly v: number;
  readonly code: string;
  readonly seatId: number;
  readonly isHost: boolean;
  /** Heure du serveur à l'envoi : les clients s'en servent pour caler le minuteur sur l'horloge du serveur. */
  readonly serverNow: number;
  readonly stage: 'lobby' | 'game';
  readonly seats: readonly SeatView[];
  readonly settings: GameSettings;
  /** Nombre de paires personnalisées chargées dans la salle (envoyées par l'hôte). */
  readonly customPairCount: number;
  readonly options: RoomOptions;
  /** Manches terminées de la salle (la manche en cours y figure quand elle est finie). */
  readonly history: readonly RoundSummary[];
  readonly notices: readonly string[];
  readonly game: GameView | null;
}
