import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { percent, plural, type LeaderRow } from '@/domain';
import { useTheme } from '@/theme/ThemeProvider';
import { ART, fonts } from '@/theme/tokens';
import { CardFrontArt } from '../ui/CardBack';
import { Hatch, Sparkle } from '../ui/ornaments';

const HEIGHTS: Readonly<Record<number, number>> = { 1: 84, 2: 62, 3: 46 };

/** Pile de cartes (autant que de victoires, 3 au plus) posée sur son socle hachuré. */
function Column({ row, rank, cardW }: { row: LeaderRow; rank: 1 | 2 | 3; cardW: number }): React.JSX.Element {
  const { colors } = useTheme();
  const layers = Math.max(1, Math.min(3, row.wins));
  const h = (cardW * 4) / 3;
  return (
    <View style={{ width: cardW + 26, alignItems: 'center' }}>
      <View style={{ width: cardW + 18, height: h + 16, alignItems: 'center' }}>
        {Array.from({ length: layers }, (_, i) => {
          const depth = layers - 1 - i; // 0 = carte du dessus
          return (
            <View key={i} style={{ position: 'absolute', top: 12 - depth * 6, left: 9 + (depth % 2 ? -1 : 1) * depth * 3, transform: [{ rotate: `${depth === 0 ? 0 : (depth % 2 ? -1 : 1) * (2 + depth * 1.5)}deg` }], boxShadow: '0 8px 14px -8px rgba(0,0,0,0.8)' }}>
              <CardFrontArt width={cardW} />
            </View>
          );
        })}
        <View pointerEvents="none" style={{ position: 'absolute', top: 12 + (h * 0.78), left: 9, width: cardW, alignItems: 'center' }}>
          <Text numberOfLines={1} style={{ color: ART.green, fontFamily: fonts.label, fontSize: 9.5, letterSpacing: 1.1, textTransform: 'uppercase', maxWidth: cardW - 10 }}>{row.name}</Text>
        </View>
        {rank === 1 ? <View style={{ position: 'absolute', top: 0 }}><Sparkle size={16} color={colors.bloodHi} /></View> : null}
      </View>
      <View style={{ width: cardW + 26, height: HEIGHTS[rank], overflow: 'hidden', borderWidth: 1.5, borderColor: colors.lineStrong, borderRadius: 2, backgroundColor: colors.panelAlt, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <Hatch color={colors.hatch} gap={5} />
        <Text style={{ color: rank === 1 ? colors.bloodHi : colors.accent, fontFamily: fonts.label, fontSize: rank === 1 ? 28 : 22 }}>{rank}</Text>
        <Text style={{ color: colors.muted, fontFamily: fonts.label, fontSize: 9, letterSpacing: 1 }}>{`${row.wins} ${plural(row.wins, 'victoire', 'victoires')}`}</Text>
      </View>
      {row.stat ? <Text style={{ color: colors.muted, fontFamily: fonts.body, fontSize: 10, marginTop: 6, textAlign: 'center' }}>{`${percent(row.stat.wins, row.stat.games)} % · ${row.stat.games} ${plural(row.stat.games, 'manche', 'manches')}`}</Text> : null}
    </View>
  );
}

/** Podium : 2e, 1er, 3e (ou moins), piles de cartes sur des socles de hauteurs différentes. */
export function Podium({ rows }: { rows: readonly LeaderRow[] }): React.JSX.Element | null {
  const { width } = useWindowDimensions();
  if (rows.length === 0) return null;
  const cardW = width < 600 ? 62 : 78;
  const [first, second, third] = rows;
  const order: Array<{ row: LeaderRow; rank: 1 | 2 | 3 }> = [];
  if (second) order.push({ row: second, rank: 2 });
  if (first) order.push({ row: first, rank: 1 });
  if (third) order.push({ row: third, rank: 3 });
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 6, marginBottom: 14 }}>
      {order.map((o) => <Column key={o.rank} row={o.row} rank={o.rank} cardW={cardW} />)}
    </View>
  );
}
