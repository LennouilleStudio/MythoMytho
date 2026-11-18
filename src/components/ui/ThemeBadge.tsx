import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { ART } from '@/theme/tokens';
import { Hatch, Safe, SPARK_PATH } from './ornaments';

const CROWN = 'M3 6l5 4 4-7 4 7 5-4-2 13H5Z';
const PEN = 'M4 20L17 7M11 5l8 8M4 20l1.6-5';

interface Glyph { readonly tint: string; readonly node: (c: string) => React.JSX.Element }

/** Un emblème gravé et une teinte par thème de mots (24 × 24, trait crème). */
const GLYPHS: Readonly<Record<string, Glyph>> = {
  classique: { tint: ART.green, node: (c) => <Path d={SPARK_PATH} fill={c} /> },
  metier: { tint: ART.violet, node: (c) => <Path d="M6 3l12 7-5.2 1.6L15.6 19l-2.6 1-2.8-7.4L6 16z" fill={c} /> },
  sportauto: { tint: ART.burgundy, node: (c) => <><Circle cx={12} cy={12} r={9} fill="none" stroke={c} strokeWidth={1.8} /><Circle cx={12} cy={12} r={2.4} fill={c} /><Path d="M3.2 12H9.6M14.4 12h6.4M12 14.4V20.6" stroke={c} strokeWidth={1.8} strokeLinecap="round" /></> },
  popculture: { tint: ART.violet, node: (c) => <><Circle cx={12} cy={12} r={9} fill="none" stroke={c} strokeWidth={1.8} /><Path d="M10 8l6.4 4-6.4 4z" fill={c} /></> },
  celebrites: { tint: ART.burgundy, node: (c) => <Path d={CROWN} fill={c} /> },
  jeuxdemots: { tint: ART.green, node: (c) => <><Path d="M3.5 4.5h17v11h-9l-4.5 4v-4h-3.5z" fill="none" stroke={c} strokeWidth={1.8} strokeLinejoin="round" /><Path d="M7.5 9h9M7.5 12h5" stroke={c} strokeWidth={1.6} strokeLinecap="round" /></> },
  homophones: { tint: ART.violet, node: (c) => <Path d="M3 9c3-4 6 4 9 0s6 4 9 0M3 15c3-4 6 4 9 0s6 4 9 0" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" /> },
};
const TINTS = [ART.green, ART.violet, ART.burgundy] as const;

function fallback(key: string): Glyph {
  let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { tint: TINTS[h % 3] as string, node: (c) => <Path d={PEN} fill="none" stroke={c} strokeWidth={1.9} strokeLinecap="round" /> };
}

/** Petite carte-emblème d'un thème de mots (carte dont la teinte et le symbole dépendent du thème). */
export function ThemeBadge({ themeKey, size = 46, on }: { themeKey: string; size?: number; on: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const g = GLYPHS[themeKey] ?? fallback(themeKey);
  return (
    <View style={{ width: size, height: size, borderRadius: 3, backgroundColor: g.tint, borderWidth: 1.5, borderColor: on ? colors.accent : colors.line, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: on ? 1 : 0.72 }}>
      <Hatch color="rgba(217,204,176,0.2)" gap={5} />
      <View style={{ position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: 1, borderColor: 'rgba(217,204,176,0.4)' }} />
      <Safe><Svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24">{g.node(ART.cream)}</Svg></Safe>
    </View>
  );
}
