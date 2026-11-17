import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { GameProvider } from './game';
import { LibraryProvider } from './library';
import { OnlineProvider } from './online';
import { SettingsProvider } from './settings';
import { ToastProvider } from './toast';

export function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ToastProvider>
          <SettingsProvider>
            <LibraryProvider>
              <GameProvider><OnlineProvider>{children}</OnlineProvider></GameProvider>
            </LibraryProvider>
          </SettingsProvider>
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
