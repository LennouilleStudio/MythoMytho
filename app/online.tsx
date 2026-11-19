import { Redirect } from 'expo-router';
import React from 'react';

/** Ancienne adresse du mode en ligne : il est maintenant l'accueil. */
export default function LegacyOnline(): React.JSX.Element {
  return <Redirect href="/" />;
}
