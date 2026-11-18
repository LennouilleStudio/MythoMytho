import type { CardView, GameSettings, LieOutcome, MissionOutcome, ScoreEntry, Winner } from '@/domain';
import type { IconKey } from '@/features/roleMeta';

/**
 * Protocole client ↔ serveur (JSON sur WebSocket). Le serveur est seul maître de la partie : un client envoie des
 * intentions (`ClientMsg`), le serveur les valide (droits, phase) puis renvoie à chacun SA vue filtrée (`PlayerView`).
 */
export const PROTOCOL_VERSION = 1;

export type ClientMsg =
  // Connexion (avant d'avoir un siège)
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'rejoin'; code: string; token: string }
  // Salon (hôte)
  | { t: 'settings'; patch: Partial<GameSettings> }
  | { t: 'kick'; seatId: number }
  | { t: 'start' }
  // Manche
  | { t: 'seen' }
  | { t: 'startVote' }
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
  | { t: 'toLobby' }
  | { t: 'leave' }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'joined'; code: string; token: string; seatId: number }
  | { t: 'view'; view: PlayerView }
  | { t: 'error'; message: string }
  | { t: 'pong' };

export interface SeatView { readonly id: number; readonly name: string; readonly connected: boolean; readonly host: boolean }

/** Ce que tout le monde voit d'un joueur. `icon`/`roleLabel` n'existent qu'une fois le joueur éliminé (ou la manche finie). */
export interface PublicPlayer {
  readonly id: number;
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
  readonly modal: 'none' | 'announce' | 'pick' | 'guess';
  readonly players: readonly PublicPlayer[];
  /** Ma carte : uniquement la mienne, jamais celle d'un autre. */
  readonly me: { readonly id: number; readonly card: CardView; readonly icon: IconKey | null; readonly eliminated: boolean; readonly viewed: boolean };
  readonly timer: { readonly endsAt: number; readonly totalSec: number } | null;
  readonly vote: null | {
    readonly candidates: readonly number[];
    /** Qui a voté (jamais pour qui). */
    readonly voted: readonly number[];
    readonly myVote: number | null;
    readonly canVote: boolean;
    readonly turn: number;
    readonly note: string | null;
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
  readonly notices: readonly string[];
  readonly game: GameView | null;
}
