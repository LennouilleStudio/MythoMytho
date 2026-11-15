import { Link } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { TornCardScene } from '@/components/ui/Scenes';
import { AppText } from '@/components/ui/primitives';

export default function NotFound(): React.JSX.Element {
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
        <TornCardScene width={210} />
        <AppText title size={32} center>Dossier introuvable</AppText>
        <AppText tone="muted" size={13} center>Cette carte a été déchirée ou n'a jamais existé.</AppText>
        <Link href="/"><AppText tone="accent" label bold size={12} style={{ letterSpacing: 1.6, textTransform: 'uppercase' }}>Retour à l'accueil</AppText></Link>
      </View>
    </Screen>
  );
}
