import React, { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Line, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { onBleed } from './bleed';
import { CrackShape, DripLayer, Grain, SPARK_PATH } from './ornaments';

/**
 * Fond de table : halo vert-noir, hachures à peine visibles, double filet d'encadrement avec étoiles aux angles,
 * craquelures rouges dans deux coins et gouttes de sang qui coulent du bord haut. Identique sur web, iOS et Android.
 */
export function Backdrop(): React.JSX.Element {
  const { colors, mode } = useTheme();
  const { width: w, height: h } = useWindowDimensions();
  // Séries de gouttes ajoutées à chaque élimination (3 au plus, la plus ancienne est remplacée).
  const [extra, setExtra] = useState<number[]>([]);
  useEffect(() => onBleed((k) => setExtra((e) => (k === 'reset' ? [] : [...e.slice(-2), (e[e.length - 1] ?? 40) + 17]))), []);
  const radius = Math.hypot(w / 2, h * 1.1);
  const count = Math.max(4, Math.min(14, Math.round(w / 110)));
  const maxLen = Math.min(96, h * 0.12);
  const A = 7; const B = 12; // filets extérieur et intérieur
  const corners: Array<[number, number]> = [[B + 9, B + 9], [w - B - 9, B + 9], [B + 9, h - B - 9], [w - B - 9, h - B - 9]];
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
      <Svg width={w} height={h}>
        <Defs>
          <RadialGradient id="mmBg" cx={w / 2} cy={-h * 0.1} rx={radius} ry={radius} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.glow} />
            <Stop offset="0.45" stopColor={colors.bg} />
            <Stop offset="1" stopColor={colors.vignette} />
          </RadialGradient>
          <Pattern id="mmHatch" patternUnits="userSpaceOnUse" width={9} height={9} patternTransform="rotate(45)">
            <Line x1={0} y1={0} x2={0} y2={9} stroke={colors.hatch} strokeWidth={1} opacity={0.4} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill="url(#mmBg)" />
        <Rect x={0} y={0} width={w} height={h} fill="url(#mmHatch)" />
        <Rect x={A + 0.5} y={A + 0.5} width={w - A * 2 - 1} height={h - A * 2 - 1} fill="none" stroke={colors.line} strokeWidth={1.4} />
        <Rect x={B + 0.5} y={B + 0.5} width={w - B * 2 - 1} height={h - B * 2 - 1} fill="none" stroke={colors.line} strokeWidth={0.8} opacity={0.7} />
        {corners.map((p, i) => <Path key={i} d={SPARK_PATH} fill={colors.accentSoft} transform={`translate(${p[0] - 5} ${p[1] - 5}) scale(${10 / 24})`} />)}
        <CrackShape color={colors.blood} points={[[A, 76], [A + 14, 84], [A + 20, 100], [A + 40, 108], [A + 46, 124]]} />
        <CrackShape color={colors.blood} points={[[w - A, h - 150], [w - A - 16, h - 140], [w - A - 22, h - 120], [w - A - 44, h - 112]]} />
        <Grain w={w} h={h} color={colors.accent} seed={5} density={0.35} opacity={mode === 'light' ? 0.16 : 0.07} />
      </Svg>
      <DripLayer width={w} seed={11} count={count} minLen={16} maxLen={maxLen} color={colors.blood} top={A} />
      {extra.map((sd) => <DripLayer key={sd} width={w} seed={sd} count={4} minLen={50} maxLen={Math.min(170, h * 0.2)} color={colors.blood} top={A} />)}
    </View>
  );
}
