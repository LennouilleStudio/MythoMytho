import React from 'react';
import { Animated, Text, View } from 'react-native';
import { ART, fonts } from '@/theme/tokens';
import { useProgress } from './motion';

/** Tampon rouge (double filet, lettres espacées), posé de travers. Statique. */
export function StampBadge({ label, size = 14, rotate = -14 }: { label: string; size?: number; rotate?: number }): React.JSX.Element {
  return (
    <View style={{ transform: [{ rotate: `${rotate}deg` }], backgroundColor: ART.blood, borderWidth: 2, borderColor: 'rgba(241,232,208,0.9)', borderRadius: 2, padding: 2, boxShadow: '0 6px 14px rgba(0,0,0,0.55)' }}>
      <View style={{ borderWidth: 1, borderColor: 'rgba(241,232,208,0.55)', paddingVertical: size * 0.22, paddingHorizontal: size * 0.6 }}>
        <Text style={{ color: ART.bone, fontFamily: fonts.label, fontSize: size, letterSpacing: size * 0.18, textTransform: 'uppercase' }}>{label}</Text>
      </View>
    </View>
  );
}

/**
 * Tampon qui s'abat : arrive grossi et transparent, se plaque avec un petit rebond. `active` le déclenche
 * (mouvement réduit : posé directement).
 */
export function DropStamp({ label, active, size = 14, rotate = -14, delay = 0 }: {
  label: string; active: boolean; size?: number; rotate?: number; delay?: number;
}): React.JSX.Element {
  const p = useProgress(active, { duration: 330, delay });
  const scale = p.interpolate({ inputRange: [0, 0.75, 1], outputRange: [2.6, 0.94, 1] });
  return (
    <Animated.View pointerEvents="none" style={{ opacity: p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.9, 1] }), transform: [{ scale }] }}>
      <StampBadge label={label} size={size} rotate={rotate} />
    </Animated.View>
  );
}
