import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { SetupScreen } from '@/components/setup/SetupScreen';

/** Mode local (un seul appareil, passé de main en main) : configuration d'une manche. Même écran qu'avant, désormais sur /local. */
export default function LocalIndex(): React.JSX.Element {
  const { action } = useLocalSearchParams<{ action?: string }>();
  const router = useRouter();
  useEffect(() => {
    if (action === 'scores') router.replace('/scores');
    if (action === 'pairs') router.replace('/custom-pairs');
  }, [action, router]);
  return <SetupScreen />;
}
