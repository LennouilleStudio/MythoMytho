/**
 * Petit bus d'événements : l'écran de jeu appelle `bleed()` à chaque élimination, le fond (Backdrop) fait alors couler
 * une nouvelle série de gouttes de sang ; `bleedReset()` les efface (nouvelle manche).
 */
type Listener = (kind: 'add' | 'reset') => void;
const listeners = new Set<Listener>();

export const onBleed = (fn: Listener): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const bleed = (): void => listeners.forEach((l) => l('add'));
export const bleedReset = (): void => listeners.forEach((l) => l('reset'));
