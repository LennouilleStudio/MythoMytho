import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { type IconKey } from '@/features/roleMeta';
import { useTheme } from '@/theme/ThemeProvider';
import { alpha } from '@/theme/color';
import { ART, fonts } from '@/theme/tokens';
import { RoleTile } from '../ui/RoleTile';
import { Stitch } from '../ui/ornaments';

function Round({ label, onPress, glyph, disabled, size = 28 }: {
  label: string; onPress: () => void; glyph: string; disabled?: boolean; size?: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: pressed ? alpha(colors.accent, 0.18) : colors.panel, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 })}>
      <Text style={{ color: colors.accent, fontFamily: fonts.bold, fontSize: size * 0.62, lineHeight: size * 0.74 }}>{glyph}</Text>
    </Pressable>
  );
}

/** Pastille « ? » parchemin, posée sur l'angle de la carte. */
function InfoBadge({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Aide : ${label}`} hitSlop={8}
      style={{ position: 'absolute', top: -8, left: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1.5, borderColor: ART.green, alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
      <Text style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: 13, lineHeight: 16 }}>?</Text>
    </Pressable>
  );
}

/** Rôle spécial : toucher la carte (ou le bouton dessous) l'active ; « ? » ouvre son explication. */
export function SpecialToken({ icon, label, short, active, onToggle, onInfo, size }: {
  icon: IconKey; label: string; short: string; active: boolean; onToggle: () => void; onInfo: () => void; size: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, gap: 8 }}>
      <View>
        <Pressable onPress={onToggle} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: active }}>
          <RoleTile icon={icon} active={active} size={size} />
        </Pressable>
        <InfoBadge label={label} onPress={onInfo} />
      </View>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityLabel={active ? `Retirer ${short}` : `Ajouter ${short}`}
        style={{ height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 2, borderWidth: 1.5, borderColor: active ? colors.accent : colors.lineStrong, backgroundColor: active ? colors.blood : 'transparent' }}>
        {active ? <Stitch size={11} color={ART.bone} width={3} /> : null}
        <Text style={{ color: active ? ART.bone : colors.accent, fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase' }}>{active ? 'Actif' : 'Activer'}</Text>
      </Pressable>
    </View>
  );
}

/** Rôle à effectif : carte, puis − nombre + dessous (carte seule, sans boutons, pour les Civils déduits). */
export function CountToken({ icon, short, value, min, max, onChange, onInfo, fixed, size }: {
  icon: IconKey; short: string; value: number; min: number; max: number; onChange?: (n: number) => void; onInfo: () => void; fixed?: boolean; size: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, gap: 8 }}>
      <View>
        <RoleTile icon={icon} active={value > 0} size={size} />
        <InfoBadge label={short} onPress={onInfo} />
      </View>
      <View style={{ height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {!fixed && onChange ? <Round label={`Retirer ${short}`} onPress={() => onChange(value - 1)} disabled={value <= min} glyph="−" /> : <View style={{ width: 28 }} />}
        <View accessibilityLabel={`${value} ${short}`} style={{ minWidth: 36, height: 28, paddingHorizontal: 8, borderRadius: 2, backgroundColor: value > 0 ? colors.blood : 'transparent', borderWidth: 1.5, borderColor: value > 0 ? colors.accent : colors.line, alignItems: 'center', justifyContent: 'center' }}>
          <Text accessibilityLiveRegion="polite" style={{ color: value > 0 ? ART.bone : colors.muted, fontFamily: fonts.bold, fontSize: 15, lineHeight: 18 }}>{value}</Text>
        </View>
        {!fixed && onChange ? <Round label={`Ajouter ${short}`} onPress={() => onChange(value + 1)} disabled={value >= max} glyph="+" /> : <View style={{ width: 28 }} />}
      </View>
    </View>
  );
}
