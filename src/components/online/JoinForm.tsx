import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useOnline } from '@/state/online';
import { RoleFan } from '../ui/RoleFan';
import { Dossier, AppText, Button, Field, LinkButton } from '../ui/primitives';
import { Divider } from '../ui/ornaments';

const NAME_KEY = 'mythomytho_online_name';

/** Premier écran du mode en ligne : pseudo, code d'une salle à rejoindre, ou création d'une nouvelle salle. */
export function JoinForm(): React.JSX.Element {
  const online = useOnline();
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const busy = online.status === 'connecting' || online.status === 'reconnecting';
  const cleanCode = code.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4);

  // Le pseudo est mémorisé sur l'appareil (localStorage sur le web, rien d'envoyé au serveur avant de rejoindre).
  useEffect(() => {
    const ls = (globalThis as unknown as { localStorage?: { getItem(k: string): string | null } }).localStorage;
    const v = ls?.getItem(NAME_KEY);
    if (v) setName(v);
  }, []);
  const remember = (): void => {
    (globalThis as unknown as { localStorage?: { setItem(k: string, v: string): void } }).localStorage?.setItem(NAME_KEY, name.trim());
  };

  return (
    <View style={{ gap: 18 }}>
      <RoleFan />
      <Dossier>
        <View style={{ gap: 16 }}>
          <AppText title size={26}>Jouer en ligne</AppText>
          <AppText tone="muted" size={12.5}>Chacun joue sur son propre appareil : le serveur distribue les cartes en secret et ne montre à chacun que la sienne.</AppText>
          <Field label="Votre pseudo" value={name} onChangeText={setName} maxLength={16} autoCapitalize="words" placeholder="Alice" />
          <Divider />
          <View style={{ gap: 10 }}>
            <AppText label size={11} tone="accent" style={{ letterSpacing: 2, textTransform: 'uppercase' }}>Rejoindre une salle</AppText>
            <Field label="Code à 4 lettres" value={cleanCode} onChangeText={setCode} maxLength={4} autoCapitalize="characters" autoCorrect={false} placeholder="ABCD" />
            <Button arrow label={busy ? 'Connexion…' : 'Rejoindre'} disabled={busy || !name.trim() || cleanCode.length !== 4} onPress={() => { remember(); online.join(cleanCode, name.trim()); }} />
          </View>
          <Divider />
          <Button variant="ghost" label="Créer une salle" disabled={busy || !name.trim()} onPress={() => { remember(); online.create(name.trim()); }} />
          {online.canResume ? <Button variant="ghost" small label="Reprendre ma dernière partie" onPress={online.resume} /> : null}
          <LinkButton label={advanced ? 'Masquer le serveur' : 'Adresse du serveur'} chevron open={advanced} onPress={() => setAdvanced((a) => !a)} />
          {advanced ? <Field label="Serveur" value={online.serverUrl} onChangeText={online.setServerUrl} autoCapitalize="none" autoCorrect={false} placeholder="ws://192.168.1.20:8787" /> : null}
          <Divider />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
            <LinkButton label="Jouer sur un seul appareil" onPress={() => router.push('/local')} />
            <LinkButton label="Journal des scores" onPress={() => router.push('/scores')} />
          </View>
        </View>
      </Dossier>
    </View>
  );
}
