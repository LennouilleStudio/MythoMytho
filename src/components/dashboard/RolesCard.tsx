import React, { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { maxImpostors, plural, type GameSettings } from '@/domain';
import { ESPION_DESC, MR_WHITE_DESC, ROLE_CATALOG } from '@/features/roleCatalog';
import { CIVIL_DESC, SHORT_LABEL, UNDERCOVER_DESC, TONE, type IconKey, type Tone } from '@/features/roleMeta';
import { useSettingsActions } from '@/state/settings';
import { AppText } from '../ui/primitives';
import { Divider } from '../ui/ornaments';
import { DashCard } from './DashCard';
import { impostorTeamSize } from './CompositionGauge';
import { CountToken, SpecialToken } from './RoleToken';

export interface RoleInfo { readonly icon: IconKey; readonly title: string; readonly desc: string; readonly tone: Tone }

const Sub = ({ children, right }: { children: string; right?: string }): React.JSX.Element => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
    <AppText bold size={14}>{children}</AppText>
    {right ? <AppText tone="muted" size={11.5}>{right}</AppText> : null}
  </View>
);

const GAP = 16;
const MIN_TILE = 112;
const MAX_TILE = 144;

/** Rôles classiques (Civils, Undercover, Mr. White) puis rôles spéciaux (Espion compris), en cartes de même taille. */
export function RolesCard({ settings: s, onInfo }: { settings: GameSettings; onInfo: (r: RoleInfo) => void }): React.JSX.Element {
  const a = useSettingsActions();
  const [gridW, setGridW] = useState(0);
  // Colonnes selon la largeur disponible (3 sur téléphone, 4 à 5 sur grand écran) ; les cartes se partagent la ligne.
  const cols = Math.max(2, Math.min(5, Math.floor((gridW + GAP) / (MIN_TILE + GAP)) || 3));
  const size = gridW > 0 ? Math.min(MAX_TILE, Math.floor((gridW - GAP * (cols - 1) - 1) / cols)) : MIN_TILE;
  const onLayout = (e: LayoutChangeEvent): void => setGridW(Math.round(e.nativeEvent.layout.width));
  const grid = { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 22, paddingTop: 8 } as const;

  const cap = maxImpostors(s.playerCount);
  const civils = Math.max(0, s.playerCount - impostorTeamSize(s));
  const info = (icon: IconKey, title: string, desc: string): void => onInfo({ icon, title, desc, tone: TONE[icon] });
  const activeCount = ROLE_CATALOG.filter((r) => s.roles[r.key]).length + (s.espionCount > 0 ? 1 : 0);
  return (
    <DashCard title="Les rôles">
      <View onLayout={onLayout} style={{ gap: 16 }}>
        <Sub>Rôles classiques</Sub>
        <View style={grid}>
          <CountToken size={size} fixed icon="civil" short="Civils" value={civils} min={0} max={99} onInfo={() => info('civil', 'Civils', CIVIL_DESC)} />
          <CountToken size={size} icon="undercover" short="Undercover" value={s.undercoverCount} min={1} max={Math.max(1, cap - s.mrWhiteCount - s.espionCount)}
            onChange={(n) => a.setCount('undercoverCount', n)} onInfo={() => info('undercover', 'Undercover', UNDERCOVER_DESC)} />
          <CountToken size={size} icon="mrwhite" short="Mr. White" value={s.mrWhiteCount} min={0} max={Math.max(0, cap - s.undercoverCount - s.espionCount)}
            onChange={(n) => a.setCount('mrWhiteCount', n)} onInfo={() => info('mrwhite', 'Mr. White', MR_WHITE_DESC)} />
        </View>
        <Divider />
        <Sub right={activeCount ? `${activeCount} ${plural(activeCount, 'activé', 'activés')}` : 'Aucun activé'}>Rôles spéciaux</Sub>
        <AppText tone="muted" size={11.5}>Un joueur ne reçoit qu'un seul rôle spécial (l'Espion, comme Mr. White, n'entre pas dans cette limite). Touchez une carte pour l'activer, « ? » pour son explication.</AppText>
        <View style={grid}>
          <CountToken size={size} icon="espion" short="Espion" value={s.espionCount} min={0} max={Math.max(0, cap - s.undercoverCount - s.mrWhiteCount)}
            onChange={(n) => a.setCount('espionCount', n)} onInfo={() => info('espion', 'Espion', ESPION_DESC)} />
          {ROLE_CATALOG.map((r) => (
            <SpecialToken key={r.key} size={size} icon={r.key} label={r.label} short={SHORT_LABEL[r.key]} active={s.roles[r.key]}
              onToggle={() => a.toggleRole(r.key)} onInfo={() => info(r.key, r.label, r.desc)} />
          ))}
        </View>
      </View>
    </DashCard>
  );
}
