import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type AccountInfo, type LeaderRow } from '@/services/api';
import { loadJson, saveJson } from '@/services/storage';
import { useServer } from './server';

const KEY = 'mythomytho_account_v1';

interface Stored { readonly token: string; readonly account: AccountInfo; readonly useForGames: boolean }
const parse = (raw: unknown): Stored | null => {
  const o = raw as Partial<Stored> | null;
  return o && typeof o.token === 'string' && o.account && typeof o.account.pseudo === 'string' ? { token: o.token, account: o.account, useForGames: o.useForGames !== false } : null;
};

interface AccountValue {
  readonly account: AccountInfo | null;
  readonly token: string | null;
  /** Les parties en ligne comptent pour le classement (sinon on joue anonymement, même connecté). */
  readonly useForGames: boolean;
  readonly setUseForGames: (v: boolean) => void;
  readonly register: (pseudo: string, password: string) => Promise<void>;
  readonly login: (pseudo: string, password: string) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly remove: (password: string) => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly leaderboard: () => Promise<readonly LeaderRow[]>;
}
const Ctx = createContext<AccountValue | null>(null);

/** Compte en ligne (facultatif) : pseudo + mot de passe, statistiques et classement tenus par le serveur. */
export function AccountProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { serverUrl } = useServer();
  const [stored, setStored] = useState<Stored | null>(null);
  const ref = useRef(stored); ref.current = stored;
  const urlRef = useRef(serverUrl); urlRef.current = serverUrl;

  const persist = useCallback((s: Stored | null) => { setStored(s); void saveJson(KEY, s); }, []);
  useEffect(() => { void loadJson(KEY, parse, null).then(setStored); }, []);

  const refresh = useCallback(async () => {
    const s = ref.current;
    if (!s) return;
    try {
      const out = await api<{ account: AccountInfo }>(urlRef.current, 'GET', '/api/me', { token: s.token });
      persist({ ...s, account: out.account });
    } catch (e) {
      // Session expirée ou compte supprimé : on se déconnecte. Un serveur injoignable ne déconnecte jamais.
      if (e instanceof ApiError && e.status === 401) persist(null);
    }
  }, [persist]);
  useEffect(() => { if (stored) void refresh(); /* une fois au chargement du compte */ // eslint-disable-line react-hooks/exhaustive-deps
  }, [stored === null, serverUrl]);

  const enter = useCallback(async (path: '/api/register' | '/api/login', pseudo: string, password: string) => {
    const out = await api<{ token: string; account: AccountInfo }>(urlRef.current, 'POST', path, { body: { pseudo, password } });
    persist({ token: out.token, account: out.account, useForGames: true });
  }, [persist]);

  const value = useMemo<AccountValue>(() => ({
    account: stored?.account ?? null, token: stored?.token ?? null, useForGames: stored?.useForGames ?? false,
    setUseForGames: (v) => { if (ref.current) persist({ ...ref.current, useForGames: v }); },
    register: (p, pw) => enter('/api/register', p, pw),
    login: (p, pw) => enter('/api/login', p, pw),
    logout: async () => {
      const s = ref.current;
      persist(null);
      if (s) await api(urlRef.current, 'POST', '/api/logout', { token: s.token }).catch(() => undefined);
    },
    remove: async (password) => {
      const s = ref.current;
      if (!s) return;
      await api(urlRef.current, 'DELETE', '/api/account', { token: s.token, body: { password } });
      persist(null);
    },
    refresh,
    leaderboard: async () => (await api<{ players: LeaderRow[] }>(urlRef.current, 'GET', '/api/leaderboard?limit=30')).players,
  }), [stored, enter, persist, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount(): AccountValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount doit être utilisé sous <AccountProvider>');
  return v;
}
