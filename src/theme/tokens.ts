import type { ThemeMode } from '@/domain';

/**
 * Palette « tarot macabre », tirée des illustrations de rôles (assets/icons) : trait crème parchemin sur des fonds
 * vert / violet / bordeaux nuit, avec un seul accent, le rouge sang. Rien d'autre : pas d'or, pas de vert vif.
 */
export interface Palette {
  /** Fond de page, halo central et vignette (dégradé radial). */
  readonly bg: string; readonly glow: string; readonly vignette: string;
  /** Surfaces : cartes, surface alternative (modales, violet nuit) et surface en relief (sélection). */
  readonly panel: string; readonly panelAlt: string; readonly raised: string;
  /** Traits : filet discret et trait appuyé (cadres, boutons). */
  readonly line: string; readonly lineStrong: string;
  /** Couleur de trait/texte d'accent (crème en nuit, encre en parchemin) et texte posé sur un aplat d'accent. */
  readonly accent: string; readonly accentSoft: string; readonly onAccent: string;
  /** Texte courant et atténué. */
  readonly text: string; readonly muted: string;
  /** Parchemin (carte secrète, pastilles) et encre posée dessus. */
  readonly paper: string; readonly paperShade: string; readonly ink: string; readonly inkSoft: string;
  /** Rouge sang : aplats et traits (`blood`), texte lisible sur le fond (`bloodHi`), ombre (`bloodDeep`). */
  readonly blood: string; readonly bloodHi: string; readonly bloodDeep: string;
  /** Hachures décoratives, voile des modales, ombre portée. */
  readonly hatch: string; readonly overlay: string; readonly shadow: string;
}

export const palettes: Readonly<Record<ThemeMode, Palette>> = {
  /** « Nuit » : thème par défaut. */
  dark: {
    bg: '#0b100e', glow: '#18241f', vignette: '#050807',
    panel: '#0e1613', panelAlt: '#17101f', raised: '#1a2822',
    line: 'rgba(217,204,176,0.30)', lineStrong: 'rgba(217,204,176,0.70)',
    accent: '#d9ccb0', accentSoft: 'rgba(217,204,176,0.55)', onAccent: '#0e1613',
    text: '#e4dac0', muted: '#a39b85',
    paper: '#d9ccb0', paperShade: '#b9ac8e', ink: '#0e1613', inkSoft: '#3c3a31',
    blood: '#8f1d27', bloodHi: '#cc4552', bloodDeep: '#3a0a10',
    hatch: 'rgba(217,204,176,0.13)', overlay: 'rgba(4,6,5,0.82)', shadow: 'rgba(0,0,0,0.65)',
  },
  /** « Parchemin » : la même gravure à l'encre sur papier ; les cartes de rôle restent sombres, comme posées sur la table. */
  light: {
    bg: '#d5c8a9', glow: '#e8dec4', vignette: '#bfb08a',
    panel: '#e3d9c0', panelAlt: '#ddd1b4', raised: '#eee6d0',
    line: 'rgba(14,22,19,0.38)', lineStrong: 'rgba(14,22,19,0.78)',
    accent: '#0e1613', accentSoft: 'rgba(14,22,19,0.6)', onAccent: '#eee6d0',
    text: '#16130e', muted: '#575040',
    paper: '#e8dfc6', paperShade: '#c9bd9c', ink: '#0e1613', inkSoft: '#3c3a31',
    blood: '#8f1d27', bloodHi: '#8f1d27', bloodDeep: '#5a1018',
    hatch: 'rgba(14,22,19,0.10)', overlay: 'rgba(24,18,10,0.62)', shadow: 'rgba(40,28,10,0.35)',
  },
};

/** Couleurs des illustrations : identiques dans les deux thèmes (ce sont des cartes imprimées). */
export const ART = {
  green: '#0e1613', violet: '#17101f', burgundy: '#240a0d', cream: '#d9ccb0', blood: '#8f1d27', bone: '#f1e8d0',
} as const;

/** `label` : capitales géométriques grasses (Outfit), comme le lettrage des cartouches des illustrations ; petits libellés espacés. */
export const fonts = { body: 'CourierPrime', bold: 'CourierPrime-Bold', italic: 'CourierPrime-Italic', title: 'Sirelia', label: 'Outfit-Bold' } as const;
/** Coins presque droits, comme les cadres gravés. */
export const radius = { sm: 2, md: 3 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
