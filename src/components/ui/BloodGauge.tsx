import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { NATIVE, useReducedMotion } from './motion';

const W = 46;
const H = 108;

/**
 * Jauge de sang : une fiole gravée où le liquide monte à mesure que le temps s'écoule (`fill` de 0 à 1).
 * `danger` (10 dernières secondes) : la fiole pulse en rouge, sauf mouvement réduit (elle reste alors simplement rouge vif).
 */
export function BloodGauge({ fill, danger }: { fill: number; danger?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const beat = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!danger || reduce) { beat.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(beat, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(beat, { toValue: 0, duration: 620, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [danger, reduce, beat]);

  const top = 12; const bottom = H - 8; const left = 8; const right = W - 8;
  const level = Math.max(0, Math.min(1, fill));
  const y = bottom - (bottom - top) * level;
  const a = 2.4; const mid = (left + right) / 2;
  const liquid = level <= 0 ? '' : `M${left} ${y}Q${(left + mid) / 2} ${y - a} ${mid} ${y}T${right} ${y}V${bottom}H${left}Z`;
  return (
    <View style={{ width: W + 16, height: H + 16, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityRole="progressbar" accessibilityLabel={`Temps écoulé : ${Math.round(level * 100)} %`}>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 14, backgroundColor: colors.blood, opacity: beat.interpolate({ inputRange: [0, 1], outputRange: [0, 0.38] }), transform: [{ scale: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }} />
      <Animated.View style={{ transform: [{ scale: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }] }}>
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <Rect x={4} y={8} width={W - 8} height={H - 12} rx={3} fill={colors.bg} stroke={danger ? colors.bloodHi : colors.lineStrong} strokeWidth={1.6} />
          <Rect x={left - 2} y={top - 2} width={W - 12} height={H - 16} rx={1.5} fill="none" stroke={colors.line} strokeWidth={0.8} />
          <Rect x={13} y={2} width={W - 26} height={7} rx={1.5} fill={colors.bg} stroke={danger ? colors.bloodHi : colors.lineStrong} strokeWidth={1.4} />
          {liquid ? <Path d={liquid} fill={colors.blood} /> : null}
          {liquid ? <Path d={`M${left + 3} ${y + 5}H${right - 3}`} stroke="rgba(241,232,208,0.28)" strokeWidth={0.8} strokeDasharray="2 4" /> : null}
          {[0.25, 0.5, 0.75].map((t) => <Line key={t} x1={left} x2={left + 7} y1={bottom - (bottom - top) * t} y2={bottom - (bottom - top) * t} stroke={colors.accentSoft} strokeWidth={1} />)}
        </Svg>
      </Animated.View>
    </View>
  );
}
