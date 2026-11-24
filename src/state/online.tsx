import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GameClient, type ConnStatus, type Session } from '@/services/gameClient';
import type { ClientMsg, PlayerView, RoomEvent } from '@/net/protocol';
import { getPushToken, pushSupported } from '@/services/push';
import { loadJson, saveJson } from '@/services/storage';
import { useAccount } from './account';
import { useLibrary } from './library';
import { useServer, defaultServerUrl } from './server';
import { useToast } from './toast';

export { defaultServerUrl };

const KEYS = { session: 'mythomytho_online_session_v1', push: 'mythomytho_push_v1' } as const;

const parseSession = (raw: unknown): Session | null => {
  const o = raw as Partial<Session> | null;
  return o && typeof o.url === 'string' && typeof o.code === 'string' && typeof o.token === 'string' ? { url: o.url, code: o.code, token: o.token } : null;
};

/** Réaction affichée un court instant. */
export interface LiveReaction { readonly id: number; readonly emoji: string; readonly name: string }

interface OnlineValue {
  readonly status: ConnStatus;
  readonly view: PlayerView | null;
  readonly serverUrl: string;
  readonly setServerUrl: (u: string) => void;
  /** Une session sauvegardée peut être reprise (l'application a été fermée en pleine partie). */
  readonly canResume: boolean;
  /** Dernière erreur d'entrée dans une salle (mot de passe requis, salle verrouillée, bannissement…). */
  readonly joinError: { readonly code: string | null; readonly message: string } | null;
  readonly create: (name: string, password?: string) => void;
  readonly join: (code: string, name: string, password?: string) => void;
  /** Réactions récentes (disparaissent seules) et chat de la salle. */
  readonly reactions: readonly LiveReaction[];
  readonly chat: readonly Extract<RoomEvent, { kind: 'chat' }>[];
  readonly chatUnread: number;
  readonly markChatRead: () => void;
  /** Notifications push : disponibles (appareil natif + paquet installé) et activées. */
  readonly pushAvailable: boolean;
  readonly pushOn: boolean;
  readonly setPushOn: (on: boolean) => void;
  readonly resume: () => void;
  readonly send: (msg: ClientMsg) => void;
  readonly leave: () => void;
  /** Heure du serveur « maintenant » (pour caler les minuteurs). */
  readonly serverNow: () => number;
}
const Ctx = createContext<OnlineValue | null>(null);

