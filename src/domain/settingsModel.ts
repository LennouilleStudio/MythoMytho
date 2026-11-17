import { maxImpostors } from './balance';
import { AUTO_HIDE_CHOICES, MAX_PLAYERS, MIN_PLAYERS, TIMER_MAX_MINUTES, TIMER_MIN_MINUTES } from './constants';
import { clamp } from './text';
import { SPECIAL_KEYS, type Difficulty, type GameSettings, type PrivacyMode, type SpecialRolesConfig } from './types';

/* Réglages par défaut et relecture tolérante : TypeScript pur, partagé par l'application et le serveur de parties en ligne. */

const NO_ROLES = Object.fromEntries(SPECIAL_KEYS.map((k) => [k, false])) as unknown as SpecialRolesConfig;

export const defaultSettings: GameSettings = {
  playerCount: 6, undercoverCount: 1, mrWhiteCount: 0, espionCount: 0, autoUndercover: true,
  roles: NO_ROLES, selectedThemes: { classique: true }, difficulty: 0, difficultyLevel: 2,
  privacy: 'standard', autoHideSec: 8, showRole: true, timerEnabled: false, timerDurationMin: 3, timerSound: true, effects: true,
};

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/** Relecture tolérante des réglages (y compris ceux enregistrés par l'ancienne PWA). */
export function sanitizeSettings(raw: unknown, timerRaw?: unknown): GameSettings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const t = (typeof timerRaw === 'object' && timerRaw !== null ? timerRaw : {}) as Record<string, unknown>;
  const d = defaultSettings;
  const rolesRaw = (typeof o.roles === 'object' && o.roles !== null ? o.roles : {}) as Record<string, unknown>;
  const roles = Object.fromEntries(SPECIAL_KEYS.map((k) => [k, bool(rolesRaw[k], false)])) as unknown as SpecialRolesConfig;
  const themesRaw = (typeof o.selectedThemes === 'object' && o.selectedThemes !== null ? o.selectedThemes : {}) as Record<string, unknown>;
  const themes: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(themesRaw)) if (v === true) themes[k] = true;
  const privacy: PrivacyMode = o.privacy === 'auto' || o.privacy === 'hold' ? o.privacy : 'standard';
  const diff = num(o.difficulty, 0);
  const level = num(o.difficultyLevel, 2);
  const playerCount = clamp(Math.round(num(o.playerCount, d.playerCount)), MIN_PLAYERS, MAX_PLAYERS);
  return {
    playerCount,
    undercoverCount: clamp(Math.round(num(o.undercoverCount, 1)), 1, maxImpostors(playerCount)),
    mrWhiteCount: clamp(Math.round(num(o.mrWhiteCount, 0)), 0, 5),
    espionCount: clamp(Math.round(num(o.espionCount, 0)), 0, 5),
    autoUndercover: bool(o.autoUndercover, true),
    roles,
    selectedThemes: Object.keys(themes).length > 0 ? themes : d.selectedThemes,
    difficulty: diff === 1 || diff === 2 || diff === 3 ? diff : 0,
    difficultyLevel: (level === 1 || level === 3 ? level : 2) as Difficulty,
    privacy,
    autoHideSec: (AUTO_HIDE_CHOICES as readonly number[]).includes(num(o.autoHideSec, 8)) ? num(o.autoHideSec, 8) : 8,
    showRole: bool(o.showRole, true),
    timerEnabled: bool(t.enabled ?? o.timerEnabled, false),
    timerDurationMin: clamp(Math.round(num(t.durationMin ?? t.duration ?? o.timerDurationMin, 3)), TIMER_MIN_MINUTES, TIMER_MAX_MINUTES),
    timerSound: bool(t.sound ?? o.timerSound, true),
    effects: bool(o.effects, true),
  };
}
