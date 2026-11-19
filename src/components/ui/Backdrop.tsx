import React, { useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { HALO, getAmbience, onAmbience, type Ambience } from './ambience';
import { onBleed } from './bleed';
import { NATIVE, useReducedMotion } from './motion';
import { CrackShape, DripLayer, Grain, HatchLines, SPARK_PATH, Safe, safeId } from './ornaments';

/** Halo teinté de la phase (fondu à l'apparition) : un dégradé radial qui part du haut de l'écran. */
function Halo({ color, w, h, fadeIn }: { color: string; w: number; h: number; fadeIn: boolean }): React.JSX.Element {
  const id = safeId(useId());
  const o = useRef(new Animated.Value(fadeIn ? 0 : 1)).current;
  useEffect(() => {
    if (!fadeIn) return;
    const a = Animated.timing(o, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE });
    a.start();
    return () => a.stop();
  }, [fadeIn, o]);
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: w, height: h, opacity: o }}>
      <Svg width={w} height={h}>
        <Defs>
          <RadialGradient id={id} cx={w / 2} cy={h * 0.18} rx={Math.max(w, h) * 0.75} ry={Math.max(w, h) * 0.75} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={color} stopOpacity={0.95} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** Lueur de bougie : un halo crème en bas d'écran qui respire très lentement et vacille à peine (fixe si mouvement réduit). */
function Candle({ w, h, color }: { w: number; h: number; color: string }): React.JSX.Element {
  const id = safeId(useId());
  const reduce = useReducedMotion();
  const breath = useRef(new Animated.Value(0.5)).current;
  const flick = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) { breath.setValue(0.5); flick.setValue(0); return; }
    const b = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      Animated.timing(breath, { toValue: 0, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
    ]));
    const f = Animated.loop(Animated.sequence([
      Animated.timing(flick, { toValue: 1, duration: 830, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(flick, { toValue: 0.2, duration: 410, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(flick, { toValue: 0.7, duration: 590, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(flick, { toValue: 0, duration: 970, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
    ]));
    b.start(); f.start();
    return () => { b.stop(); f.stop(); };
  }, [reduce, breath, flick]);
  const opacity = Animated.add(breath.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.9] }), flick.interpolate({ inputRange: [0, 1], outputRange: [0, 0.1] }));
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: w, height: h, opacity }}>
      <Svg width={w} height={h}>
        <Defs>
          <RadialGradient id={id} cx={w / 2} cy={h * 1.02} rx={Math.max(w * 0.6, h * 0.55)} ry={h * 0.55} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={color} stopOpacity={0.2} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Fond de table : halo vert-noir, hachures à peine visibles, double filet d'encadrement avec étoiles aux angles,
 * craquelures rouges dans deux coins et gouttes de sang qui coulent du bord haut. Identique sur web, iOS et Android.
 */
export function Backdrop(): React.JSX.Element {
  const { colors, mode } = useTheme();
  const { width: w, height: h } = useWindowDimensions();
  // Séries de gouttes ajoutées à chaque élimination (3 au plus, la plus ancienne est remplacée).
  const [extra, setExtra] = useState<number[]>([]);
  // Halos de phase : l'ancien reste dessous le temps du fondu, puis disparaît.
  const [halos, setHalos] = useState<Array<{ key: number; amb: Ambience; fade: boolean }>>(() => [{ key: 0, amb: getAmbience(), fade: false }]);
  useEffect(() => onAmbience((amb) => setHalos((hs) => [...hs.slice(-1), { key: (hs[hs.length - 1]?.key ?? 0) + 1, amb, fade: true }])), []);
  useEffect(() => onBleed((k) => setExtra((e) => (k === 'reset' ? [] : [...e.slice(-2), (e[e.length - 1] ?? 40) + 17]))), []);
  const radius = Math.hypot(w / 2, h * 1.1);
  const count = Math.max(4, Math.min(14, Math.round(w / 110)));
  const maxLen = Math.min(96, h * 0.12);
  const A = 7; const B = 12; // filets extérieur et intérieur
  const corners: Array<[number, number]> = [[B + 9, B + 9], [w - B - 9, B + 9], [B + 9, h - B - 9], [w - B - 9, h - B - 9]];
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
      <Safe><Svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <RadialGradient id="mmBg" cx={w / 2} cy={-h * 0.1} rx={radius} ry={radius} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.glow} />
            <Stop offset="0.45" stopColor={colors.bg} />
            <Stop offset="1" stopColor={colors.vignette} />
          </RadialGradient>
          <Pattern id="mmHatch" patternUnits="userSpaceOnUse" width={9} height={9}>
            <HatchLines gap={9} color={colors.hatch} width={1} opacity={0.4} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill="url(#mmBg)" />
        <Rect x={0} y={0} width={w} height={h} fill="url(#mmHatch)" />
      </Svg></Safe>
      {halos.map((hl) => <Safe key={hl.key}><Halo w={w} h={h} fadeIn={hl.fade} color={hl.amb === 'none' ? colors.glow : HALO[hl.amb][mode]} /></Safe>)}
      <Safe><Candle w={w} h={h} color={mode === 'light' ? '#8a6a2a' : '#d9ccb0'} /></Safe>
      <Safe><Svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Rect x={A + 0.5} y={A + 0.5} width={w - A * 2 - 1} height={h - A * 2 - 1} fill="none" stroke={colors.line} strokeWidth={1.4} />
        <Rect x={B + 0.5} y={B + 0.5} width={w - B * 2 - 1} height={h - B * 2 - 1} fill="none" stroke={colors.line} strokeWidth={0.8} opacity={0.7} />
        {corners.map((p, i) => <Path key={i} d={SPARK_PATH} fill={colors.accentSoft} transform={`translate(${p[0] - 5} ${p[1] - 5}) scale(${10 / 24})`} />)}
        <CrackShape color={colors.blood} points={[[A, 76], [A + 14, 84], [A + 20, 100], [A + 40, 108], [A + 46, 124]]} />
        <CrackShape color={colors.blood} points={[[w - A, h - 150], [w - A - 16, h - 140], [w - A - 22, h - 120], [w - A - 44, h - 112]]} />
        <Grain w={w} h={h} color={colors.accent} seed={5} density={0.35} opacity={mode === 'light' ? 0.16 : 0.07} />
      </Svg></Safe>
      <DripLayer width={w} seed={11} count={count} minLen={16} maxLen={maxLen} color={colors.blood} top={A} />
      {extra.map((sd) => <DripLayer key={sd} width={w} seed={sd} count={4} minLen={50} maxLen={Math.min(170, h * 0.2)} color={colors.blood} top={A} />)}
    </View>
  );
}