export function OnlineProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const toast = useToast();
  const lib = useLibrary();
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [view, setView] = useState<PlayerView | null>(null);
  const [saved, setSaved] = useState<Session | null>(null);
  const { serverUrl, setServerUrl } = useServer();
  const acct = useAccount();
  const acctRef = useRef(acct); acctRef.current = acct;
  const [joinError, setJoinError] = useState<OnlineValue['joinError']>(null);
  const lastCode = useRef<string | null>(null);
  const [reactions, setReactions] = useState<readonly LiveReaction[]>([]);
  const [chat, setChat] = useState<OnlineValue['chat']>([]);
  const [chatUnread, setChatUnread] = useState(0);
  const reactionId = useRef(0);
  const [pushOn, setPushOnState] = useState(false);
  const pushToken = useRef<string | null>(null);
  const offset = useRef(0);
  const toastRef = useRef(toast); toastRef.current = toast;
  const libRef = useRef(lib); libRef.current = lib;
  const recorded = useRef<string | null>(null);
  const lastRound = useRef<string | null>(null);

  useEffect(() => {
    void loadJson(KEYS.session, parseSession, null).then(setSaved);
    void loadJson<boolean>(KEYS.push, (r) => r === true, false).then(setPushOnState);
  }, []);

  const client = useMemo(() => new GameClient({
    onView: (v) => { offset.current = v.serverNow - Date.now(); setView(v); },
    onStatus: setStatus,
    onError: (m) => { toastRef.current(m); setJoinError((e) => (e ? { ...e, message: m } : { code: lastCode.current, message: m })); },
    onErrorCode: (c) => { lastCode.current = c; },
    onEvent: (ev) => {
      if (ev.kind === 'react') {
        const id = ++reactionId.current;
        setReactions((r) => [...r.slice(-5), { id, emoji: ev.emoji, name: ev.name }]);
        setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 3500);
      } else {
        setChat((c) => [...c.slice(-79), ev]);
        setChatUnread((n) => n + 1);
      }
    },
    onChatlog: (items) => { setChat(items.filter((i): i is Extract<RoomEvent, { kind: 'chat' }> => i.kind === 'chat')); },
    onSession: (s) => { setSaved(s); void saveJson(KEYS.session, s); if (s) setJoinError(null); else { setView(null); setChat([]); setReactions([]); setChatUnread(0); } },
  }), []);
  useEffect(() => () => { /* la connexion survit au changement d'écran : fermée explicitement par leave() */ }, []);

  // Journal local : chaque joueur garde la manche dans son propre journal, une seule fois.
  useEffect(() => {
    const r = view?.game?.result;
    if (!view || !r) return;
    const key = `${view.code}:${view.game?.round ?? 0}`;
    if (recorded.current !== key) { recorded.current = key; libRef.current.recordEntry(r.entry); }
    if (r.lie || r.mission) libRef.current.patchLatestEntry({ lie: r.lie, mission: r.mission });
  }, [view]);

  // Remarques de tirage (repli de difficulté, stock réinitialisé…) : une fois par manche.
  useEffect(() => {
    if (!view?.game) { lastRound.current = null; return; }
    const key = `${view.code}:${view.game.round}`;
    if (lastRound.current === key) return;
    lastRound.current = key;
    view.notices.forEach((n) => toastRef.current(n));
  }, [view]);

  /** Jeton de compte à joindre quand le joueur a choisi de faire compter la partie. */
  const accountToken = (): { account?: string } => (acctRef.current.token && acctRef.current.useForGames ? { account: acctRef.current.token } : {});
  const create = useCallback((name: string, password?: string) => {
    setView(null); setJoinError(null); setChat([]);
    client.open(serverUrl.trim(), { t: 'create', name, ...(password ? { password } : {}), ...accountToken() });
  }, [client, serverUrl]);
  const join = useCallback((code: string, name: string, password?: string) => {
    setView(null); setJoinError(null); setChat([]);
    client.open(serverUrl.trim(), { t: 'join', code: code.trim().toUpperCase(), name, ...(password ? { password } : {}), ...accountToken() });
  }, [client, serverUrl]);
  const resume = useCallback(() => { if (saved) { setView(null); client.open(saved.url, { t: 'rejoin', code: saved.code, token: saved.token }, saved); } }, [client, saved]);
  const send = useCallback((m: ClientMsg) => client.send(m), [client]);
  const leave = useCallback(() => { client.leave(); setView(null); }, [client]);
  const serverNow = useCallback(() => Date.now() + offset.current, []);
  const markChatRead = useCallback(() => setChatUnread(0), []);

  // Notifications : le jeton de l'appareil est (ré)envoyé à chaque connexion ; le serveur ne prévient que les joueurs hors ligne.
  const pushAvailable = useMemo(() => pushSupported(), []);
  useEffect(() => {
    if (status !== 'online' || !pushOn || !pushAvailable) return;
    let cancelled = false;
    void (async () => {
      pushToken.current ??= await getPushToken();
      if (!cancelled && pushToken.current) client.send({ t: 'push', token: pushToken.current });
    })();
    return () => { cancelled = true; };
  }, [status, pushOn, pushAvailable, client]);
  const setPushOn = useCallback((on: boolean) => {
    void (async () => {
      if (on) {
        const token = await getPushToken();
        if (!token) { toastRef.current('Notifications indisponibles : autorisation refusée ou appareil non compatible.'); return; }
        pushToken.current = token;
      } else client.send({ t: 'push', token: null });
      setPushOnState(on); void saveJson(KEYS.push, on);
    })();
  }, [client]);

  const value = useMemo<OnlineValue>(() => ({
    status, view, serverUrl, setServerUrl, canResume: saved !== null && status === 'idle', joinError, create, join, resume, send, leave, serverNow,
    reactions, chat, chatUnread, markChatRead, pushAvailable, pushOn, setPushOn,
  }), [status, view, serverUrl, setServerUrl, saved, joinError, create, join, resume, send, leave, serverNow, reactions, chat, chatUnread, markChatRead, pushAvailable, pushOn, setPushOn]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnline(): OnlineValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOnline doit être utilisé sous <OnlineProvider>');
  return v;
}
