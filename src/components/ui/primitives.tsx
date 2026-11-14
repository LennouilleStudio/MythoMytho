import React, { useState } from 'react';
import {
  Pressable, Text, TextInput, View, useWindowDimensions, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { alpha } from '@/theme/color';
import { ART, fonts, radius, space } from '@/theme/tokens';
import { titleRuns } from '@/theme/typography';
import { DashLine, Frame, Hatch, Plaque, Sparkle, Stitch } from './ornaments';

type Tone = 'default' | 'muted' | 'accent' | 'blood';

export function AppText({ children, tone = 'default', size = 16, bold, title, label, center, style, ...rest }: {
  children: React.ReactNode; tone?: Tone; size?: number; bold?: boolean; title?: boolean; /** Capitales géométriques (Outfit) pour les petits libellés. */ label?: boolean; center?: boolean;
  style?: StyleProp<TextStyle>; numberOfLines?: number; selectable?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const color = tone === 'muted' ? colors.muted : tone === 'accent' ? colors.accent : tone === 'blood' ? colors.bloodHi : colors.text;
  // Police titre « Sirelia » : seules les lettres A–Z / a–z y sont dessinées (chiffres, accents et ponctuation sont
  // des glyphes vides). On rend donc les suites de lettres en Sirelia et le reste en Courier Prime.
  const runs = title && typeof children === 'string' ? titleRuns(children) : null;
  return (
    <Text {...rest}
      style={[{ color, fontSize: size, fontFamily: title ? fonts.body : label ? fonts.label : bold ? fonts.bold : fonts.body, textAlign: center ? 'center' : 'left', lineHeight: Math.round(size * 1.4) }, style]}>
      {runs
        ? runs.map((r, i) => (r.letters
          ? <Text key={i} style={{ fontFamily: fonts.title }}>{r.text}</Text>
          : r.text))
        : children}
    </Text>
  );
}

/** Bouton « sceau » (aplat rouge sang, double filet) ou « gravé » (simple trait). */
export function Button({ label, onPress, variant = 'primary', disabled, small, block, center, arrow, style, accessibilityLabel }: {
  label: string; onPress: () => void; variant?: 'primary' | 'ghost'; disabled?: boolean; small?: boolean; block?: boolean; center?: boolean;
  /** Ajoute la flèche « → » de l'original. */
  arrow?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [{
        backgroundColor: primary ? colors.blood : pressed ? alpha(colors.accent, 0.1) : 'transparent', borderRadius: radius.sm,
        borderWidth: 1.5, borderColor: primary ? colors.accent : colors.lineStrong, overflow: 'hidden',
        paddingVertical: small ? 8 : 13, paddingHorizontal: small ? 14 : 22, minHeight: small ? 38 : 48,
        alignItems: 'center', justifyContent: 'center', alignSelf: block ? 'stretch' : center ? 'center' : 'flex-start',
        opacity: disabled ? 0.4 : 1, transform: [{ translateY: pressed && !disabled ? 1 : 0 }],
      }, style]}>
      {primary ? <View pointerEvents="none" style={{ position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: 1, borderColor: alpha(ART.bone, 0.3), borderRadius: 1 }} /> : null}
      <Text style={{ color: primary ? ART.bone : colors.accent, fontFamily: fonts.label, fontSize: small ? 11.5 : 13, letterSpacing: small ? 1.1 : 1.5, textTransform: 'uppercase', textAlign: 'center' }}>
        {label}{arrow ? '  →' : ''}
      </Text>
    </Pressable>
  );
}

/** Encadré simple (liste, bloc secondaire) : double filet, sans hachures. */
export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  return <Frame hatch={false} corners={false} bg={colors.panelAlt} style={[{ padding: space.xl }, style]}>{children}</Frame>;
}

