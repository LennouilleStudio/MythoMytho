import React from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { ThemeOverride, useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';
import { type Rect } from './cardOrigin';
import { useProgress, useReducedMotion } from './motion';
import { Frame } from './ornaments';
import { AppText, Kicker } from './primitives';

/**
 * Fenêtre modale unique. `paper` : carte secrète en parchemin (palette claire imposée, filets d'encre, tampon « confidentiel »)
 * quel que soit le thème. Sinon : carte violet nuit à double cadre et gouttes de sang, petit libellé (`kicker`) et titre en Sirelia.
 */
const POP = Easing.out(Easing.cubic);

/** La fenêtre grandit depuis `from` (la carte touchée) jusqu'à sa place ; sans origine ou en mouvement réduit, elle apparaît simplement. */
function Pop({ from, children }: { from?: Rect | null; children: React.ReactNode }): React.JSX.Element {
  const { width: W, height: H } = useWindowDimensions();
  const reduce = useReducedMotion();
  const p = useProgress(true, { duration: 460, easing: POP });
  if (!from || reduce) return <>{children}</>;
  const dx = from.x + from.w / 2 - W / 2;
  const dy = from.y + from.h / 2 - H / 2;
  const s0 = Math.max(0.12, from.w / Math.min(440, W - 40));
  return (
    <Animated.View style={{ opacity: p.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }), transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) }, { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) }, { scale: p.interpolate({ inputRange: [0, 1], outputRange: [s0, 1] }) }] }}>
      {children}
    </Animated.View>
  );
}

export function ModalSheet({ visible, title, kicker, onClose, children, paper, stamp, center, from }: {
  visible: boolean; title?: string; kicker?: string; onClose?: () => void; children: React.ReactNode;
  paper?: boolean; stamp?: string; center?: boolean; /** Position de la carte d'où la fenêtre grandit. */ from?: Rect | null;
}): React.JSX.Element {
  const { colors: outer } = useTheme();
  const sheet = (
    <SheetBody paper={paper} stamp={stamp} title={title} kicker={kicker} center={center}>{children}</SheetBody>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose ?? (() => undefined)} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} accessibilityLabel="Fermer" style={{ flex: 1, backgroundColor: outer.overlay, justifyContent: 'center', padding: 20 }}>
          <Pressable onPress={() => undefined} accessible={false} style={{ alignSelf: 'center', width: '100%', maxWidth: 440, maxHeight: '90%', boxShadow: '0 28px 56px -18px rgba(0,0,0,0.75)' }}>
            <Pop from={from}>{paper ? <ThemeOverride mode="light">{sheet}</ThemeOverride> : sheet}</Pop>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SheetBody({ children, title, kicker, paper, stamp, center }: {
  children: React.ReactNode; title?: string; kicker?: string; paper?: boolean; stamp?: string; center?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <>
      <Frame
        drips={!paper} seed={paper ? 5 : 19} dripCount={4} bg={paper ? colors.paper : colors.panelAlt}
        stroke={paper ? colors.ink : colors.lineStrong} soft={paper ? 'rgba(14,22,19,0.55)' : colors.line} accent={paper ? 'rgba(14,22,19,0.7)' : colors.accentSoft} grain={paper ? colors.ink : undefined} aged={paper ? 'full' : false}
        style={{ maxHeight: '100%' }}>
        <ScrollView contentContainerStyle={{ padding: 34, paddingTop: paper ? 34 : 44, gap: 14, alignItems: center || paper ? 'center' : 'stretch' }} keyboardShouldPersistTaps="handled">
          {kicker ? <Kicker>{kicker}</Kicker> : null}
          {title ? <AppText title size={26} center={center || paper} style={paper ? { color: colors.ink } : undefined}>{title}</AppText> : null}
          <View style={{ gap: 14, alignSelf: 'stretch', alignItems: center || paper ? 'center' : 'stretch' }}>{children}</View>
        </ScrollView>
      </Frame>
      {stamp ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 22, right: -12, borderWidth: 2.5, borderColor: colors.blood, borderRadius: 2, paddingVertical: 3, paddingHorizontal: 9, opacity: 0.88, transform: [{ rotate: '8deg' }] }}>
          <View style={{ borderWidth: 1, borderColor: colors.blood, paddingVertical: 1, paddingHorizontal: 5 }}>
            <Text style={{ color: colors.blood, fontFamily: fonts.label, fontSize: 10.5, letterSpacing: 3, textTransform: 'uppercase' }}>{stamp}</Text>
          </View>
        </View>
      ) : null}
    </>
  );
}
