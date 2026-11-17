import React, { useEffect, useRef, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { MIN_PLAYERS, plural } from '@/domain';
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
import { backStyle } from '../ui/CardBack';
import { Plaque } from '../ui/ornaments';
import { AppText, Button, Pill } from '../ui/primitives';

/** Salon : code à partager, joueurs présents ; l'hôte règle la partie avec les mêmes cartes que le mode local. */
export function Lobby(): React.JSX.Element {
  const { view, send, leave } = useOnline();
  const { colors } = useTheme();
  const toast = useToast();
  const { settings } = useSettings();
  const actions = useSettingsActions();
  const [info, setInfo] = useState<RoleInfo | null>(null);
  const v = view;
  const count = v?.seats.length ?? 0;
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

  if (!v) return <View />;
  const share = async (): Promise<void> => {
    try { await Share.share({ message: `Rejoins ma salle MythoMytho : code ${v.code}` }); } catch { toast(`Code de la salle : ${v.code}`); }
  };

  return (
    <View style={{ gap: 22 }}>
      <DashCard title="Salle">
        <View style={{ alignItems: 'center', gap: 6, paddingVertical: 4 }}>
          <AppText label size={10.5} tone="muted" style={{ letterSpacing: 2.4, textTransform: 'uppercase' }}>Code à communiquer</AppText>
          <Text accessibilityLabel={`Code ${v.code.split('').join(' ')}`} style={{ color: colors.text, fontFamily: fonts.label, fontSize: 52, letterSpacing: 14, paddingLeft: 14 }}>{v.code}</Text>
          <Button small variant="ghost" label="Partager le code" onPress={() => { void share(); }} />
        </View>
      </DashCard>

      <DashCard title={`${count} ${plural(count, 'joueur', 'joueurs')}`} hint={isHost ? `Il faut au moins ${MIN_PLAYERS} joueurs. Touchez « Retirer » pour renvoyer quelqu'un.` : 'En attente du lancement par l\'hôte.'}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingTop: 6 }}>
          {v.seats.map((s, i) => (
            <View key={s.id} style={{ alignItems: 'center', gap: 8, width: 120 }}>
              <View style={{ opacity: s.connected ? 1 : 0.45 }}><PlayerCard player={{ name: s.name }} index={i} /></View>
              {s.host ? <Plaque label="Hôte" tone="blood" size={9.5} /> : null}
              {!s.connected ? <AppText size={10} tone="muted" label>Hors ligne</AppText> : null}
              {isHost && !s.host ? <Button small variant="ghost" label="Retirer" onPress={() => send({ t: 'kick', seatId: s.id })} /> : null}
            </View>
          ))}
        </View>
      </DashCard>

      {isHost ? (
        <>
          <RolesCard settings={shown} onInfo={setInfo} />
          <ThemesCard settings={shown} />
          <ComfortCard settings={shown} />
        </>
      ) : (
        <DashCard title="Réglages de l'hôte">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{pills.map((p) => <Pill key={p} label={p} />)}</View>
        </DashCard>
      )}

      <View style={{ gap: 12 }}>
        {isHost ? <Button arrow label="Lancer la manche" disabled={count < MIN_PLAYERS} onPress={() => send({ t: 'start' })} /> : null}
        <Button variant="ghost" label="Quitter la salle" onPress={leave} />
      </View>
      <RoleInfoModal info={info} onClose={() => setInfo(null)} />
    </View>
  );
}