/** Panneau principal : double cadre gravé, étoiles aux angles, hachures en coin et gouttes de sang. */
export function Dossier({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { width } = useWindowDimensions();
  const pad = width < 600 ? 22 : Math.max(28, Math.min(42, width * 0.04));
  return <Frame drips crack style={{ padding: pad, paddingTop: pad + 16 }}>{children}</Frame>;
}

/** Lien discret souligné en tirets (« Journal des scores », « Comment jouer »). */
export function LinkButton({ label, onPress, chevron, open }: { label: string; onPress: () => void; chevron?: boolean; open?: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={chevron ? { expanded: !!open } : undefined}
      style={{ paddingTop: 4, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View>
        <Text style={{ color: colors.accent, fontFamily: fonts.label, fontSize: 10.8, letterSpacing: 1.6, textTransform: 'uppercase' }}>{label}</Text>
        <DashLine color={colors.accentSoft} style={{ flex: 0, marginTop: 3 }} />
      </View>
      {chevron ? <Chevron open={!!open} size={6} color={colors.accent} /> : null}
    </Pressable>
  );
}

export function Chevron({ open, size = 7, color }: { open: boolean; size?: number; color: string }): React.JSX.Element {
  return (
    <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: size, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: color, transform: [{ rotate: open ? '-135deg' : '45deg' }, { translateY: open ? -1 : -2 }] }} />
    </View>
  );
}

function Round({ children, onPress, label, disabled, size = 38 }: {
  children: React.ReactNode; onPress: () => void; label: string; disabled?: boolean; size?: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: pressed ? alpha(colors.accent, 0.16) : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 })}>
      {children}
    </Pressable>
  );
}

/** Compteur : − valeur (+ plage) + dans un cadre gravé. */
export function Counter({ label, a11y, value, min, max, onChange, range }: {
  label?: string; /** Libellé lu par les lecteurs d'écran quand aucun titre visible n'est affiché. */ a11y?: string;
  value: number; min: number; max: number; onChange: (n: number) => void; range?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const btn = (sym: string, delta: number, off: boolean): React.JSX.Element => (
    <Round onPress={() => onChange(value + delta)} disabled={off} label={`${delta > 0 ? 'Ajouter' : 'Retirer'} ${a11y ?? label ?? ''}`.trim()}>
      <Text style={{ color: colors.accent, fontSize: 19, lineHeight: 22, fontFamily: fonts.bold }}>{sym}</Text>
    </Round>
  );
  return (
    <View style={{ gap: 8, width: 190, alignSelf: 'flex-start' }}>
      {label ? <AppText bold size={15}>{label}</AppText> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.lineStrong, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 8 }}>
        {btn('−', -1, value <= min)}
        <View style={{ minWidth: 64, alignItems: 'center' }}>
          <Text accessibilityLiveRegion="polite" style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 24, lineHeight: 28 }}>{value}</Text>
          {range ? <Text style={{ color: colors.muted, fontFamily: fonts.label, fontSize: 9.6, letterSpacing: 1.8, marginTop: -2, textTransform: 'uppercase' }}>{range}</Text> : null}
        </View>
        {btn('+', 1, value >= max)}
      </View>
    </View>
  );
}

