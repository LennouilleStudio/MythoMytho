import React, { useState } from 'react';
import { View } from 'react-native';
import { useOnline } from '@/state/online';
import { DashCard } from '../dashboard/DashCard';
import { AppText, Button, Field, Pill, Segmented, Toggle } from '../ui/primitives';

const VOTE_CHOICES = [0, 30, 60, 90, 120] as const;

/** Options de la salle : verrou, mot de passe, limite de temps du vote, chat. L'hôte les règle, les autres les voient. */
export function RoomOptions(): React.JSX.Element | null {
  const { view, send } = useOnline();
  const [pw, setPw] = useState('');
  if (!view) return null;
  const o = view.options;
  if (!view.isHost) {
    const pills = [o.locked ? 'Salle verrouillée' : null, o.hasPassword ? 'Protégée par mot de passe' : null, o.voteSec > 0 ? `Vote limité à ${o.voteSec} s` : null, o.chat ? 'Chat activé' : null].filter((p): p is string => p !== null);
    return pills.length === 0 ? null : (
      <DashCard title="Options de la salle"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{pills.map((p) => <Pill key={p} label={p} />)}</View></DashCard>
    );
  }
  return (
    <DashCard title="Options de la salle" hint="Ces options se règlent aussi pendant la partie, sauf le mot de passe d'entrée qui ne concerne que les nouveaux arrivants.">
      <View style={{ gap: 14, paddingTop: 6 }}>
        <Toggle label="Verrouiller la salle" desc="Plus personne ne peut entrer. Les joueurs déjà présents peuvent se reconnecter." value={o.locked} onChange={(locked) => send({ t: 'lock', locked })} />
        <View style={{ gap: 8 }}>
          <Field label={o.hasPassword ? 'Mot de passe (défini)' : 'Mot de passe de la salle (facultatif)'} value={pw} onChangeText={setPw} maxLength={64} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder={o.hasPassword ? '••••••••' : 'Laisser vide : salle ouverte'} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Button small variant="ghost" label={o.hasPassword ? 'Changer' : 'Protéger'} disabled={!pw.trim()} onPress={() => { send({ t: 'password', password: pw.trim() }); setPw(''); }} />
            {o.hasPassword ? <Button small variant="ghost" label="Retirer le mot de passe" onPress={() => { send({ t: 'password', password: null }); setPw(''); }} /> : null}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <AppText label size={11} tone="muted" style={{ letterSpacing: 1.6, textTransform: 'uppercase' }}>Temps pour voter</AppText>
          <Segmented<number> options={VOTE_CHOICES.map((sec) => ({ key: sec, label: sec === 0 ? 'Aucune limite' : `${sec} s` }))} value={o.voteSec} onChange={(voteSec) => send({ t: 'options', voteSec })} />
          <AppText size={11} tone="muted">À la fin du temps, le vote est dépouillé avec les bulletins reçus. Un joueur qui laisse passer deux votes de suite est « inactif » : il ne bloque plus la partie.</AppText>
        </View>
        <Toggle label="Chat de la salle" desc="Messages courts pour tous les joueurs (les spectateurs et éliminés lisent sans écrire pendant la manche)." value={o.chat} onChange={(chat) => send({ t: 'options', chat })} />
      </View>
    </DashCard>
  );
}
