import type { ClientMsg, PlayerView, RoomEvent, ServerMsg } from '@/net/protocol';

export type ConnStatus = 'idle' | 'connecting' | 'online' | 'reconnecting';
export interface Session { readonly url: string; readonly code: string; readonly token: string }

export interface ClientEvents {
  onView(view: PlayerView): void;
  onStatus(status: ConnStatus): void;
  onError(message: string): void;
  /** Code lisible de la dernière erreur (mot de passe requis, salle verrouillée, banni…), juste avant `onError`. */
  onErrorCode?(code: string | null): void;
  /** Réaction ou message de chat (événements éphémères). */
  onEvent?(event: RoomEvent): void;
  /** Historique du chat envoyé à la (re)connexion. */
  onChatlog?(items: readonly RoomEvent[]): void;
  /** `null` : la session n'est plus valable (salle fermée, jeton expiré, départ volontaire). */
  onSession(session: Session | null): void;
}

const BACKOFF = [800, 1600, 3200, 6400];

/**
 * Connexion WebSocket à une salle. Gère l'ouverture (création / adhésion / reprise), le battement de cœur et la
 * reconnexion automatique avec le jeton de siège : une coupure réseau ne fait pas perdre sa place.
 */
export class GameClient {
  private ws: WebSocket | null = null;
  private session: Session | null = null;
  private first: ClientMsg | null = null;
  private url = '';
  private attempt = 0;
  private beat: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private closing = false;

  constructor(private readonly ev: ClientEvents) {}

  /** Ouvre la connexion puis envoie le premier message (`create`, `join` ou `rejoin`). */
  open(url: string, first: ClientMsg, resume: Session | null = null): void {
    this.dispose(false);
    this.closing = false; this.url = url; this.first = first; this.session = resume; this.attempt = 0;
    this.ev.onStatus('connecting');
    this.dial();
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  /** Quitte la salle volontairement. */
  leave(): void {
    this.send({ t: 'leave' });
    this.dispose(true);
  }

  private dial(): void {
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); } catch { this.ev.onError('Adresse du serveur invalide.'); this.dispose(true); return; }
    this.ws = ws;
    ws.onopen = () => {
      if (this.first) ws.send(JSON.stringify(this.first));
      this.beat = setInterval(() => this.send({ t: 'ping' }), 20000);
    };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try { m = JSON.parse(String(e.data)) as ServerMsg; } catch { return; }
      if (m.t === 'joined') {
        this.session = { url: this.url, code: m.code, token: m.token };
        this.first = { t: 'rejoin', code: m.code, token: m.token };
        this.attempt = 0;
        this.ev.onSession(this.session);
        this.ev.onStatus('online');
      } else if (m.t === 'view') {
        this.ev.onView(m.view);
      } else if (m.t === 'event') {
        this.ev.onEvent?.(m.event);
      } else if (m.t === 'chatlog') {
        this.ev.onChatlog?.(m.items);
      } else if (m.t === 'error') {
        this.ev.onErrorCode?.(m.code ?? null);
        // Avant d'avoir un siège, toute erreur est définitive (salle introuvable, mot de passe, verrou, bannissement…) ; en cours de partie,
        // seules la reprise impossible (salle disparue, jeton refusé) ou le renvoi mettent fin à la session.
        if (!this.session || m.code === 'banned' || /expirée|introuvable|n'existe plus|retiré|banni/i.test(m.message)) { this.ev.onError(m.message); this.dispose(true); return; }
        this.ev.onError(m.message);
      }
    };
    ws.onclose = () => {
      if (this.beat) { clearInterval(this.beat); this.beat = null; }
      if (this.closing) return;
      if (!this.session) { this.ev.onError('Connexion au serveur impossible.'); this.dispose(true); return; }
      this.ev.onStatus('reconnecting');
      const wait = BACKOFF[Math.min(this.attempt++, BACKOFF.length - 1)] ?? 6400;
      this.retry = setTimeout(() => this.dial(), wait);
    };
    ws.onerror = () => { /* onclose suit : la reconnexion s'y décide */ };
  }

  private dispose(clearSession: boolean): void {
    this.closing = true;
    if (this.beat) { clearInterval(this.beat); this.beat = null; }
    if (this.retry) { clearTimeout(this.retry); this.retry = null; }
    const ws = this.ws; this.ws = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; ws.onopen = null; try { ws.close(); } catch { /* déjà fermée */ } }
    if (clearSession) { this.session = null; this.first = null; this.ev.onSession(null); this.ev.onStatus('idle'); }
  }
}
