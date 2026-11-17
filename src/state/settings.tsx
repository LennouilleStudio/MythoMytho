import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  MAX_PLAYERS, MIN_PLAYERS, STORAGE_KEYS, clamp, defaultSettings, maxImpostors, recommendedUndercovers, sanitizeSettings,
  type Difficulty, type GameSettings, type SpecialKey,
} from '@/domain';
import { loadJson, saveJson } from '@/services/storage';

export { defaultSettings, sanitizeSettings };

export type SettingsAction =
  | { type: 'HYDRATE'; value: GameSettings }
  | { type: 'SET_PLAYERS'; value: number }
  | { type: 'SET_COUNT'; key: 'undercoverCount' | 'mrWhiteCount' | 'espionCount'; value: number }
  | { type: 'SET_AUTO_UNDERCOVER'; value: boolean }
  | { type: 'TOGGLE_ROLE'; key: SpecialKey }
  | { type: 'TOGGLE_THEME'; key: string }
  | { type: 'SET_DIFFICULTY'; value: 0 | Difficulty }
  | { type: 'PATCH'; value: Partial<GameSettings> };

/** Recalcule l'Undercover conseillé si le mode automatique est actif, puis borne les compteurs. */
function normalize(s: GameSettings): GameSettings {
  const cap = maxImpostors(s.playerCount);
  const undercoverCount = s.autoUndercover ? recommendedUndercovers(s) : clamp(s.undercoverCount, 1, cap);
  const mrWhiteCount = clamp(s.mrWhiteCount, 0, Math.max(0, cap - undercoverCount));
  const espionCount = clamp(s.espionCount, 0, Math.max(0, cap - undercoverCount - mrWhiteCount));
  return { ...s, undercoverCount, mrWhiteCount, espionCount };
}

export function settingsReducer(s: GameSettings, a: SettingsAction): GameSettings {
  switch (a.type) {
    case 'HYDRATE': return normalize(a.value);
    case 'SET_PLAYERS': return normalize({ ...s, playerCount: clamp(a.value, MIN_PLAYERS, MAX_PLAYERS) });
    case 'SET_COUNT': return normalize({ ...s, [a.key]: Math.max(0, a.value), autoUndercover: a.key === 'undercoverCount' ? false : s.autoUndercover });
    case 'SET_AUTO_UNDERCOVER': return normalize({ ...s, autoUndercover: a.value });
    case 'TOGGLE_ROLE': return normalize({ ...s, roles: { ...s.roles, [a.key]: !s.roles[a.key] } });
    case 'TOGGLE_THEME': {
      const next = { ...s.selectedThemes };
      if (next[a.key]) delete next[a.key]; else next[a.key] = true;
      return Object.keys(next).length === 0 ? s : { ...s, selectedThemes: next }; // au moins un thème
    }
    case 'SET_DIFFICULTY':
      return { ...s, difficulty: a.value, difficultyLevel: a.value === 0 ? s.difficultyLevel : a.value };
    case 'PATCH': return normalize({ ...s, ...a.value });
  }
}

interface SettingsValue { readonly settings: GameSettings; readonly dispatch: React.Dispatch<SettingsAction>; readonly ready: boolean }
const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [settings, dispatch] = useReducer(settingsReducer, defaultSettings);
  const ready = useRef(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    void (async () => {
      const raw = await loadJson<unknown>(STORAGE_KEYS.options, (r) => r, null);
      const timer = await loadJson<unknown>(STORAGE_KEYS.timer, (r) => r, null);
      dispatch({ type: 'HYDRATE', value: sanitizeSettings(raw, timer) });
      ready.current = true;
      setTick((n) => n + 1);
    })();
  }, []);

  useEffect(() => {
    if (!ready.current) return;
    void saveJson(STORAGE_KEYS.options, settings);
    void saveJson(STORAGE_KEYS.timer, { enabled: settings.timerEnabled, durationMin: settings.timerDurationMin, sound: settings.timerSound });
  }, [settings]);

  const value = useMemo(() => ({ settings, dispatch, ready: ready.current }), [settings]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const v = useContext(SettingsContext);
  if (!v) throw new Error('useSettings doit être utilisé sous <SettingsProvider>');
  return v;
}

/** Raccourci : actions courantes sans manipuler le dispatch. */
export function useSettingsActions(): {
  setPlayers(n: number): void; setCount(k: 'undercoverCount' | 'mrWhiteCount' | 'espionCount', n: number): void;
  toggleRole(k: SpecialKey): void; toggleTheme(k: string): void; patch(p: Partial<GameSettings>): void;
  setAutoUndercover(b: boolean): void; setDifficulty(d: 0 | Difficulty): void;
} {
  const { dispatch } = useSettings();
  return useMemo(() => ({
    setPlayers: (value) => dispatch({ type: 'SET_PLAYERS', value }),
    setCount: (key, value) => dispatch({ type: 'SET_COUNT', key, value }),
    toggleRole: (key) => dispatch({ type: 'TOGGLE_ROLE', key }),
    toggleTheme: (key) => dispatch({ type: 'TOGGLE_THEME', key }),
    patch: (value) => dispatch({ type: 'PATCH', value }),
    setAutoUndercover: (value) => dispatch({ type: 'SET_AUTO_UNDERCOVER', value }),
    setDifficulty: (value) => dispatch({ type: 'SET_DIFFICULTY', value }),
  }), [dispatch]);
}
