import React, { useEffect } from 'react';
import { Animated, Easing, View } from 'react-native';
import type { Player } from '@/domain';
import { cardIcon } from '@/features/roleMeta';
import { CardBackSquare, backStyle } from '../ui/CardBack';
import { RoleTile } from '../ui/RoleTile';
import { useProgress, useReducedMotion } from '../ui/motion';
import { useFeedback } from '../ui/useFeedback';

const IN_OUT = Easing.inOut(Easing.cubic);

/** Carte du joueur éliminé : arrive face cachée (son dos), se retourne en grand et révèle son rôle illustré. */
export function RevealFlip({ player, index, size, delay = 450 }: { player: Player; index: number; size: number; delay?: number }): React.JSX.Element {
  const reduce = useReducedMotion();
  const fx = useFeedback();
  const turn = useProgress(true, { duration: 780, delay, easing: IN_OUT });
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(fx.flip, delay + 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const back = backStyle(index);
  const face = { position: 'absolute', top: 0, left: 0, width: size, height: size, backfaceVisibility: 'hidden' } as const;
  if (reduce) return <RoleTile icon={cardIcon(player, true)} active size={size} />;
  const rotBack = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const rotFront = turn.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const lift = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -18, 0] });
  const grow = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.1, 1] });
  // Une rotation par face (pas sur le parent) : fonctionne aussi sur le web, sans `preserve-3d`.
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={{ width: size, height: size, transform: [{ translateY: lift }, { scale: grow }] }}>
        <Animated.View style={{ ...face, transform: [{ perspective: 1000 }, { rotateY: rotBack }] }}><CardBackSquare size={size} tint={back.tint} mark={back.mark} /></Animated.View>
        <Animated.View style={{ ...face, transform: [{ perspective: 1000 }, { rotateY: rotFront }] }}><RoleTile icon={cardIcon(player, true)} active size={size} /></Animated.View>
      </Animated.View>
    </View>
  );
}
