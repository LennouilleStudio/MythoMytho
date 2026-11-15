import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { ART, fonts } from '@/theme/tokens';
import { Hatch } from './ornaments';

/** Barre de statistique gravée : cadre fin, remplissage hachuré proportionnel (crème, ou rouge sang pour le camp des imposteurs). */
export function BarRow({ label, value, max = 100, display, tone = 'accent' }: {
  label: string; value: number; max?: number; display: string; tone?: 'accent' | 'blood';
}): React.JSX.Element {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  const fill = tone === 'blood' ? colors.blood : colors.accent;
  return (
    <View style={{ gap: 5, marginBottom: 6 }} accessible accessibilityLabel={`${label} : ${display}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.text, fontFamily: fonts.bold, fontSize: 13 }}>{label}</Text>
        <Text style={{ color: tone === 'blood' ? colors.bloodHi : colors.muted, fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8 }}>{display}</Text>
      </View>
      <View style={{ height: 14, borderWidth: 1.5, borderColor: colors.lineStrong, borderRadius: 2, backgroundColor: colors.bg, overflow: 'hidden', justifyContent: 'center' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: tone === 'blood' ? 'rgba(143,29,39,0.35)' : 'rgba(217,204,176,0.14)', borderRightWidth: pct > 0 ? 2 : 0, borderColor: fill }}>
          <Hatch color={tone === 'blood' ? ART.blood : colors.accent} gap={4} width={1.6} />
        </View>
      </View>
    </View>
  );
}
