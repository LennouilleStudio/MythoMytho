import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { plural } from '@/domain';
import { ApiError, type LeaderRow } from '@/services/api';
import { useAccount } from '@/state/account';
import { useServer } from '@/state/server';
import { useToast } from '@/state/toast';
import { BarRow } from '../ui/Bars';
import { Divider } from '../ui/ornaments';
import { Page, Screen } from '../ui/Screen';
import { AppText, Button, Callout, Dossier, Field, LinkButton, Segmented } from '../ui/primitives';

const message = (e: unknown): string => (e instanceof ApiError ? e.message : 'Une erreur est survenue.');

/** Compte en ligne : inscription / connexion, statistiques personnelles, classement du serveur. Entièrement facultatif. */
export function AccountScreen(): React.JSX.Element {
  const router = useRouter();
  const toast = useToast();
  const { serverUrl } = useServer();
  const acct = useAccount();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [pseudo, setPseudo] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<readonly LeaderRow[] | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePw, setDeletePw] = useState('');

  const loadBoard = useCallback(() => {
    setBoardError(null);
    acct.leaderboard().then(setBoard).catch((e: unknown) => { setBoard(null); setBoardError(message(e)); });
  }, [acct]);
  useEffect(() => { loadBoard(); /* au chargement et après connexion */ }, [loadBoard, serverUrl, acct.account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (): Promise<void> => {
    setBusy(true); setError(null);
    try {
      await (mode === 'register' ? acct.register(pseudo, password) : acct.login(pseudo, password));
      setPassword('');
      toast(mode === 'register' ? 'Compte créé : vos parties en ligne comptent pour le classement.' : 'Connecté.');
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };

  const me = acct.account;
  return (
    <Screen>
      <Page>
        <Dossier>
          <AppText title size={26} style={{ marginBottom: 6 }}>Compte et classement</AppText>
          <AppText tone="muted" size={12.5} style={{ marginBottom: 18 }}>Facultatif : un compte garde vos victoires sur le serveur, d'un appareil à l'autre. Sans compte, le jeu en ligne fonctionne exactement pareil.</AppText>

          {me ? (
            <View style={{ gap: 14, marginBottom: 22 }}>
              <AppText title size={20}>{me.pseudo}</AppText>
              <AppText tone="muted" size={13}>{`${me.wins} ${plural(me.wins, 'victoire', 'victoires')} en ${me.games} ${plural(me.games, 'partie', 'parties')}${me.games > 0 ? ` · ${Math.round((me.wins / me.games) * 100)} %` : ''}`}</AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <Button small variant="ghost" label="Se déconnecter" onPress={() => { void acct.logout(); }} />
                <Button small variant="ghost" label="Supprimer mon compte" onPress={() => setConfirmDelete((c) => !c)} />
              </View>
              {confirmDelete ? (
                <Callout accent="blood">
                  <View style={{ gap: 10 }}>
                    <AppText size={12.5}>Cette action est définitive : le compte, ses statistiques et ses sessions sont effacés du serveur. Confirmez avec votre mot de passe.</AppText>
                    <Field label="Mot de passe" value={deletePw} onChangeText={setDeletePw} secureTextEntry autoCapitalize="none" />
                    <Button small label="Supprimer définitivement" disabled={!deletePw || busy} onPress={() => {
                      setBusy(true);
                      acct.remove(deletePw).then(() => { setConfirmDelete(false); setDeletePw(''); toast('Compte supprimé.'); }).catch((e: unknown) => toast(message(e))).finally(() => setBusy(false));
                    }} />
                  </View>
                </Callout>
              ) : null}
            </View>
          ) : (
            <View style={{ gap: 14, marginBottom: 22 }}>
              <Segmented<'login' | 'register'> options={[{ key: 'login', label: 'Se connecter' }, { key: 'register', label: 'Créer un compte' }]} value={mode} onChange={(m) => { setMode(m); setError(null); }} />
              <Field label="Pseudo" value={pseudo} onChangeText={setPseudo} maxLength={16} autoCapitalize="words" autoCorrect={false} placeholder="Alice" />
              <Field label={mode === 'register' ? 'Mot de passe (8 caractères minimum)' : 'Mot de passe'} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} onSubmitEditing={() => { if (pseudo.trim() && password) void submit(); }} />
              {error ? <AppText size={12.5} tone="accent">{error}</AppText> : null}
              <Button arrow label={busy ? 'Un instant…' : mode === 'register' ? 'Créer mon compte' : 'Me connecter'} disabled={busy || !pseudo.trim() || !password} onPress={() => { void submit(); }} />
              <AppText size={11} tone="muted">Le serveur ne stocke qu'une empreinte de votre mot de passe. Pas d'e-mail : un mot de passe oublié ne peut pas être récupéré.</AppText>
            </View>
          )}

          <Divider style={{ marginBottom: 14 }} />
          <AppText title size={18} style={{ marginBottom: 10 }}>Classement du serveur</AppText>
          {boardError ? (
            <View style={{ gap: 10 }}><AppText size={12.5} tone="muted">{boardError}</AppText><Button small variant="ghost" label="Réessayer" onPress={loadBoard} /></View>
          ) : board === null ? <AppText size={12.5} tone="muted">Chargement…</AppText> : board.length === 0 ? (
            <AppText size={12.5} tone="muted">Personne n'a encore terminé de partie avec un compte.</AppText>
          ) : (
            board.map((r) => (
              <BarRow key={r.rank} label={`${r.rank}. ${r.pseudo}`} value={r.wins} max={board[0]?.wins || 1} display={`${r.wins} ${plural(r.wins, 'victoire', 'victoires')} · ${r.games}`} tone={r.pseudo === me?.pseudo ? 'blood' : 'accent'} />
            ))
          )}
          <AppText size={11} tone="muted" style={{ marginTop: 10 }}>Les statistiques viennent des parties en ligne terminées ; elles s'amusent, elles ne certifient rien.</AppText>

          <Divider style={{ marginVertical: 18 }} />
          <LinkButton label="← Retour" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </Dossier>
      </Page>
    </Screen>
  );
}
