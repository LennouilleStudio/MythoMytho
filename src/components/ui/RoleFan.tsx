import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import type { IconKey } from '@/features/roleMeta';
import { RoleTile } from './RoleTile';

const DEFAULT: readonly IconKey[] = ['civil', 'mytho', 'janus', 'undercover', 'mrwhite'];

/** Cartes de rôles en éventail, pivotant autour d'un point bas ; la carte centrale est au premier plan. */
export function RoleFan({ keys = DEFAULT }: { keys?: readonly IconKey[] }): React.JSX.Element {
  const { width } = useWindowDimensions();
  const size = width < 600 ? 84 : 104;
  const n = keys.length;
  const step = size * 0.5;
  const total = size + step * (n - 1);
  const mid = (n - 1) / 2;
  return (
    <View pointerEvents="none" style={{ alignSelf: 'center', width: total + 24, height: size + 26, marginTop: -6, marginBottom: 14 }}>
      {keys.map((k, i) => {
        const t = i - mid;
        return (
          <View key={k} style={{ position: 'absolute', left: 12 + step * i, top: 8 + Math.pow(Math.abs(t), 1.7) * 5, zIndex: n - Math.round(Math.abs(t)), transform: [{ rotate: `${t * 11}deg` }], boxShadow: '0 12px 18px -10px rgba(0,0,0,0.85)' }}>
            <RoleTile icon={k} active size={size} />
          </View>
        );
      })}
    </View>
  );
}
