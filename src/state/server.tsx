import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { loadJson, saveJson } from '@/services/storage';

// Variable inlinée par Expo à la compilation : l'accès doit rester littéral (`process.env.EXPO_PUBLIC_…`).
declare const process: { env: Record<string, string | undefined> };

const KEY = 'mythomytho_online_server_v1';

/**
 * Adresse du serveur par défaut :
 * 1. `EXPO_PUBLIC_SERVER_URL` si définie ;
 * 2. web en production : la même origine que la page (le serveur de parties sert aussi l'application, derrière TLS si besoin) ;
 * 3. web en développement (`expo start`) : la machine qui sert l'application, port 8787 ;
 * 4. natif : localhost:8787 (à régler dans « Adresse du serveur »).
 */
export function defaultServerUrl(): string {
  const env = process.env.EXPO_PUBLIC_SERVER_URL;
  if (env) return env;
  const loc = (globalThis as unknown as { location?: { protocol: string; hostname: string; host: string } }).location;
  if (Platform.OS === 'web' && loc) {
    const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
    return process.env.NODE_ENV === 'production' ? `${scheme}://${loc.host}` : `${scheme}://${loc.hostname}:8787`;
  }
  return 'ws://localhost:8787';
}

interface ServerValue { readonly serverUrl: string; readonly setServerUrl: (u: string) => void }
const Ctx = createContext<ServerValue | null>(null);

/** Adresse du serveur de parties, partagée par le jeu en ligne et les comptes. */
export function ServerProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [serverUrl, setUrl] = useState(defaultServerUrl());
  useEffect(() => {
    void loadJson<string | null>(KEY, (r) => (typeof r === 'string' && r.length < 200 ? r : null), null).then((u) => { if (u) setUrl(u); });
  }, []);
  const setServerUrl = useCallback((u: string) => { setUrl(u); void saveJson(KEY, u); }, []);
  const value = useMemo(() => ({ serverUrl, setServerUrl }), [serverUrl, setServerUrl]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useServer(): ServerValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useServer doit être utilisé sous <ServerProvider>');
  return v;
}
