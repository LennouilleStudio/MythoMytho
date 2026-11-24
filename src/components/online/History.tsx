import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { historyText, roundText } from '@/net/summary';
import type { RoundSummary } from '@/net/protocol';
import { copyText } from '@/services/clipboard';
import { useToast } from '@/state/toast';
import { AppText, Button } from '../ui/primitives';

/** Déroulé des manches de la salle : votes de chaque tour, éliminations, rôles. Visible une fois la manche terminée. */
export function HistoryPanel({ history }: { history: readonly RoundSummary[] }): React.JSX.Element | null {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  if (history.length === 0) return null;
  const share = async (): Promise<void> => {
    const text = `MythoMytho — ${history.length > 1 ? 'historique de la salle' : 'récapitulatif'}\n\n${historyText(history)}`;
    try { await Share.share({ message: text }); } catch { toast((await copyText(text)) ? 'Récapitulatif copié.' : 'Partage indisponible.'); }
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Button small variant="ghost" label={open ? 'Masquer le déroulé' : `Voir le déroulé (${history.length} ${history.length > 1 ? 'manches' : 'manche'})`} onPress={() => setOpen((o) => !o)} />
        <Button small variant="ghost" label="Partager l'historique" onPress={() => { void share(); }} />
      </View>
      {open ? (
        <View style={{ gap: 14 }}>
          {[...history].reverse().map((r, i) => (
            <View key={`${r.round}-${i}`} style={{ gap: 4 }}>
              <AppText bold size={13}>{`Manche ${r.round} — ${r.title}`}</AppText>
              <AppText size={12} tone="muted" style={{ lineHeight: 18 }}>{roundText(r).split('\n').slice(1).join('\n')}</AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
