// Notifications push via le service d'Expo (https://docs.expo.dev/push-notifications/sending-notifications/).
// Le serveur n'envoie qu'aux joueurs HORS LIGNE : un joueur connecté voit déjà la partie avancer.
const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
export const PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{10,60}\]$/;

export function createPusher({ fetchImpl = globalThis.fetch, url = EXPO_URL, now = () => Date.now(), minGapMs = 20000, onResult = () => {} } = {}) {
  const lastSent = new Map(); // jeton → heure du dernier envoi : pas plus d'une notification toutes les `minGapMs` par appareil
  return {
    /**
     * Envoie `messages` ([{ token, title, body, data }]). Renvoie les jetons que le service déclare invalides (à supprimer).
     * Ne lève jamais : une panne du service de notification ne doit pas toucher la partie.
     */
    async send(messages) {
      const t = now();
      const batch = messages.filter((m) => PUSH_TOKEN.test(m.token) && !(lastSent.has(m.token) && t - lastSent.get(m.token) < minGapMs));
      if (batch.length === 0 || !fetchImpl) return [];
      for (const m of batch) lastSent.set(m.token, t);
      try {
        const res = await fetchImpl(url, {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(batch.map((m) => ({ to: m.token, title: m.title, body: m.body, data: m.data ?? {}, sound: 'default', priority: 'high' }))),
        });
        const json = await res.json().catch(() => null);
        const tickets = Array.isArray(json?.data) ? json.data : [];
        const dead = [];
        tickets.forEach((tk, i) => { if (tk?.status === 'error' && tk?.details?.error === 'DeviceNotRegistered' && batch[i]) dead.push(batch[i].token); });
        onResult({ sent: batch.length, failed: tickets.filter((tk) => tk?.status === 'error').length });
        return dead;
      } catch (err) {
        onResult({ sent: 0, failed: batch.length, error: String(err && err.message) });
        return [];
      }
    },
    sweep() { const t = now(); for (const [k, v] of lastSent) if (t - v > 3600000) lastSent.delete(k); },
  };
}
