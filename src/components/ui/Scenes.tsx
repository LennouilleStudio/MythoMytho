import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path, Polygon, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { ART } from '@/theme/tokens';
import { CardBackBody } from './CardBack';
import { CrackShape, SPARK_PATH, safeId } from './ornaments';

/**
 * Petites scènes illustrées pour les états vides et les erreurs, dans le même vocabulaire que les cartes :
 * une carte seule sur la table (rien à afficher), une carte déchirée (introuvable, fichier invalide).
 */

/** Une carte seule au milieu de trois emplacements vides en tirets. */
export function LoneCardScene({ width = 330 }: { width?: number }): React.JSX.Element {
  const { colors } = useTheme();
  const h = (width * 190) / 300;
  const slot = (x: number, rot: number): React.JSX.Element => (
    <G transform={`translate(${x} 30) rotate(${rot} 40 55)`}>
      <Rect width={80} height={110} rx={4} fill="none" stroke={colors.line} strokeWidth={1.4} strokeDasharray="4 6" strokeLinecap="round" />
    </G>
  );
  return (
    <View style={{ alignSelf: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={h} viewBox="0 0 300 190">
        {slot(14, -8)}{slot(206, 8)}
        <Circle cx={150} cy={178} r={104} fill="none" stroke={colors.line} strokeWidth={1} strokeDasharray="3 8" strokeLinecap="round" opacity={0.6} />
        <G transform="translate(112 18) rotate(-4 38 56) scale(0.25)">
          <CardBackBody tint={ART.violet} mark={2} />
        </G>
        <Path d={SPARK_PATH} fill={colors.accentSoft} transform="translate(60 150) scale(0.5)" />
        <Path d={SPARK_PATH} fill={colors.accentSoft} transform="translate(232 24) scale(0.4)" />
        <Path d="M150 0V10" stroke={ART.blood} strokeWidth={3} strokeLinecap="round" />
        <Circle cx={150} cy={14} r={3} fill={ART.blood} />
      </Svg>
    </View>
  );
}

/** Une carte déchirée en deux, les moitiés écartées, la déchirure soulignée de rouge. */
export function TornCardScene({ width = 220 }: { width?: number }): React.JSX.Element {
  const id = safeId(useId());
  const h = (width * 440) / 380;
  // Déchirure en dents de scie, de haut en bas, autour de x = 150.
  const teeth: Array<[number, number]> = [];
  for (let y = 0; y <= 400; y += 25) teeth.push([150 + (Math.round(y / 25) % 2 === 0 ? -9 : 9) + ((y * 7) % 11) - 5, y]);
  const left = `0,0 ${teeth.map((p) => p.join(',')).join(' ')} 0,400`;
  const right = `300,0 ${teeth.map((p) => p.join(',')).join(' ')} 300,400`;
  const crack = teeth.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');
  return (
    <View style={{ alignSelf: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={h} viewBox="0 0 380 440">
        <Defs>
          <ClipPath id={`${id}l`}><Polygon points={left} /></ClipPath>
          <ClipPath id={`${id}r`}><Polygon points={right} /></ClipPath>
        </Defs>
        <G transform="translate(6 24) rotate(-7 75 200)">
          <G clipPath={`url(#${id}l)`}><CardBackBody closed tint={ART.violet} /></G>
          <Path d={crack} stroke={ART.blood} strokeWidth={3} fill="none" strokeLinejoin="round" />
        </G>
        <G transform="translate(70 40) rotate(8 225 200)">
          <G clipPath={`url(#${id}r)`}><CardBackBody closed tint={ART.violet} /></G>
          <Path d={crack} stroke={ART.blood} strokeWidth={3} fill="none" strokeLinejoin="round" />
        </G>
        <Path d="M170 410l8 14-12-4zM196 426l5 9-9-3z" fill={ART.cream} opacity={0.8} />
        <CrackShape color={ART.blood} points={[[20, 420], [40, 432], [52, 420]]} />
      </Svg>
    </View>
  );
}
