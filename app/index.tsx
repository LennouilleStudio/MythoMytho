import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { OnlineScreen } from '@/components/online/OnlineScreen';

/**
 * Accueil = jeu en ligne (chaque joueur sur son appareil). Le mode « un seul appareil » vit sur /local.
 * Raccourcis PWA conservés : /?action=scores et /?action=pairs.
 */
export default function Index(): React.JSX.Element {
  const { action } = useLocalSearchParams<{ action?: string }>();
  const router = useRouter();
  useEffect(() => {
    if (action === 'scores') router.replace('/scores');
    if (action === 'pairs') router.replace('/custom-pairs');
  }, [action, router]);
  return <OnlineScreen />;
}
