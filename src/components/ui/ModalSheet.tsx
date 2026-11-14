import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { ThemeOverride, useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';
import { Frame } from './ornaments';
import { AppText, Kicker } from './primitives';

/**
 * Fenêtre modale unique. `paper` : carte secrète en parchemin (palette claire imposée, filets d'encre, tampon « confidentiel »)
 * quel que soit le thème. Sinon : carte violet nuit à double cadre et gouttes de sang, petit libellé (`kicker`) et titre en Sirelia.
 */
export function ModalSheet({ visible, title, kicker, onClose, children, paper, stamp, center }: {
  visible: boolean; title?: string; kicker?: string; onClose?: () => void; children: React.ReactNode;
  paper?: boolean; stamp?: string; center?: boolean;
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
            {paper ? <ThemeOverride mode="light">{sheet}</ThemeOverride> : sheet}
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
        stroke={paper ? colors.ink : colors.lineStrong} soft={paper ? 'rgba(14,22,19,0.55)' : colors.line} accent={paper ? 'rgba(14,22,19,0.7)' : colors.accentSoft} grain={paper ? colors.ink : undefined}
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
