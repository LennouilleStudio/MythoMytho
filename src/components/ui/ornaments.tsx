import React, { useId, useState } from 'react';
import { Animated, Easing, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, Path, Pattern, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/tokens';
import { NATIVE, useReducedMotion } from './motion';

/* Vocabulaire graphique des illustrations de rôles : hachures à 45°, double cadre, étoiles à quatre branches,
   gouttes de sang effilées terminées par une perle, craquelures rouges, cartouches à lettres espacées. */

export const safeId = (raw: string): string => `mm${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;

const FILL: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' };

/**
 * Garde-fou pour les décors SVG : si `react-native-svg` échoue à dessiner un élément (différences entre plateformes),
 * le décor disparaît au lieu de faire tomber toute l'application.
 */
export class Safe extends React.Component<{ children?: React.ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  override componentDidCatch(error: unknown): void { console.warn('Décor SVG ignoré :', error); }
  override render(): React.ReactNode { return this.state.failed ? null : this.props.children; }
}

/** Étoile à quatre branches (24 × 24). */
export const SPARK_PATH = 'M12 1C12.8 7 17 11.2 23 12C17 12.8 12.8 17 12 23C11.2 17 7 12.8 1 12C7 11.2 11.2 7 12 1Z';

export function Sparkle({ size = 10, color }: { size?: number; color: string }): React.JSX.Element {
  return <Safe><Svg width={size} height={size} viewBox="0 0 24 24"><Path d={SPARK_PATH} fill={color} /></Svg></Safe>;
}

/** Point de croix (✕ cousu), pour cases cochées et cartes écartées. */
export function Stitch({ size = 14, color, width = 2.4 }: { size?: number; color: string; width?: number }): React.JSX.Element {
  return (
    <Safe>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round">
        <Path d="M5 5L19 19M19 5L5 19" />
      </Svg>
    </Safe>
  );
}

/**
 * Trois traits pour une tuile de hachures « / » sans aucune transformation (un `patternTransform` en chaîne fait échouer
 * `react-native-svg` sur le web) : la diagonale du carreau et deux demi-diagonales qui raccordent les coins.
 */
export function HatchLines({ gap, color, width, opacity }: { gap: number; color: string; width: number; opacity?: number }): React.JSX.Element {
  const h = gap / 2;
  return (
    <>
      <Line x1={0} y1={gap} x2={gap} y2={0} stroke={color} strokeWidth={width} opacity={opacity} />
      <Line x1={-h} y1={h} x2={h} y2={-h} stroke={color} strokeWidth={width} opacity={opacity} />
      <Line x1={h} y1={gap + h} x2={gap + h} y2={h} stroke={color} strokeWidth={width} opacity={opacity} />
    </>
  );
}

/** Hachures diagonales qui remplissent le parent (texture des illustrations). */
export function Hatch({ color, gap = 6, width = 1, style }: {
  color: string; gap?: number; width?: number; style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const id = safeId(useId());
  return (
    <Safe>
      <Svg width="100%" height="100%" style={[FILL, style]}>
        <Defs>
          <Pattern id={id} patternUnits="userSpaceOnUse" width={gap} height={gap}>
            <HatchLines gap={gap} color={color} width={width} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </Safe>
  );
}

/** Ligne en tirets (4 / 6, comme les rayons pointillés des illustrations). */
export function DashLine({ color, style }: { color: string; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  return (
    <Safe>
      <Svg width="100%" height={2} style={[{ flex: 1, minWidth: 8 }, style]}>
        <Line x1={0} y1={1} x2="100%" y2={1} stroke={color} strokeWidth={1} strokeDasharray="4 6" strokeLinecap="round" />
      </Svg>
    </Safe>
  );
}

/** Séparateur : tirets, étoile, tirets. */
export function Divider({ sparkle = true, style }: { sparkle?: boolean; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>
      <DashLine color={colors.line} />
      {sparkle ? <Sparkle size={11} color={colors.accentSoft} /> : null}
      <DashLine color={colors.line} />
    </View>
  );
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DripSpec { readonly x: number; readonly len: number; readonly w: number; readonly drop: number }

/** Gouttes déterministes (même graine, mêmes gouttes) réparties sur une largeur. */
export function makeDrips(width: number, seed: number, count: number, minLen: number, maxLen: number): DripSpec[] {
  const rand = rng(seed);
  const margin = Math.min(24, width * 0.08);
  const span = Math.max(0, width - margin * 2);
  return Array.from({ length: count }, (_, i) => ({
    x: margin + ((i + 0.15 + rand() * 0.7) / count) * span,
    len: minLen + rand() * (maxLen - minLen),
    w: 1.8 + rand() * 1.6,
    drop: rand() > 0.22 ? 2.6 + rand() * 1.6 : 0,
  }));
}

/** Tracé SVG (path) d'une série de gouttes effilées ; les perles sont des cercles à part. */
export function dripPath(drips: readonly DripSpec[], y0 = 0): string {
  return drips.map((d) => `M${(d.x - d.w).toFixed(1)} ${y0}L${(d.x + d.w).toFixed(1)} ${y0}L${(d.x + 0.4).toFixed(1)} ${(y0 + d.len).toFixed(1)}L${(d.x - 0.4).toFixed(1)} ${(y0 + d.len).toFixed(1)}Z`).join('');
}

export function DripShapes({ drips, color, y0 = 0 }: { drips: readonly DripSpec[]; color: string; y0?: number }): React.JSX.Element {
  return (
    <>
      <Path d={dripPath(drips, y0)} fill={color} />
      {drips.filter((d) => d.drop > 0).map((d, i) => <Circle key={i} cx={d.x} cy={y0 + d.len + d.drop * 0.7} r={d.drop} fill={color} />)}
    </>
  );
}

/** Craquelure rouge (ligne brisée + perles), posée dans un coin. */
export function CrackShape({ points, color }: { points: ReadonlyArray<readonly [number, number]>; color: string }): React.JSX.Element {
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');
  const last = points[points.length - 1] ?? [0, 0];
  const first = points[0] ?? [0, 0];
  return (
    <>
      <Path d={d} stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last[0]} cy={last[1]} r={2} fill={color} />
      <Circle cx={first[0]} cy={first[1]} r={1.6} fill={color} />
    </>
  );
}

/** Grain de papier : poussière et fibres déterministes, en deux tracés seulement (léger même sur mobile). */
export function grainPaths(w: number, h: number, seed: number, density = 1): { dots: string; fibres: string } {
  const rand = rng(seed);
  const n = Math.max(30, Math.min(520, Math.round(((w * h) / 900) * density)));
  let dots = ''; let fibres = '';
  for (let i = 0; i < n; i++) dots += `M${(rand() * w).toFixed(1)} ${(rand() * h).toFixed(1)}h.1`;
  for (let i = 0; i < Math.round(n / 14); i++) {
    const x = rand() * w; const y = rand() * h; const a = rand() * Math.PI; const l = 6 + rand() * 14;
    fibres += `M${x.toFixed(1)} ${y.toFixed(1)}l${(Math.cos(a) * l).toFixed(1)} ${(Math.sin(a) * l).toFixed(1)}`;
  }
  return { dots, fibres };
}

export function Grain({ w, h, color, seed = 3, density = 1, opacity = 0.2 }: { w: number; h: number; color: string; seed?: number; density?: number; opacity?: number }): React.JSX.Element {
  const g = React.useMemo(() => grainPaths(w, h, seed, density), [w, h, seed, density]);
  return (
    <>
      <Path d={g.dots} stroke={color} strokeWidth={1.3} strokeLinecap="round" opacity={opacity} fill="none" />
      <Path d={g.fibres} stroke={color} strokeWidth={0.6} strokeLinecap="round" opacity={opacity * 0.55} fill="none" />
    </>
  );
}

/**
 * Gouttes de sang qui coulent : la série pousse vers le bas à l'apparition (échelle verticale depuis le bord haut),
 * sauf si le système demande de réduire les animations.
 */
export function DripLayer({ width, seed, count, minLen = 14, maxLen = 44, color, top = 0, delay = 0 }: {
  width: number; seed: number; count: number; minLen?: number; maxLen?: number; color: string; top?: number; delay?: number;
}): React.JSX.Element | null {
  const reduce = useReducedMotion();
  const grow = React.useRef(new Animated.Value(reduce ? 1 : 0.001)).current;
  const drips = React.useMemo(() => makeDrips(width, seed, count, minLen, maxLen), [width, seed, count, minLen, maxLen]);
  const H = maxLen + 14;
  React.useEffect(() => {
    if (reduce) { grow.setValue(1); return; }
    grow.setValue(0.001);
    const a = Animated.timing(grow, { toValue: 1, duration: 1100, delay, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE });
    a.start();
    return () => a.stop();
  }, [reduce, grow, delay, seed]);
  if (width <= 0) return null;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top, left: 0, width, height: H, transform: [{ translateY: -H / 2 }, { scaleY: grow }, { translateY: H / 2 }] }}>
      <Safe><Svg width={width} height={H}><DripShapes drips={drips} color={color} /></Svg></Safe>
    </Animated.View>
  );
}

/** Cartouche : étiquette en capitales espacées dans un cadre (comme « CIVIL » au pied des cartes). */
export function Plaque({ label, bg, size = 10.5, tone = 'accent', mirrored, style, textStyle }: {
  label: string; bg?: string; size?: number; tone?: 'accent' | 'blood' | 'muted'; mirrored?: boolean;
  style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const c = tone === 'blood' ? colors.bloodHi : tone === 'muted' ? colors.muted : colors.accent;
  const border = tone === 'blood' ? colors.blood : tone === 'muted' ? colors.line : colors.lineStrong;
  return (
    <View style={[{ alignSelf: 'flex-start', backgroundColor: bg ?? colors.panel, borderWidth: 1.5, borderColor: border, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: 11, transform: [{ rotate: mirrored ? '180deg' : '0deg' }] }, style]}>
      <Text numberOfLines={1} style={[{ color: c, fontFamily: fonts.label, fontSize: size, letterSpacing: size * 0.2, textTransform: 'uppercase' }, textStyle]}>{label}</Text>
    </View>
  );
}

/**
 * Parchemin vivant : bord effiloché, assombrissement des angles ; en version `full`, deux plis croisés (trait sombre + reflet clair)
 * et des taches rondes à anneau, comme du papier longtemps plié.
 */
function Aging({ w, h, id, seed, full }: { w: number; h: number; id: string; seed: number; full: boolean }): React.JSX.Element {
  const m = React.useMemo(() => {
    const rand = rng(seed * 7 + 1);
    const pts: string[] = [];
    const step = 11; const e = 1.6;
    const j = (): number => (rand() - 0.5) * 2.4;
    for (let x = 0; x <= w; x += step) pts.push(`${x.toFixed(1)},${(e + j()).toFixed(1)}`);
    for (let y = 0; y <= h; y += step) pts.push(`${(w - e + j()).toFixed(1)},${y.toFixed(1)}`);
    for (let x = w; x >= 0; x -= step) pts.push(`${x.toFixed(1)},${(h - e + j()).toFixed(1)}`);
    for (let y = h; y >= 0; y -= step) pts.push(`${(e + j()).toFixed(1)},${y.toFixed(1)}`);
    const vx = w * (0.46 + rand() * 0.1); const hy = h * (0.36 + rand() * 0.12);
    return { edge: pts.join(' '), vx, hy, s1: { x: w * (0.7 + rand() * 0.12), y: h * (0.22 + rand() * 0.1), r: Math.min(w, h) * (0.13 + rand() * 0.04) }, s2: { x: w * (0.2 + rand() * 0.1), y: h * (0.72 + rand() * 0.1), r: Math.min(w, h) * 0.07 } };
  }, [w, h, seed]);
  const k = full ? 1 : 0.55;
  return (
    <>
      <Defs>
        <RadialGradient id={`${id}a`} cx={w / 2} cy={h / 2} r={Math.hypot(w, h) / 2} gradientUnits="userSpaceOnUse">
          <Stop offset="0.6" stopColor="#5f4119" stopOpacity={0} />
          <Stop offset="1" stopColor="#5f4119" stopOpacity={0.3 * k} />
        </RadialGradient>
        <RadialGradient id={`${id}s`} gradientUnits="objectBoundingBox" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#78501a" stopOpacity={0.15} />
          <Stop offset="0.8" stopColor="#78501a" stopOpacity={0.07} />
          <Stop offset="1" stopColor="#78501a" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#${id}a)`} />
      <Polygon points={m.edge} fill="none" stroke="rgba(60,40,15,0.28)" strokeWidth={0.9} />
      {full ? (
        <>
          <Path d={`M${m.vx} 3Q${m.vx + 7} ${h / 2} ${m.vx - 4} ${h - 3}`} stroke="rgba(60,40,15,0.22)" strokeWidth={1.2} fill="none" />
          <Path d={`M${m.vx + 1.6} 3Q${m.vx + 8.6} ${h / 2} ${m.vx - 2.4} ${h - 3}`} stroke="rgba(255,250,235,0.5)" strokeWidth={1} fill="none" />
          <Path d={`M3 ${m.hy}Q${w / 2} ${m.hy + 6} ${w - 3} ${m.hy - 3}`} stroke="rgba(60,40,15,0.2)" strokeWidth={1.2} fill="none" />
          <Path d={`M3 ${m.hy + 1.6}Q${w / 2} ${m.hy + 7.6} ${w - 3} ${m.hy - 1.4}`} stroke="rgba(255,250,235,0.45)" strokeWidth={1} fill="none" />
          <Circle cx={m.s1.x} cy={m.s1.y} r={m.s1.r} fill={`url(#${id}s)`} />
          <Circle cx={m.s1.x} cy={m.s1.y} r={m.s1.r * 0.82} fill="none" stroke="rgba(120,80,25,0.16)" strokeWidth={1.2} />
          <Circle cx={m.s2.x} cy={m.s2.y} r={m.s2.r} fill={`url(#${id}s)`} />
        </>
      ) : null}
    </>
  );
}

