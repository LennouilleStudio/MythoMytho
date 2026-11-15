/**
 * Ambiance du fond selon la phase : l'écran de jeu l'annonce, le fond (Backdrop) change de halo en fondu.
 * `green` distribution des cartes, `violet` discussion, `burgundy` vote ; `none` : halo par défaut (configuration, scores).
 */
export type Ambience = 'none' | 'green' | 'violet' | 'burgundy';
type Listener = (a: Ambience) => void;

const listeners = new Set<Listener>();
let current: Ambience = 'none';

export const getAmbience = (): Ambience => current;
export const setAmbience = (a: Ambience): void => { if (a === current) return; current = a; listeners.forEach((l) => l(a)); };
export const onAmbience = (fn: Listener): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Teinte du halo (nuit, parchemin). */
export const HALO: Readonly<Record<Exclude<Ambience, 'none'>, { dark: string; light: string }>> = {
  green: { dark: '#1d3a2e', light: '#cfe0bf' },
  violet: { dark: '#33204a', light: '#dccbe0' },
  burgundy: { dark: '#4a1219', light: '#efc7b8' },
};
