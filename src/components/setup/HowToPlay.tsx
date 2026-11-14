import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { IconKey } from '@/features/roleMeta';
import { useTheme } from '@/theme/ThemeProvider';
import { ART, fonts } from '@/theme/tokens';
import { CardBackArt } from '../ui/CardBack';
import { RoleTile } from '../ui/RoleTile';
import { StampBadge } from '../ui/Stamp';
import { Divider, Frame, Plaque } from '../ui/ornaments';
import { AppText } from '../ui/primitives';

const ILLU_W = 150;

/** Bulle de dialogue gravée (indices échangés à voix haute). */
function Bubble({ w, flip, tone }: { w: number; flip?: boolean; tone: string }): React.JSX.Element {
  const h = w * 0.72;
  return (
    <View style={{ transform: [{ scaleX: flip ? -1 : 1 }] }}>
      <Svg width={w} height={h} viewBox="0 0 60 44" fill="none" stroke={tone} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M8 4h44a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H26l-10 9v-9H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" />
        <Path d="M14 14h32M14 22h20" strokeWidth={1.6} />
      </Svg>
    </View>
  );
}

function Step({ n, title, children, illu }: { n: number; title: string; children: string; illu: React.ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18, rowGap: 12 }}>
      <View style={{ width: ILLU_W, minHeight: 116, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line, borderRadius: 2, paddingVertical: 14 }}>{illu}</View>
      <View style={{ flex: 1, minWidth: 220, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.blood, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: ART.bone, fontFamily: fonts.label, fontSize: 13 }}>{n}</Text>
          </View>
          <AppText label bold size={13} style={{ letterSpacing: 1.6, textTransform: 'uppercase', flexShrink: 1 }}>{title}</AppText>
        </View>
        <AppText tone="muted" size={13.2} style={{ lineHeight: 21 }}>{children}</AppText>
      </View>
    </View>
  );
}

/** « Comment jouer » : six étapes illustrées avec les cartes du jeu. */
export function HowToPlay(): React.JSX.Element {
  const { colors } = useTheme();
  const tile = (icon: IconKey, size = 66): React.JSX.Element => <RoleTile icon={icon} active size={size} vignette />;
  return (
    <Frame style={{ padding: 22, paddingTop: 32, gap: 18 }}>
      <View style={{ position: 'absolute', top: -13, left: 20 }}><Plaque label="Comment jouer" /></View>
      <Step n={1} title="Un mot secret pour chacun" illu={
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 92 }}>
          {[-9, 0, 9].map((r, i) => (
            <View key={i} style={{ marginLeft: i ? -26 : 0, transform: [{ rotate: `${r}deg` }, { translateY: r === 0 ? -4 : 0 }], boxShadow: '0 8px 14px -8px rgba(0,0,0,0.8)' }}><CardBackArt width={58} closed={i === 2} /></View>
          ))}
        </View>}>
        Faites circuler l'appareil : chacun touche sa carte, lit son mot en privé, puis la cache avant de passer au suivant.
      </Step>
      <Divider />
      <Step n={2} title="Des mots proches" illu={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {tile('civil', 56)}
          <Text style={{ color: colors.bloodHi, fontFamily: fonts.label, fontSize: 18 }}>≈</Text>
          {tile('undercover', 56)}
        </View>}>
        Les Civils ont tous le même mot. L'Undercover en reçoit un différent, mais proche. Mr. White n'en a pas du tout, l'Espion n'a qu'un indice.
      </Step>
      <Divider />
      <Step n={3} title="Les indices" illu={
        <View style={{ alignItems: 'center', gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}><Bubble w={54} tone={colors.accent} /><Bubble w={44} flip tone={colors.accentSoft} /></View>
          <Bubble w={48} tone={colors.bloodHi} />
        </View>}>
        À tour de rôle, chacun donne un indice sur son mot, sans le dire : assez clair pour rassurer les siens, assez flou pour ne pas se trahir.
      </Step>
      <Divider />
      <Step n={4} title="Le vote" illu={
        <View style={{ height: 96, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ opacity: 0.6 }}><CardBackArt width={66} closed /></View>
          <View style={{ position: 'absolute' }}><StampBadge label="Éliminé" size={10} /></View>
        </View>}>
        Quand la discussion est finie, le groupe désigne d'un commun accord le joueur à éliminer. Sa carte est barrée d'un tampon, son sort est annoncé.
      </Step>
      <Divider />
      <Step n={5} title="La victoire" illu={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {tile('mrwhite', 56)}
          {tile('espion', 56)}
        </View>}>
        Les Civils gagnent s'ils démasquent les imposteurs ; sinon, ce sont les imposteurs qui l'emportent. Éliminé, Mr. White tente une dernière chance : deviner le mot des Civils.
      </Step>
      <Divider />
      <Step n={6} title="Les rôles spéciaux" illu={
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {(['mime', 'janus', 'orion'] as const).map((k, i) => (
            <View key={k} style={{ marginLeft: i ? -18 : 0, transform: [{ rotate: `${(i - 1) * 8}deg` }, { translateY: i === 1 ? -4 : 0 }] }}>{tile(k, 56)}</View>
          ))}
        </View>}>
        Des rôles spéciaux ajoutent des pouvoirs et d'autres façons de gagner. Dans les réglages, touchez « ? » sur une carte pour lire son explication.
      </Step>
    </Frame>
  );
}
