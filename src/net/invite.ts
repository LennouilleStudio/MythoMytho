/**
 * Lien d'invitation d'une salle : `https://exemple.fr/?salle=ABCD`. Logique pure (sans réseau ni écran), partagée avec les tests du serveur.
 */
export const INVITE_PARAM = 'salle';

/** Code de salle (4 lettres) lu dans un paramètre d'adresse ; `null` s'il n'en contient pas un valide. */
export function parseInviteCode(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const code = value.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return code.length === 4 && value.trim().length <= 8 ? code : null;
}

/** `ws://hôte:8787` → `http://hôte:8787` (`wss` → `https`). `null` si l'adresse n'est pas une adresse de serveur. */
export function httpBaseOf(serverUrl: string): string | null {
  const m = /^(wss?):\/\/([^/?#\s]+)/i.exec(serverUrl.trim());
  if (!m) return null;
  return `${(m[1] as string).toLowerCase() === 'wss' ? 'https' : 'http'}://${m[2]}`;
}

/**
 * Lien à partager. Sur le web, c'est l'adresse de la page elle-même (`webOrigin`) ; sur mobile natif, on retombe sur le serveur de parties,
 * qui sert aussi l'application. `null` quand aucune adresse n'est connue (seul le code se partage alors).
 */
export function inviteUrl(code: string, opts: { webOrigin?: string | null; serverUrl: string }): string | null {
  const base = (opts.webOrigin && /^https?:\/\//i.test(opts.webOrigin) ? opts.webOrigin.replace(/\/+$/, '') : null) ?? httpBaseOf(opts.serverUrl);
  return base ? `${base}/?${INVITE_PARAM}=${encodeURIComponent(code.toUpperCase())}` : null;
}
