import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { NATIVE, useReducedMotion } from './motion';
import { Safe, safeId } from './ornaments';

/** Bande de brillance diagonale qui traverse une carte (0 = hors carte à gauche, 1 = hors carte à droite). */
export function Sheen({ progress, size }: { progress: Animated.Value; size: number }): React.JSX.Element {
  const id = safeId(useId());
  const band = size * 0.46;
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', top: -size * 0.3, left: 0, width: band, height: size * 1.6,
      opacity: progress.interpolate({ inputRange: [0, 0.08, 0.92, 1], outputRange: [0, 1, 1, 0] }),
      transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-band * 1.3, size + band * 0.3] }) }, { rotate: '22deg' }],
    }}>
      <Safe><Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#fff6de" stopOpacity={0} />
            <Stop offset="0.5" stopColor="#fff6de" stopOpacity={0.34} />
            <Stop offset="1" stopColor="#fff6de" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg></Safe>
    </Animated.View>
  );
}

/**
 * Brillance façon carte à collectionner : suit le doigt (ou le pointeur sur le web) et peut aussi balayer la carte une fois (`auto`).
 * `handlers` se pose sur la vue de la carte ; `live` indique si la bande doit être montée (pour ne rien dessiner tant que personne ne touche).
 * Inclinaison du téléphone : non gérée (demanderait `expo-sensors`).
 */
export function useShine(size: number, auto = false, delay = 0): { progress: Animated.Value; live: boolean; handlers: object } {
  const reduce = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const [live, setLive] = useState(auto);
  const sweep = useCallback(() => {
    if (reduce) return;
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }).start();
  }, [reduce, progress]);
  useEffect(() => {
    if (!auto || reduce) return;
    const t = setTimeout(sweep, delay);
    return () => clearTimeout(t);
  }, [auto, reduce, delay, sweep]);
  const follow = useCallback((e: unknown) => {
    if (reduce) return;
    const ne = (e as { nativeEvent?: { locationX?: number; offsetX?: number } } | undefined)?.nativeEvent;
    const x = ne?.locationX ?? ne?.offsetX;
    if (typeof x !== 'number') return;
    setLive(true);
    progress.stopAnimation();
    progress.setValue(Math.max(0, Math.min(1, x / size)));
  }, [reduce, progress, size]);
  const leave = useCallback(() => { if (!reduce) progress.setValue(0); }, [reduce, progress]);
  return { progress, live, handlers: { onTouchStart: follow, onTouchMove: follow, onTouchEnd: leave, onPointerMove: follow, onPointerLeave: leave } };
}
