import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, FeBlend, FeFlood, FeGaussianBlur, Filter, G, Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { NATIVE, useReducedMotion } from './motion';
import { AppText } from './primitives';
import { DashLine, Safe, Sparkle } from './ornaments';
import { LOGO_REFLECT_1, LOGO_REFLECT_2, LOGO_VIEWBOX, LOGO_WORD_1, LOGO_WORD_2 } from './logoPaths';

/**
 * Une goutte de sang se détache du logo de temps en temps (toutes les 4 à 9 s), s'étire en tombant et fait une ride dans le reflet.
 * Absente en mouvement réduit.
 */
function LogoDrop({ w, h, color }: { w: number; h: number; color: string }): React.JSX.Element | null {
  const reduce = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  const [x, setX] = useState(0.62);
  useEffect(() => {
    if (reduce) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = (): void => {
      if (!alive) return;
      setX(0.16 + Math.random() * 0.68);
      t.setValue(0);
      Animated.timing(t, { toValue: 1, duration: 1700, easing: Easing.linear, useNativeDriver: NATIVE }).start(() => {
        if (alive) timer = setTimeout(run, 4000 + Math.random() * 5000);
      });
    };
    timer = setTimeout(run, 2200);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [reduce, t]);
  if (reduce) return null;
  const y0 = h * 0.5; const fall = h * 0.28;
  const ty = t.interpolate({ inputRange: [0, 0.12, 0.8, 1], outputRange: [0, 0, fall, fall] });
  const sy = t.interpolate({ inputRange: [0, 0.12, 0.8], outputRange: [0.4, 1, 1.9], extrapolate: 'clamp' });
  const op = t.interpolate({ inputRange: [0, 0.04, 0.78, 0.82, 1], outputRange: [0, 1, 1, 0, 0] });
  const ring = t.interpolate({ inputRange: [0, 0.78, 1], outputRange: [0.2, 0.2, 1.6] });
  const ringOp = t.interpolate({ inputRange: [0, 0.78, 0.82, 1], outputRange: [0, 0, 0.7, 0] });
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: w, height: h }}>
      <Animated.View style={{ position: 'absolute', left: w * x - 3, top: y0, width: 6, height: 10, borderRadius: 3, backgroundColor: color, opacity: op, transform: [{ translateY: ty }, { scaleY: sy }] }} />
      <Animated.View style={{ position: 'absolute', left: w * x - 14, top: y0 + fall + 4, width: 28, height: 6, borderRadius: 14, borderWidth: 1.2, borderColor: color, opacity: ringOp, transform: [{ scale: ring }] }} />
    </View>
  );
}

/** Logo « Mytho Mytho » (rouge sang, avec reflet) + sous-titre entre deux filets en tirets. */
export function Wordmark(): React.JSX.Element {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const RED = colors.bloodHi;
  const w = Math.max(300, Math.min(480, width * 0.7));
  const h = (w * LOGO_VIEWBOX.height) / LOGO_VIEWBOX.width;
  // Le flou du reflet utilise les filtres SVG : fiables sur le web, évités sur mobile (support natif variable).
  const blur = Platform.OS === 'web';
  const reflect = (d: string, id: string): React.JSX.Element => (
    <G filter={blur ? `url(#${id})` : undefined}><Path d={d} fill={RED} fillOpacity={0.4} /></G>
  );
  // `colorInterpolationFilters` manque aux types de react-native-svg mais reste utile : on le passe sans typage.
  const filter = (id: string, x: number): React.JSX.Element => (
    <Filter id={id} x={x} y={116.75} width={327.125} height={130.312} filterUnits="userSpaceOnUse" {...({ colorInterpolationFilters: 'sRGB' } as object)}>
      <FeFlood floodOpacity={0} result="BackgroundImageFix" />
      <FeBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
      <FeGaussianBlur stdDeviation={0.9} result="blur" />
    </Filter>
  );
  return (
    <View style={{ alignItems: 'center', marginBottom: Math.max(20, Math.min(34, width * 0.04)) }}>
      <View accessibilityRole="header" accessibilityLabel="MythoMytho" style={{ marginTop: -w * 0.04, marginBottom: -w * 0.055 }}>
        <Safe><Svg width={w} height={h} viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`} fill="none">
          <Path d={LOGO_WORD_1} fill={RED} />
          {reflect(LOGO_REFLECT_1, 'mmReflect0')}
          <Path d={LOGO_WORD_2} fill={RED} />
          {reflect(LOGO_REFLECT_2, 'mmReflect1')}
          {blur ? <Defs>{filter('mmReflect0', 63.625)}{filter('mmReflect1', 406.625)}</Defs> : null}
        </Svg></Safe>
        <LogoDrop w={w} h={h} color={RED} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, width: Math.min(w, 440), maxWidth: '100%' }}>
        <DashLine color={colors.line} />
        <Sparkle size={9} color={colors.accentSoft} />
        <AppText tone="accent" label size={10} center style={{ letterSpacing: 2, textTransform: 'uppercase', flexShrink: 0 }}>jeu de mots &amp; de déduction</AppText>
        <Sparkle size={9} color={colors.accentSoft} />
        <DashLine color={colors.line} />
      </View>
    </View>
  );
}