/**
 * Cadre gravé : double filet, étoiles aux angles, hachures dans deux coins opposés, gouttes de sang en option.
 * Le contenu est posé par-dessus ; l'appelant fournit le rembourrage (≥ 18) pour rester à l'intérieur du filet.
 */
export function Frame({ children, style, bg, stroke, soft, accent, hatch = true, drips = false, seed = 7, dripCount, dripMax = 44, corners = true, crack = false, grain, aged }: {
  children?: React.ReactNode; style?: StyleProp<ViewStyle>; bg?: string; stroke?: string; soft?: string; accent?: string;
  hatch?: boolean; drips?: boolean; seed?: number; dripCount?: number; dripMax?: number; corners?: boolean; crack?: boolean;
  /** Grain de papier (couleur du grain) : parchemin imprimé. */ grain?: string;
  /** Vieillissement du parchemin : `light` (bord effiloché, angles assombris) ou `full` (plis, taches). Par défaut `light` en thème parchemin. */ aged?: 'light' | 'full' | false;
}): React.JSX.Element {
  const { colors, mode } = useTheme();
  const id = safeId(useId());
  const age = aged === undefined ? (mode === 'light' ? 'light' : false) : aged;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent): void => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (Math.abs(b.w - width) < 0.5 && Math.abs(b.h - height) < 0.5 ? b : { w: width, h: height }));
  };
  const { w, h } = box;
  const outer = stroke ?? colors.lineStrong;
  const inner = soft ?? colors.line;
  const mark = accent ?? colors.accentSoft;
  const IN = 6;
  const t = Math.max(0, Math.min(64, w * 0.22, h * 0.4));
  return (
    <View onLayout={onLayout} style={[{ backgroundColor: bg ?? colors.panel, borderRadius: radius.sm }, style]}>
      {w > 0 ? (
        <Safe><Svg width={w} height={h} style={FILL}>
          <Defs>
            <Pattern id={id} patternUnits="userSpaceOnUse" width={5} height={5}>
              <HatchLines gap={5} color={colors.hatch} width={1.1} />
            </Pattern>
          </Defs>
          {hatch && t > 12 ? (
            <>
              <Polygon points={`${IN},${IN} ${IN + t},${IN} ${IN},${IN + t}`} fill={`url(#${id})`} />
              <Polygon points={`${w - IN},${h - IN} ${w - IN - t},${h - IN} ${w - IN},${h - IN - t}`} fill={`url(#${id})`} />
            </>
          ) : null}
          {age ? <Aging w={w} h={h} id={id} seed={seed} full={age === 'full'} /> : null}
          <Rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={2} fill="none" stroke={outer} strokeWidth={1.5} />
          <Rect x={IN + 0.5} y={IN + 0.5} width={w - IN * 2 - 1} height={h - IN * 2 - 1} fill="none" stroke={inner} strokeWidth={1} />
          {corners ? [[IN + 9, IN + 9], [w - IN - 9, IN + 9], [IN + 9, h - IN - 9], [w - IN - 9, h - IN - 9]].map((p, i) => (
            <Path key={i} d={SPARK_PATH} fill={mark} transform={`translate(${(p[0] as number) - 4.5} ${(p[1] as number) - 4.5}) scale(${9 / 24})`} />
          )) : null}
          {crack ? <CrackShape color={colors.blood} points={[[w - 2, h * 0.62], [w - 20, h * 0.66], [w - 28, h * 0.74], [w - 46, h * 0.77]]} /> : null}
          {grain ? <Grain w={w} h={h} color={grain} seed={seed + 1} opacity={0.3} /> : null}
        </Svg></Safe>
      ) : null}
      {drips && w > 0 ? <DripLayer width={w} seed={seed} count={dripCount ?? Math.max(2, Math.round(w / 90))} maxLen={dripMax} color={colors.blood} /> : null}
      {children}
    </View>
  );
}