/** Case à cocher en carte : point de croix quand actif, trait appuyé et fond en relief. */
export function Toggle({ label, desc, value, onChange, disabled, radio }: {
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; radio?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} disabled={disabled} accessibilityRole={radio ? 'radio' : 'switch'} accessibilityState={{ checked: value, disabled: !!disabled }}
      style={{ overflow: 'hidden', flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: value ? colors.raised : colors.bg, borderWidth: 1, borderColor: value ? colors.lineStrong : colors.line, borderRadius: radius.sm, paddingVertical: 11, paddingHorizontal: 12, opacity: disabled ? 0.6 : 1 }}>
      {value ? <Hatch color={colors.hatch} gap={6} /> : null}
      <View style={{ marginTop: 1, width: 20, height: 20, borderRadius: radio ? 10 : 2, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: value ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {value && radio ? <Sparkle size={11} color={colors.onAccent} /> : null}
        {value && !radio ? <Stitch size={13} color={colors.onAccent} width={3} /> : null}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 14.2 }}>{label}</Text>
        {desc ? <Text style={{ color: colors.muted, fontFamily: fonts.body, fontSize: 11, lineHeight: 16 }}>{desc}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Choix exclusif en onglets (difficulté, masquage automatique…). */
export function Segmented<T extends string | number>({ options, value, onChange }: {
  options: ReadonlyArray<{ key: T; label: string }>; value: T; onChange: (v: T) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={String(o.key)} onPress={() => onChange(o.key)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ overflow: 'hidden', paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, borderWidth: 1.5, borderColor: on ? colors.accent : colors.line, backgroundColor: on ? colors.accent : colors.bg }}>
            <Text style={{ color: on ? colors.onAccent : colors.text, fontFamily: fonts.label, fontSize: 11.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Étiquette de résumé (« 6 joueurs », « 1 Undercover »…). */
export function Pill({ label }: { label: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ borderRadius: radius.sm, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: 'transparent', paddingVertical: 4, paddingHorizontal: 10 }}>
      <Text style={{ color: colors.accent, fontFamily: fonts.label, fontSize: 10.2, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

export function Field(props: TextInputProps & { label?: string }): React.JSX.Element {
  const { colors } = useTheme();
  const { label, style, onFocus, onBlur, ...rest } = props;
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: colors.muted, fontFamily: fonts.label, fontSize: 10.5, letterSpacing: 1.6, textTransform: 'uppercase' }}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={label} placeholderTextColor={colors.muted} {...rest}
        onFocus={(e) => { setFocus(true); onFocus?.(e); }} onBlur={(e) => { setFocus(false); onBlur?.(e); }}
        style={[{ borderWidth: 1.5, borderColor: focus ? colors.accent : colors.line, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 12, color: colors.text, fontFamily: fonts.body, fontSize: 15, backgroundColor: colors.bg }, style]} />
    </View>
  );
}

/** Ligne de l'encadré « Équilibrage » : losange rouge (alerte), crème (info) ou plein (tout va bien). */
export function Notice({ level, children }: { level: 'warn' | 'info' | 'ok'; children: string }): React.JSX.Element {
  const { colors } = useTheme();
  const c = level === 'warn' ? colors.bloodHi : colors.accent;
  return (
    <View style={{ paddingLeft: 20, marginBottom: 6 }}>
      <View style={{ position: 'absolute', left: 2, top: 7, width: 8, height: 8, backgroundColor: level === 'info' ? 'transparent' : c, borderWidth: 1.5, borderColor: c, transform: [{ rotate: '45deg' }] }} />
      <Text style={{ color: colors.text, fontFamily: fonts.body, fontSize: 12.3, lineHeight: 19 }}>{children}</Text>
    </View>
  );
}

/** Petit libellé entre deux étoiles (« vote », « dernière chance »…). */
export function Kicker({ children }: { children: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Sparkle size={9} color={colors.bloodHi} />
      <Text style={{ color: colors.accent, fontFamily: fonts.label, fontSize: 10.2, letterSpacing: 3, textTransform: 'uppercase' }}>{children}</Text>
      <Sparkle size={9} color={colors.bloodHi} />
    </View>
  );
}

/** Zone de texte d'aide encadrée en tirets (consigne, bandeau). `ok` : bandeau de confirmation, trait plein et hachures. */
export function Callout({ children, accent = 'default', tone = 'plain' }: { children: React.ReactNode; accent?: 'default' | 'blood'; tone?: 'plain' | 'ok' }): React.JSX.Element {
  const { colors } = useTheme();
  const ok = tone === 'ok';
  const line = ok ? colors.lineStrong : accent === 'blood' ? colors.blood : colors.line;
  const bar = accent === 'blood' ? colors.blood : colors.accentSoft;
  return (
    <View style={{ overflow: 'hidden', borderWidth: 1, borderStyle: ok ? 'solid' : 'dashed', borderColor: line, borderRadius: radius.sm, backgroundColor: ok ? colors.raised : alpha(colors.accent, 0.04), paddingVertical: 12, paddingLeft: 17, paddingRight: 14 }}>
      {ok ? <Hatch color={colors.hatch} gap={6} /> : null}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, backgroundColor: ok ? colors.accent : bar }} />
      {children}
    </View>
  );
}

export { Plaque };
