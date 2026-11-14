import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { AppProviders } from '@/state/AppProviders';
import { Splash } from '@/components/ui/Splash';
import { useTheme } from '@/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync();

function Shell(): React.JSX.Element {
  const { mode, colors } = useTheme();
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="game" options={{ gestureEnabled: false }} />
        <Stack.Screen name="scores" options={{ presentation: 'modal' }} />
        <Stack.Screen name="custom-pairs" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout(): React.JSX.Element | null {
  const [loaded, error] = useFonts({
    CourierPrime: require('../assets/fonts/CourierPrime-Regular.ttf'),
    'CourierPrime-Bold': require('../assets/fonts/CourierPrime-Bold.ttf'),
    'CourierPrime-Italic': require('../assets/fonts/CourierPrime-Italic.ttf'),
    'Outfit-Bold': require('../assets/fonts/Outfit-Bold.ttf'),
    // Sirelia sans ses 36 ligatures vides (« el », « ma », « er »… faisaient disparaître des lettres).
    Sirelia: require('../assets/fonts/SireliaFixed.otf'),
  });
  // L'écran d'accueil (carte « Le Mytho ») reste affiché au moins 1,1 s : assez pour être vu, trop court pour gêner.
  const [minTime, setMinTime] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMinTime(true), 1100); return () => clearTimeout(t); }, []);
  // L'écran natif (image statique) se retire dès que le nôtre peut s'afficher : il ne dépend d'aucune police.
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  if ((!loaded && !error) || !minTime) return <Splash />;
  return (
    <AppProviders>
      <Shell />
    </AppProviders>
  );
}
