import { useMemo } from 'react';
import { buzz, playFlip, playStamp } from '@/services/feedback';
import { useSettings } from '@/state/settings';

/** Sons et vibrations des cartes, coupés d'un coup par le réglage « Sons et vibrations des cartes ». */
export function useFeedback(): { flip: () => void; stamp: () => void; deal: () => void } {
  const { settings } = useSettings();
  const on = settings.effects;
  return useMemo(() => ({
    flip: () => { if (!on) return; buzz(12); playFlip(); },
    /** Carte posée sur la table : froissement seul, sans vibration (14 cartes à la suite feraient trembler l'appareil). */
    deal: () => { if (!on) return; playFlip(); },
    stamp: () => { if (!on) return; buzz([0, 38, 30, 18]); playStamp(); },
  }), [on]);
}
