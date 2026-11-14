import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { formatClock } from '@/domain';
import { buzz, playTimerEnd } from '@/services/feedback';
import { useTheme } from '@/theme/ThemeProvider';
import { Hatch } from '../ui/ornaments';
import { AppText, Button, Callout } from '../ui/primitives';

/** Minuteur de discussion : démarre quand toutes les cartes sont vues, borné par l'horloge (pas de dérive). */
export function DiscussionTimer({ minutes, sound, active, resetKey, onRunningChange }: {
  minutes: number; sound: boolean; active: boolean; resetKey: number; onRunningChange?: (running: boolean) => void;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const baseTotal = minutes * 60;
  const [total, setTotal] = useState(baseTotal);
  const [left, setLeft] = useState(baseTotal);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const endAt = useRef(0);

  useEffect(() => { setTotal(baseTotal); setLeft(baseTotal); setRunning(false); setStarted(false); }, [resetKey, baseTotal]);
  useEffect(() => {
    if (active && !started) { endAt.current = Date.now() + baseTotal * 1000; setStarted(true); setRunning(true); }
  }, [active, started, baseTotal]);
  useEffect(() => { onRunningChange?.(running); }, [running, onRunningChange]);
  useEffect(() => () => onRunningChange?.(false), [onRunningChange]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        setRunning(false);
        buzz([200, 100, 200, 100, 400]);
        if (sound) playTimerEnd();
      }
    }, 250);
    return () => clearInterval(id);
  }, [running, sound]);

  const toggle = useCallback(() => {
    if (running) setRunning(false);
    else if (left > 0) { endAt.current = Date.now() + left * 1000; setRunning(true); }
  }, [running, left]);
  const extend = useCallback(() => {
    setTotal((t) => t + 60); setLeft((l) => l + 60); endAt.current += 60000;
    if (!running) { endAt.current = Date.now() + (left + 60) * 1000; setRunning(true); }
  }, [running, left]);

  if (!started) return null;
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const over = left === 0;
  return (
    <View style={{ marginBottom: 18 }}>
      <Callout accent={over ? 'blood' : 'default'}>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <AppText tone={over ? 'blood' : 'muted'} size={11} style={{ letterSpacing: 1.3, textTransform: 'uppercase' }}>{over ? 'Temps écoulé — place au vote !' : 'Temps de discussion'}</AppText>
            <AppText bold tone={over ? 'blood' : 'accent'} size={22}>{formatClock(left)}</AppText>
          </View>
          <View style={{ height: 8, borderRadius: 2, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.bg, overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: over ? colors.blood : colors.accent }}><Hatch color="rgba(14,22,19,0.38)" gap={4} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button small variant="ghost" label={running ? 'Pause' : 'Reprendre'} onPress={toggle} disabled={left === 0} />
            <Button small variant="ghost" label="+1 min" onPress={extend} />
          </View>
        </View>
      </Callout>
    </View>
  );
}
