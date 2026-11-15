import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { type IconKey } from '@/features/roleMeta';
import { useTheme } from '@/theme/ThemeProvider';
import { alpha } from '@/theme/color';
import { ROLE_BG } from '@/theme/roleArt';
import { RoleArt } from './RoleArt';
import { Sheen, useShine } from './Sheen';
import { safeId } from './ornaments';

/** Vignettage de tranche : les bords de la carte s'assombrissent légèrement, comme un carton imprimé et manipulé. */
export function EdgeVignette({ strength = 0.38, radius = 8 }: { strength?: number; radius?: number }): React.JSX.Element {
  const id = safeId(useId());
  return (
    <Svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="48%" rx="72%" ry="72%" fx="50%" fy="48%">
          <Stop offset="0.55" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={strength} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" rx={radius} fill={`url(#${id})`} />
    </Svg>
  );
}

/** Carte de rôle : l'illustration gravée dans un liseré ; éteinte (voilée) tant que le rôle n'est pas actif. */
export function RoleTile({ icon, active, size, vignette = true, shineAuto = false, shineDelay = 0 }: {
  icon: IconKey; active: boolean; size: number; vignette?: boolean;
  /** Balaie la carte d'une brillance à l'apparition (le suivi du doigt est toujours actif). */ shineAuto?: boolean; shineDelay?: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  const art = size - 10;
  const shine = useShine(size, shineAuto, shineDelay);
  return (
    <View {...shine.handlers} style={{
      width: size, height: size, padding: 3, borderRadius: 4, borderWidth: 1.5, borderColor: active ? colors.accent : colors.line,
      backgroundColor: ROLE_BG[icon], boxShadow: active ? `0 12px 26px -12px ${colors.shadow}` : 'none', overflow: 'hidden',
    }}>
      <View style={{ opacity: active ? 1 : 0.62 }}><RoleArt role={icon} size={art} /></View>
      {vignette ? <EdgeVignette /> : null}
      {active && shine.live ? <Sheen progress={shine.progress} size={size} /> : null}
      {!active ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: alpha(colors.bg, 0.18) }} /> : null}
    </View>
  );
}
