import { Redirect } from 'expo-router';
import React from 'react';

/** Ancienne adresse de la manche locale : conservée pour les liens existants. */
export default function LegacyGame(): React.JSX.Element {
  return <Redirect href="/local" />;
}
