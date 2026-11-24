import { httpBaseOf } from '@/net/invite';

export interface AccountInfo { readonly id: string; readonly pseudo: string; readonly games: number; readonly wins: number; readonly createdAt: number }
export interface LeaderRow { readonly rank: number; readonly pseudo: string; readonly games: number; readonly wins: number }

/** Erreur lisible par l'utilisateur ; `status` vaut 0 quand le serveur est injoignable. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApiError'; }
}

/** Appel JSON à l'API du serveur de parties (même adresse que le WebSocket, en http(s)). */
export async function api<T>(serverUrl: string, method: 'GET' | 'POST' | 'DELETE', path: string, opts: { body?: unknown; token?: string | null } = {}): Promise<T> {
  const base = httpBaseOf(serverUrl);
  if (!base) throw new ApiError('Adresse du serveur invalide.', 0);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${base}${path}`, {
      method, signal: ctrl.signal,
      headers: { ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new ApiError(data?.error ?? 'Erreur du serveur.', res.status);
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('Serveur injoignable.', 0);
  } finally { clearTimeout(timer); }
}
