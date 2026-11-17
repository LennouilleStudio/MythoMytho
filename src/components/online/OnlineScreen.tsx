import React from 'react';
import { useOnline } from '@/state/online';
import { Page, Screen } from '../ui/Screen';
import { JoinForm } from './JoinForm';
import { Lobby } from './Lobby';
import { OnlineGame } from './OnlineGame';

/** Mode en ligne : formulaire → salon → partie, selon ce que le serveur nous montre. */
export function OnlineScreen(): React.JSX.Element {
  const { view } = useOnline();
  if (!view) return <Screen><Page><JoinForm /></Page></Screen>;
  if (view.stage === 'lobby') return <Screen><Page><Lobby /></Page></Screen>;
  return <OnlineGame />;
}
