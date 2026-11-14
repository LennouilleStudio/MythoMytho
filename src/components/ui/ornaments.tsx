import React, { useId, useState } from 'react';
import { Animated, Easing, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, Path, Pattern, Polygon, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/tokens';
import { NATIVE, useReducedMotion } from './motion';

/* Vocabulaire graphique des illustrations de rôles : hachures à 45°, double cadre, étoiles à quatre branches,
   gouttes de sang effilées terminées par une perle, craquelures rouges, cartouches à lettres espacées. */

export const safeId = (raw: string): string => `mm${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;

const FILL: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' };

/** Étoile à quatre branches (24 × 24). */
export const SPARK_PATH = 'M12 1C12.8 7 17 11.2 23 12C17 12.8 12.8 17 12 23C11.2 17 7 12.8 1 12C7 11.2 11.2 7 12 1Z';

export function Sparkle({ size = 10, color }: { size?: number; color: string }): React.JSX.Element {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d={SPARK_PATH} fill={color} /></Svg>;
}

/** Point de croix (✕ cousu), pour cases cochées et cartes écartées. */
export function Stitch({ size = 14, color, width = 2.4 }: { size?: number; color: string; width?: number }): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round">
      <Path d="M5 5L19 19M19 5L5 19" />
    </Svg>
  );
}

/** Hachures diagonales qui remplissent le parent (texture des illustrations). */
export function Hatch({ color, gap = 6, width = 1, angle = 45, style }: {
  color: string; gap?: number; width?: number; angle?: number; style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const id = safeId(useId());
  return (
    <Svg width="100%" height="100%" style={[FILL, style]}>
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={gap} height={gap} patternTransform={`rotate(${angle})`}>
          <Line x1={0} y1={0} x2={0} y2={gap} stroke={color} strokeWidth={width} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** Ligne en tirets (4 / 6, comme les rayons pointillés des illustrations). */
export function DashLine({ color, style }: { color: string; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  return (
    <Svg width="100%" height={2} style={[{ flex: 1, minWidth: 8 }, style]}>
      <Line x1={0} y1={1} x2="100%" y2={1} stroke={color} strokeWidth={1} strokeDasharray="4 6" strokeLinecap="round" />
    </Svg>
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
      <Svg width={width} height={H}><DripShapes drips={drips} color={color} /></Svg>
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
 * Cadre gravé : double filet, étoiles aux angles, hachures dans deux coins opposés, gouttes de sang en option.
 * Le contenu est posé par-dessus ; l'appelant fournit le rembourrage (≥ 18) pour rester à l'intérieur du filet.
 */
export function Frame({ children, style, bg, stroke, soft, accent, hatch = true, drips = false, seed = 7, dripCount, dripMax = 44, corners = true, crack = false, grain }: {
  children?: React.ReactNode; style?: StyleProp<ViewStyle>; bg?: string; stroke?: string; soft?: string; accent?: string;
  hatch?: boolean; drips?: boolean; seed?: number; dripCount?: number; dripMax?: number; corners?: boolean; crack?: boolean;
  /** Grain de papier (couleur du grain) : parchemin imprimé. */ grain?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const id = safeId(useId());
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
        <Svg width={w} height={h} style={FILL}>
          <Defs>
            <Pattern id={id} patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(45)">
              <Line x1={0} y1={0} x2={0} y2={5} stroke={colors.hatch} strokeWidth={1.1} />
            </Pattern>
          </Defs>
          {hatch && t > 12 ? (
            <>
              <Polygon points={`${IN},${IN} ${IN + t},${IN} ${IN},${IN + t}`} fill={`url(#${id})`} />
              <Polygon points={`${w - IN},${h - IN} ${w - IN - t},${h - IN} ${w - IN},${h - IN - t}`} fill={`url(#${id})`} />
            </>
          ) : null}
          <Rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={2} fill="none" stroke={outer} strokeWidth={1.5} />
          <Rect x={IN + 0.5} y={IN + 0.5} width={w - IN * 2 - 1} height={h - IN * 2 - 1} fill="none" stroke={inner} strokeWidth={1} />
          {corners ? [[IN + 9, IN + 9], [w - IN - 9, IN + 9], [IN + 9, h - IN - 9], [w - IN - 9, h - IN - 9]].map((p, i) => (
            <Path key={i} d={SPARK_PATH} fill={mark} transform={`translate(${(p[0] as number) - 4.5} ${(p[1] as number) - 4.5}) scale(${9 / 24})`} />
          )) : null}
          {crack ? <CrackShape color={colors.blood} points={[[w - 2, h * 0.62], [w - 20, h * 0.66], [w - 28, h * 0.74], [w - 46, h * 0.77]]} /> : null}
          {grain ? <Grain w={w} h={h} color={grain} seed={seed + 1} opacity={0.3} /> : null}
        </Svg>
      ) : null}
      {drips && w > 0 ? <DripLayer width={w} seed={seed} count={dripCount ?? Math.max(2, Math.round(w / 90))} maxLen={dripMax} color={colors.blood} /> : null}
      {children}
    </View>
  );
}
