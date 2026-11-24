// Limiteur à fenêtre fixe : « au plus `max` événements par clé et par `windowMs` ». Horloge injectable (tests).
export function createLimiter({ max, windowMs, now = () => Date.now() }) {
  const wins = new Map();
  return {
    /** Compte un événement pour `key` ; renvoie false s'il dépasse le plafond de la fenêtre en cours. */
    hit(key) {
      const t = now();
      const w = wins.get(key);
      if (!w || t - w.start >= windowMs) { wins.set(key, { start: t, n: 1 }); return true; }
      w.n++;
      return w.n <= max;
    },
    /** Oublie les fenêtres expirées (à appeler de temps en temps pour ne pas retenir des clés mortes). */
    sweep() { const t = now(); for (const [k, w] of wins) if (t - w.start >= windowMs) wins.delete(k); },
    get size() { return wins.size; },
  };
}

/** Adresse du client. Derrière un proxy de confiance (`hops` ≥ 1), on lit X-Forwarded-For en partant de la droite : seule l'entrée ajoutée par NOTRE proxy est fiable. */
export function clientIp(req, hops = 0) {
  if (hops > 0) {
    const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const ip = xff[xff.length - hops];
    if (ip) return ip;
  }
  return req.socket?.remoteAddress ?? 'inconnue';
}
