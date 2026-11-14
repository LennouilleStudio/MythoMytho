import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from '../ui/primitives';
import { Frame, Plaque } from '../ui/ornaments';

/** Carte du tableau de bord : double cadre gravé, titre en cartouche posé sur le filet, zone libre à droite. */
export function DashCard({ title, right, hint, children, style }: {
  title?: string; right?: React.ReactNode; hint?: string; children: React.ReactNode; style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Frame style={[{ padding: 22, paddingTop: title ? 30 : 24, gap: 16, boxShadow: `0 18px 40px -24px ${colors.shadow}` }, style]}>
      {title ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: -13, left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, zIndex: 2 }}>
          <Plaque label={title} style={{ flexShrink: 0 }} />
          {right ? <View style={{ flexShrink: 1, backgroundColor: colors.panel, paddingHorizontal: 8, paddingVertical: 2 }}>{right}</View> : null}
        </View>
      ) : null}
      {hint ? <AppText tone="muted" size={11.5}>{hint}</AppText> : null}
      {children}
    </Frame>
  );
}
