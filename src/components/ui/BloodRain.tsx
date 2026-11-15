import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View, useWindowDimensions } from 'react-native';
import { ART } from '@/theme/tokens';
import { NATIVE, useReducedMotion } from './motion';

const COUNT = 30;
const SPAN = 4600;

/**
 * Pluie de gouttes de sang qui traverse tout l'écran, une seule fois (~4,6 s). Posée en surimpression, insensible au toucher.
 * Rien n'est affiché si l'utilisateur a demandé de réduire les animations.
 */
export function BloodRain({ active }: { active: boolean }): React.JSX.Element | null {
  const reduce = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  const [done, setDone] = useState(false);
  const drops = useMemo(() => Array.from({ length: COUNT }, (_, i) => {
    const r = (n: number): number => { const x = Math.sin(i * 91.7 + n * 12.9898) * 43758.5453; return x - Math.floor(x); };
    return { x: 0.02 + r(1) * 0.96, start: r(2) * 0.5, span: 0.26 + r(3) * 0.2, len: 14 + r(4) * 26, w: 3.5 + r(5) * 3 };
  }), []);
  useEffect(() => {
    if (!active || reduce) return;
    setDone(false); t.setValue(0);
    const a = Animated.timing(t, { toValue: 1, duration: SPAN, easing: Easing.linear, useNativeDriver: NATIVE });
    a.start(({ finished }) => { if (finished) setDone(true); });
    return () => a.stop();
  }, [active, reduce, t]);
  if (!active || reduce || done) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      {drops.map((d, i) => {
        const a = d.start; const b = Math.min(1, d.start + d.span);
        return (
          <Animated.View key={i} style={{
            position: 'absolute', left: d.x * width, top: 0, width: d.w, height: d.len, borderRadius: d.w, backgroundColor: ART.blood,
            opacity: t.interpolate({ inputRange: [0, a, a + 0.015, b - 0.03, b, 1], outputRange: [0, 0, 0.9, 0.9, 0, 0] }),
            transform: [{ translateY: t.interpolate({ inputRange: [0, a, b, 1], outputRange: [-60, -60, height + 40, height + 40] }) }],
          }} />
        );
      })}
    </View>
  );
}
