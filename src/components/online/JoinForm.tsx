import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { INVITE_PARAM, parseInviteCode } from '@/net/invite';
import { useAccount } from '@/state/account';
import { useOnline } from '@/state/online';
import { RoleFan } from '../ui/RoleFan';
import { Callout, Dossier, AppText, Button, Field, LinkButton, Toggle } from '../ui/primitives';
import { Divider } from '../ui/ornaments';

const NAME_KEY = 'mythomytho_online_name';

/** Premier écran du mode en ligne : pseudo, code d'une salle à rejoindre, ou création d'une nouvelle salle. */
export function JoinForm(): React.JSX.Element {
  const online = useOnline();
  const acct = useAccount();
  const router = useRouter();
  // Lien d'invitation (?salle=ABCD) : le code est déjà rempli, il ne reste qu'à saisir son pseudo.
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const invited = parseInviteCode(params[INVITE_PARAM]);
  const [name, setName] = useState('');
  const [code, setCode] = useState(invited ?? '');
  useEffect(() => { if (invited) setCode(invited); }, [invited]);
  const [advanced, setAdvanced] = useState(false);
  const [password, setPassword] = useState('');
  // Connecté avec « compter pour le classement » : le pseudo est celui du compte (le serveur l'impose).
  const asAccount = !!acct.account && acct.useForGames;
  const playerName = asAccount ? (acct.account?.pseudo ?? '') : name.trim();
  const needPassword = online.joinError?.code === 'password';
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
          {invited ? <Callout><AppText size={12.5}>{`Vous êtes invité(e) dans la salle ${invited} : choisissez un pseudo, puis touchez « Rejoindre ».`}</AppText></Callout> : null}
          {acct.account ? (
            <Toggle label={`Jouer en tant que ${acct.account.pseudo}`} desc={`${acct.account.wins} victoire${acct.account.wins > 1 ? 's' : ''} en ${acct.account.games} partie${acct.account.games > 1 ? 's' : ''}. Désactivé : vous jouez sans compte, sans classement.`} value={acct.useForGames} onChange={acct.setUseForGames} />
          ) : null}
          {asAccount ? null : <Field label="Votre pseudo" value={name} onChangeText={setName} maxLength={16} autoCapitalize="words" placeholder="Alice" />}
          <Divider />
          <View style={{ gap: 10 }}>
            <AppText label size={11} tone="accent" style={{ letterSpacing: 2, textTransform: 'uppercase' }}>Rejoindre une salle</AppText>
            <Field label="Code à 4 lettres" value={cleanCode} onChangeText={setCode} maxLength={4} autoCapitalize="characters" autoCorrect={false} placeholder="ABCD" />
            <Field label={needPassword ? 'Cette salle est protégée : mot de passe' : 'Mot de passe (salle protégée, ou à définir en créant)'} value={password} onChangeText={setPassword} maxLength={64} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder={needPassword ? 'Mot de passe de la salle' : 'Facultatif'} />
            <Button arrow label={busy ? 'Connexion…' : 'Rejoindre'} disabled={busy || !playerName || cleanCode.length !== 4} onPress={() => { remember(); router.setParams({ [INVITE_PARAM]: '' }); online.join(cleanCode, playerName, password.trim() || undefined); }} />
          </View>
          <Divider />
          <Button variant="ghost" label={password.trim() ? 'Créer une salle protégée' : 'Créer une salle'} disabled={busy || !playerName} onPress={() => { remember(); online.create(playerName, password.trim() || undefined); }} />
          {online.canResume ? <Button variant="ghost" small label="Reprendre ma dernière partie" onPress={online.resume} /> : null}
          <LinkButton label={advanced ? 'Masquer le serveur' : 'Adresse du serveur'} chevron open={advanced} onPress={() => setAdvanced((a) => !a)} />
          {advanced ? <Field label="Serveur" value={online.serverUrl} onChangeText={online.setServerUrl} autoCapitalize="none" autoCorrect={false} placeholder="ws://192.168.1.20:8787" /> : null}
          <Divider />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
            <LinkButton label="Jouer sur un seul appareil" onPress={() => router.push('/local')} />
            <LinkButton label="Journal des scores" onPress={() => router.push('/scores')} />
            <LinkButton label={acct.account ? 'Mon compte et le classement' : 'Compte et classement'} onPress={() => router.push('/account')} />
          </View>
        </View>
      </Dossier>
    </View>
  );
}
