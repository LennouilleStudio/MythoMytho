import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, useWindowDimensions } from 'react-native';
import { ART, palettes } from '@/theme/tokens';
import { RoleArt } from './RoleArt';
import { EdgeVignette } from './RoleTile';
import { NATIVE, useReducedMotion } from './motion';
import { DripLayer, Sparkle } from './ornaments';

/**
 * Écran d'accueil pendant le chargement des polices : la carte « Le Mytho » au centre, des gouttes de sang qui coulent du haut.
 * N'utilise ni police ni thème (rien n'est encore chargé) : palette « nuit » fixe.
 */
export function Splash(): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const size = Math.min(280, Math.round(Math.min(width, height) * 0.62));
  const appear = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { appear.setValue(1); return; }
    const a = Animated.timing(appear, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE });
    a.start();
    return () => a.stop();
  }, [reduce, appear]);
  const c = palettes.dark;
  return (
    <View accessibilityLabel="Chargement de MythoMytho" style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <DripLayer width={width} seed={31} count={Math.max(5, Math.round(width / 80))} minLen={40} maxLen={Math.min(190, height * 0.24)} color={ART.blood} delay={150} />
      <Animated.View style={{ opacity: appear, transform: [{ rotate: '-3deg' }, { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }], boxShadow: '0 30px 60px -20px rgba(0,0,0,0.85)' }}>
        <View style={{ width: size, height: size, padding: 4, borderRadius: 5, borderWidth: 2, borderColor: ART.cream, backgroundColor: ART.green, overflow: 'hidden' }}>
          <RoleArt role="mytho" size={size - 12} />
          <EdgeVignette />
        </View>
      </Animated.View>
      <View style={{ marginTop: 28, flexDirection: 'row', gap: 14, opacity: 0.8 }}>
        <Sparkle size={10} color={ART.cream} /><Sparkle size={14} color={ART.blood} /><Sparkle size={10} color={ART.cream} />
      </View>
    </View>
  );
}
