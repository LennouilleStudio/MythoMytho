// Comptes en ligne : pseudo + mot de passe, jeton de session, statistiques et classement.
// Mots de passe : scrypt avec sel propre à chaque compte. Jetons : 32 octets aléatoires, seule leur empreinte SHA-256 est conservée.
// Stockage : un fichier JSON (droits 0600, écriture atomique) si `file` est fourni, sinon en mémoire seulement.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PSEUDO = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,14}[\p{L}\p{N}]$/u; // 3 à 16 caractères, commence et finit par une lettre ou un chiffre
export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const SESSION_TTL_MS = 90 * 24 * 3600 * 1000;
const VERSION = 1;

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const norm = (pseudo) => pseudo.normalize('NFKC').trim().toLowerCase();
const publicOf = (u) => ({ id: u.id, pseudo: u.pseudo, games: u.games, wins: u.wins, createdAt: u.createdAt });

export function createAccounts({ file = null, now = () => Date.now() } = {}) {
  /** id → { id, pseudo, salt, hash, createdAt, games, wins } */
  const users = new Map();
  const byPseudo = new Map();
  /** empreinte du jeton → { id, exp } */
  const sessions = new Map();
  let timer = null;

  if (file) {
    try {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (d && d.v === VERSION) {
        for (const u of d.users ?? []) { users.set(u.id, u); byPseudo.set(norm(u.pseudo), u.id); }
        for (const s of d.sessions ?? []) if (users.has(s.id) && s.exp > now()) sessions.set(s.h, { id: s.id, exp: s.exp });
      }
    } catch (err) {
      if (err && err.code !== 'ENOENT') { try { fs.renameSync(file, `${file}.abime`); } catch { /* tant pis */ } }
    }
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!file) return;
    const data = { v: VERSION, users: [...users.values()], sessions: [...sessions].map(([h, s]) => ({ h, ...s })) };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  const dirty = () => { if (file && !timer) { timer = setTimeout(() => { try { flush(); } catch { /* le prochain essai réécrira */ } }, 500); timer.unref?.(); } };

  const hashPw = async (pw, salt) => (await scrypt(pw, Buffer.from(salt, 'hex'), 32, SCRYPT)).toString('hex');
  const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  // Faux hachage pour qu'un pseudo inconnu coûte le même temps qu'un mauvais mot de passe (pas d'énumération des comptes par le temps de réponse).
  const dummySalt = crypto.randomBytes(16).toString('hex');

  function newSession(id) {
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(sha(token), { id, exp: now() + SESSION_TTL_MS });
    return token;
  }

  return {
    get count() { return users.size; },

    async register(pseudo, password) {
      if (typeof pseudo !== 'string' || typeof password !== 'string') return { error: 'Requête invalide.' };
      const clean = pseudo.normalize('NFKC').trim().replace(/\s+/g, ' ');
      if (!PSEUDO.test(clean)) return { error: 'Pseudo de 3 à 16 caractères : lettres, chiffres, espace, tiret, point ou soulignement.' };
      if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) return { error: `Mot de passe de ${MIN_PASSWORD} à ${MAX_PASSWORD} caractères.` };
      if (byPseudo.has(norm(clean))) return { error: 'Ce pseudo est déjà pris.', conflict: true };
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = await hashPw(password, salt);
      if (byPseudo.has(norm(clean))) return { error: 'Ce pseudo est déjà pris.', conflict: true }; // pris pendant le calcul
      const user = { id: crypto.randomUUID(), pseudo: clean, salt, hash, createdAt: now(), games: 0, wins: 0 };
      users.set(user.id, user); byPseudo.set(norm(clean), user.id);
      const token = newSession(user.id);
      dirty();
      return { token, account: publicOf(user) };
    },

    async login(pseudo, password) {
      if (typeof pseudo !== 'string' || typeof password !== 'string' || password.length > MAX_PASSWORD) return { error: 'Pseudo ou mot de passe incorrect.' };
      const user = users.get(byPseudo.get(norm(pseudo)) ?? '');
      const hash = await hashPw(password, user ? user.salt : dummySalt);
      if (!user || !same(hash, user.hash)) return { error: 'Pseudo ou mot de passe incorrect.' };
      const token = newSession(user.id);
      dirty();
      return { token, account: publicOf(user) };
    },

    /** Compte lié à un jeton de session, ou null (inconnu, expiré). */
    resolve(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
      const s = sessions.get(sha(token));
      if (!s) return null;
      if (s.exp <= now()) { sessions.delete(sha(token)); dirty(); return null; }
      const u = users.get(s.id);
      return u ? publicOf(u) : null;
    },

    logout(token) { if (typeof token === 'string' && sessions.delete(sha(token))) dirty(); },

    /** Supprime le compte (et ses sessions) après vérification du mot de passe. */
    async remove(token, password) {
      const acct = this.resolve(token);
      if (!acct || typeof password !== 'string') return { error: 'Non connecté.' };
      const u = users.get(acct.id);
      if (!u || !same(await hashPw(password, u.salt), u.hash)) return { error: 'Mot de passe incorrect.' };
      users.delete(u.id); byPseudo.delete(norm(u.pseudo));
      for (const [h, s] of sessions) if (s.id === u.id) sessions.delete(h);
      dirty();
      return { ok: true };
    },

    /** Compte une partie terminée pour ce compte. */
    record(id, won) {
      const u = users.get(id);
      if (!u) return;
      u.games += 1; if (won) u.wins += 1;
      dirty();
    },

    /** Classement : victoires, puis taux de victoire. Seuls les comptes ayant joué y figurent. */
    leaderboard(limit = 20) {
      return [...users.values()].filter((u) => u.games > 0)
        .sort((a, b) => b.wins - a.wins || b.wins / b.games - a.wins / a.games || a.games - b.games || a.pseudo.localeCompare(b.pseudo))
        .slice(0, Math.max(1, Math.min(100, limit)))
        .map((u, i) => ({ rank: i + 1, pseudo: u.pseudo, games: u.games, wins: u.wins }));
    },

    sweep() { const t = now(); for (const [h, s] of sessions) if (s.exp <= t) sessions.delete(h); },
    flush,
  };
}
