import React, { useEffect, useRef, useState } from 'react';
import { Platform, Share, Text, View } from 'react-native';
import { MIN_PLAYERS, plural } from '@/domain';
import { inviteUrl } from '@/net/invite';
import { copyText } from '@/services/clipboard';
import { useLibrary } from '@/state/library';
import { useOnline } from '@/state/online';
import { useSettings, useSettingsActions } from '@/state/settings';
import { useToast } from '@/state/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';
import { ComfortCard } from '../dashboard/ComfortCard';
import { DashCard } from '../dashboard/DashCard';
import { RoleInfoModal } from '../dashboard/RoleInfoModal';
import { RolesCard, type RoleInfo } from '../dashboard/RolesCard';
import { ThemesCard } from '../dashboard/ThemesCard';
import { useSummaryPills } from '../dashboard/SummaryCard';
import { PlayerCard } from '../game/GamePanels';
import { RoomOptions } from './RoomOptions';
import { SocialDock } from './Social';
import { QrCode } from '../ui/QrCode';
import { Plaque } from '../ui/ornaments';
import { AppText, Button, Pill, Toggle } from '../ui/primitives';

/** Salon : code à partager, joueurs présents ; l'hôte règle la partie avec les mêmes cartes que le mode local. */
export function Lobby(): React.JSX.Element {
  const { view, send, leave, serverUrl, pushAvailable, pushOn, setPushOn } = useOnline();
  const { customPairs } = useLibrary();
  const { colors } = useTheme();
  const toast = useToast();
  const { settings } = useSettings();
  const actions = useSettingsActions();
  const [info, setInfo] = useState<RoleInfo | null>(null);
  const v = view;
  // Les absents ne jouent pas la manche : seuls les joueurs connectés comptent pour le lancement.
  const count = v?.seats.filter((s) => s.connected).length ?? 0;
  const isHost = v?.isHost ?? false;
  const shown = isHost ? { ...settings, playerCount: count } : (v?.settings ?? settings);
  const pills = useSummaryPills(shown);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hôte : le nombre de joueurs suit le salon, et chaque réglage local est envoyé au serveur (qui le valide).
  useEffect(() => { if (isHost && count >= MIN_PLAYERS && settings.playerCount !== count) actions.patch({ playerCount: count }); }, [isHost, count, settings.playerCount, actions]);
  useEffect(() => {
    if (!isHost) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => send({ t: 'settings', patch: { ...settings, playerCount: count } }), 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [isHost, settings, count, send]);

  // Hôte : « Mes paires » est envoyé au salon (le serveur nettoie et plafonne la liste). Un nouvel hôte sans paires n'efface pas celles du salon.
  const sentPairs = useRef<string | null>(null);
  useEffect(() => {
    if (!isHost) { sentPairs.current = null; return; }
    const sig = JSON.stringify(customPairs);
    if (sig === sentPairs.current) return;
    if (sentPairs.current === null && customPairs.length === 0) { sentPairs.current = sig; return; }
    const id = setTimeout(() => { sentPairs.current = sig; send({ t: 'pairs', pairs: customPairs }); }, 300);
    return () => clearTimeout(id);
  }, [isHost, customPairs, send]);

  if (!v) return <View />;
  const webOrigin = Platform.OS === 'web' ? ((globalThis as unknown as { location?: { origin?: string } }).location?.origin ?? null) : null;
  const link = inviteUrl(v.code, { webOrigin, serverUrl });
  const share = async (): Promise<void> => {
    try { await Share.share({ message: link ? `Rejoins ma salle MythoMytho : ${link} (code ${v.code})` : `Rejoins ma salle MythoMytho : code ${v.code}` }); } catch { toast(link ?? `Code de la salle : ${v.code}`); }
  };
  const copy = async (): Promise<void> => {
    const text = link ?? v.code;
    toast((await copyText(text)) ? (link ? 'Lien copié.' : 'Code copié.') : text);
  };

  return (
    <View style={{ gap: 22 }}>
      <DashCard title="Salle">
        <View style={{ alignItems: 'center', gap: 6, paddingVertical: 4 }}>
          <AppText label size={10.5} tone="muted" style={{ letterSpacing: 2.4, textTransform: 'uppercase' }}>Code à communiquer</AppText>
          <Text accessibilityLabel={`Code ${v.code.split('').join(' ')}`} style={{ color: colors.text, fontFamily: fonts.label, fontSize: 52, letterSpacing: 14, paddingLeft: 14 }}>{v.code}</Text>
          {link ? (
            <View style={{ alignItems: 'center', gap: 8, paddingTop: 10 }}>
              <QrCode value={link} size={168} />
              <AppText size={11} tone="muted" center>Scannez pour rejoindre directement</AppText>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', paddingTop: 6 }}>
            <Button small variant="ghost" label={link ? 'Partager le lien' : 'Partager le code'} onPress={() => { void share(); }} />
            <Button small variant="ghost" label={link ? 'Copier le lien' : 'Copier le code'} onPress={() => { void copy(); }} />
          </View>
        </View>
      </DashCard>

      <DashCard title={`${count} ${plural(count, 'joueur', 'joueurs')}`} hint={isHost ? `Il faut au moins ${MIN_PLAYERS} joueurs connectés. « Nommer hôte » passe la main ; « Retirer » renvoie quelqu'un ; « Bannir » l'empêche de revenir.` : 'En attente du lancement par l\'hôte.'}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingTop: 6 }}>
          {v.seats.map((s, i) => (
            <View key={s.id} style={{ alignItems: 'center', gap: 8, width: 120 }}>
              <View style={{ opacity: s.connected ? 1 : 0.45 }}><PlayerCard player={{ name: s.name }} index={i} /></View>
              {s.host ? <Plaque label="Hôte" tone="blood" size={9.5} /> : null}
              {!s.connected ? <AppText size={10} tone="muted" label>Hors ligne</AppText> : null}
              {isHost && !s.host ? (
                <View style={{ gap: 6, alignItems: 'center' }}>
                  {s.connected ? <Button small variant="ghost" label="Nommer hôte" onPress={() => send({ t: 'promote', seatId: s.id })} /> : null}
                  <Button small variant="ghost" label="Retirer" onPress={() => send({ t: 'kick', seatId: s.id })} />
                  <Button small variant="ghost" label="Bannir" onPress={() => send({ t: 'ban', seatId: s.id })} />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </DashCard>

      <RoomOptions />

      {isHost ? (
        <>
          <RolesCard settings={shown} onInfo={setInfo} />
          <ThemesCard settings={shown} />
          {v.customPairCount > 0 ? <AppText size={11.5} tone="muted">{`« Mes paires » : ${v.customPairCount} ${plural(v.customPairCount, 'paire', 'paires')} disponibles dans ce salon.`}</AppText> : null}
          <ComfortCard settings={shown} />
        </>
      ) : (
        <DashCard title="Réglages de l'hôte">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{pills.map((p) => <Pill key={p} label={p} />)}</View>
        </DashCard>
      )}

      <SocialDock />

      {pushAvailable ? <Toggle label="Me prévenir par notification" desc="Quand la manche commence, que le vote s'ouvre ou que la manche se termine alors que l'appli est fermée." value={pushOn} onChange={setPushOn} /> : null}

      <View style={{ gap: 12 }}>
        {isHost ? <Button arrow label="Lancer la manche" disabled={count < MIN_PLAYERS} onPress={() => send({ t: 'start' })} /> : null}
        <Button variant="ghost" label="Quitter la salle" onPress={leave} />
      </View>
      <RoleInfoModal info={info} onClose={() => setInfo(null)} />
    </View>
  );
}
