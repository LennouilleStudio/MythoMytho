import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

/** Le pilote natif n'existe pas sur le web (react-native-web retombe sur JS avec un avertissement). */
export const NATIVE = Platform.OS !== 'web';

/** Vrai quand le système demande de réduire les animations (iOS, Android, et `prefers-reduced-motion` sur le web). */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setReduce(v); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  return reduce;
}

const OUT = Easing.out(Easing.cubic);

/**
 * Valeur animée 0 → 1 déclenchée quand `active` devient vrai (retombe à 0 sinon). Sans animation (mouvement réduit),
 * elle saute directement à 1.
 */
export function useProgress(active: boolean, opts: { duration?: number; delay?: number; easing?: (t: number) => number } = {}): Animated.Value {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  const { duration = 400, delay = 0, easing = OUT } = opts;
  useEffect(() => {
    if (!active) { v.stopAnimation(); v.setValue(0); return; }
    if (reduce) { v.setValue(1); return; }
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration, delay, easing, useNativeDriver: NATIVE });
    a.start();
    return () => a.stop();
  }, [active, reduce, v, duration, delay, easing]);
  return v;
}
