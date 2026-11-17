import React from 'react';
import { Text, View } from 'react-native';
import type { CardView } from '@/domain';
import type { IconKey } from '@/features/roleMeta';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/tokens';
import { ModalSheet } from '../ui/ModalSheet';
import { RoleTile } from '../ui/RoleTile';
import type { Rect } from '../ui/cardOrigin';
import { AppText, Button } from '../ui/primitives';

/** Ma carte secrète, sur mon propre appareil : elle se rouvre à volonté (personne d'autre n'en reçoit le contenu). */
export function OnlineCardModal({ open, card, icon, origin, onClose }: {
  open: boolean; card: CardView; icon: IconKey; origin: Rect | null; onClose: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <ModalSheet visible={open} paper stamp="confidentiel" from={origin} onClose={onClose}>
      <AppText size={11} style={{ color: colors.inkSoft, letterSpacing: 1.1 }} center>{card.owner}</AppText>
      {card.roleLine ? <View style={{ transform: [{ rotate: '-1.5deg' }], marginBottom: 4 }}><RoleTile icon={icon} active size={168} shineAuto shineDelay={650} /></View> : null}
      {card.roleLine ? <AppText bold size={14.4} center style={{ color: colors.blood }}>{card.roleLine}</AppText> : null}
      <View style={{ alignItems: 'center', gap: 4, marginVertical: 6 }}>
        <AppText size={10.4} style={{ color: colors.inkSoft, letterSpacing: 1.6 }} center>Ton mot</AppText>
        <Text style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: card.isJanus ? 22 : 34, textAlign: 'center', lineHeight: card.isJanus ? 30 : 42 }}>{card.wordText}</Text>
      </View>
      {card.badges.map((b) => (
        <View key={b.label} style={{ alignSelf: 'stretch', backgroundColor: 'rgba(143,29,39,0.08)', borderWidth: 1, borderColor: 'rgba(143,29,39,0.4)', borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 10, gap: 2 }}>
          <AppText bold size={12.8} style={{ color: colors.blood }}>{b.label}</AppText>
          <AppText size={11.2} style={{ color: colors.inkSoft }}>{b.desc}</AppText>
        </View>
      ))}
      <Text style={{ color: colors.inkSoft, fontFamily: fonts.italic, fontSize: 11.2, textAlign: 'center' }}>Seul(e) toi reçois ce contenu : les autres joueurs voient uniquement que tu l'as lu.</Text>
      <Button arrow center label="J'ai lu ma carte" onPress={onClose} />
    </ModalSheet>
  );
}
