import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MAX_CHAT, REACTIONS } from '@/net/protocol';
import { useOnline } from '@/state/online';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/tokens';
import { AppText, Button, Field } from '../ui/primitives';

/** Réactions rapides : une rangée d'emoji, envoyées à toute la salle (le serveur n'accepte que cette liste). */
export function ReactionBar(): React.JSX.Element {
  const { send } = useOnline();
  const { colors } = useTheme();
  const last = useRef(0);
  return (
    <View accessibilityRole="toolbar" accessibilityLabel="Réactions rapides" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {REACTIONS.map((emoji) => (
        <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`Réagir ${emoji}`}
          onPress={() => { const t = Date.now(); if (t - last.current < 400) return; last.current = t; send({ t: 'react', emoji }); }}
          style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }}>
          <Text style={{ fontSize: 20 }}>{emoji}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Dernières réactions reçues (elles s'effacent seules après quelques secondes). */
export function ReactionTicker(): React.JSX.Element | null {
  const { reactions } = useOnline();
  const { colors } = useTheme();
  if (reactions.length === 0) return null;
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {reactions.map((r) => (
        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.lineStrong, paddingVertical: 3, paddingHorizontal: 9 }}>
          <Text style={{ fontSize: 16 }}>{r.emoji}</Text>
          <Text style={{ color: colors.muted, fontFamily: fonts.label, fontSize: 11 }}>{r.name}</Text>
        </View>
      ))}
    </View>
  );
}

/** Chat de la salle (si l'hôte l'a activé). Les spectateurs et les joueurs éliminés lisent sans écrire pendant la manche. */
export function ChatPanel(): React.JSX.Element | null {
  const { view, send, chat, chatUnread, markChatRead } = useOnline();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  useEffect(() => { if (open && chatUnread > 0) markChatRead(); }, [open, chatUnread, markChatRead]);
  if (!view?.options.chat) return null;
  const g = view.game;
  const blocked = g && g.phase !== 'gameover' ? (g.spectator ? 'Les spectateurs lisent sans écrire pendant la manche.' : g.me?.eliminated ? 'Les joueurs éliminés restent silencieux.' : null) : null;
  const submit = (): void => { const t = text.trim(); if (!t || blocked) return; send({ t: 'chat', text: t }); setText(''); };
  return (
    <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, backgroundColor: colors.bg }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
        <Text style={{ color: colors.text, fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase' }}>{`Chat${chatUnread > 0 ? ` · ${chatUnread} nouveau${chatUnread > 1 ? 'x' : ''}` : ''}`}</Text>
        <Text style={{ color: colors.muted, fontSize: 14 }}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? (
        <View style={{ padding: 12, paddingTop: 0, gap: 10 }}>
          <View style={{ gap: 5, maxHeight: 220, overflow: 'hidden' }}>
            {chat.length === 0 ? <AppText size={12} tone="muted">Aucun message pour l'instant.</AppText> : chat.slice(-30).map((m, i) => (
              <Text key={`${m.at}-${i}`} style={{ color: colors.text, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 }}>
                <Text style={{ fontFamily: fonts.bold, color: colors.accent }}>{`${m.name} : `}</Text>{m.text}
              </Text>
            ))}
          </View>
          {blocked ? <AppText size={11.5} tone="muted">{blocked}</AppText> : (
            <View style={{ gap: 8 }}>
              <Field value={text} onChangeText={setText} maxLength={MAX_CHAT} placeholder="Écrire un message…" returnKeyType="send" onSubmitEditing={submit} />
              <Button small variant="ghost" label="Envoyer" disabled={!text.trim()} onPress={submit} />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Réactions + chat, réunis pour le salon et la manche. */
export function SocialDock(): React.JSX.Element {
  return (
    <View style={{ gap: 10 }}>
      <ReactionTicker />
      <ReactionBar />
      <ChatPanel />
    </View>
  );
}
