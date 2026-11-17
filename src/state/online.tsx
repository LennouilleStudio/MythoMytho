import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { GameClient, type ConnStatus, type Session } from '@/services/gameClient';
import type { ClientMsg, PlayerView } from '@/net/protocol';
import { loadJson, saveJson } from '@/services/storage';
import { useLibrary } from './library';
import { useToast } from './toast';

// Variable inlinée par Expo à la compilation : l'accès doit rester littéral (`process.env.EXPO_PUBLIC_…`).
declare const process: { env: Record<string, string | undefined> };

const KEYS = { session: 'mythomytho_online_session_v1', server: 'mythomytho_online_server_v1' } as const;

/** Adresse du serveur par défaut : variable d'environnement Expo, sinon la machine qui sert l'application (web), sinon localhost. */
export function defaultServerUrl(): string {
  const env = process.env.EXPO_PUBLIC_SERVER_URL;
  if (env) return env;
  const loc = (globalThis as unknown as { location?: { protocol: string; hostname: string } }).location;
  if (Platform.OS === 'web' && loc) return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.hostname}:8787`;
  return 'ws://localhost:8787';
}

const parseSession = (raw: unknown): Session | null => {
  const o = raw as Partial<Session> | null;
  return o && typeof o.url === 'string' && typeof o.code === 'string' && typeof o.token === 'string' ? { url: o.url, code: o.code, token: o.token } : null;
};

interface OnlineValue {
  readonly status: ConnStatus;
  readonly view: PlayerView | null;
  readonly serverUrl: string;
  readonly setServerUrl: (u: string) => void;
  /** Une session sauvegardée peut être reprise (l'application a été fermée en pleine partie). */
  readonly canResume: boolean;
  readonly create: (name: string) => void;
  readonly join: (code: string, name: string) => void;
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
  const [serverUrl, setServerUrlState] = useState(defaultServerUrl());
  const offset = useRef(0);
  const toastRef = useRef(toast); toastRef.current = toast;
  const libRef = useRef(lib); libRef.current = lib;
  const recorded = useRef<string | null>(null);
  const lastRound = useRef<string | null>(null);

  useEffect(() => {
    void loadJson(KEYS.session, parseSession, null).then(setSaved);
    void loadJson<string | null>(KEYS.server, (r) => (typeof r === 'string' && r.length < 200 ? r : null), null).then((u) => { if (u) setServerUrlState(u); });
  }, []);

  const client = useMemo(() => new GameClient({
    onView: (v) => { offset.current = v.serverNow - Date.now(); setView(v); },
    onStatus: setStatus,
    onError: (m) => toastRef.current(m),
    onSession: (s) => { setSaved(s); void saveJson(KEYS.session, s); if (!s) setView(null); },
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

  const setServerUrl = useCallback((u: string) => { setServerUrlState(u); void saveJson(KEYS.server, u); }, []);
  const create = useCallback((name: string) => { setView(null); client.open(serverUrl.trim(), { t: 'create', name }); }, [client, serverUrl]);
  const join = useCallback((code: string, name: string) => { setView(null); client.open(serverUrl.trim(), { t: 'join', code: code.trim().toUpperCase(), name }); }, [client, serverUrl]);
  const resume = useCallback(() => { if (saved) { setView(null); client.open(saved.url, { t: 'rejoin', code: saved.code, token: saved.token }, saved); } }, [client, saved]);
  const send = useCallback((m: ClientMsg) => client.send(m), [client]);
  const leave = useCallback(() => { client.leave(); setView(null); }, [client]);
  const serverNow = useCallback(() => Date.now() + offset.current, []);

  const value = useMemo<OnlineValue>(() => ({
    status, view, serverUrl, setServerUrl, canResume: saved !== null && status === 'idle', create, join, resume, send, leave, serverNow,
  }), [status, view, serverUrl, setServerUrl, saved, create, join, resume, send, leave, serverNow]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnline(): OnlineValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOnline doit être utilisé sous <OnlineProvider>');
  return v;
}
