import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { toQR } from 'toqr';

/** Zone de silence autour du code (en modules) : 4 selon la norme, pour que tous les lecteurs le détectent. */
const QUIET = 4;

/**
 * Code QR (noir sur blanc, quel que soit le thème : les lecteurs attendent du contraste, pas de la couleur d'application).
 * Un seul tracé SVG, donc léger même pour un code de 45 modules.
 */
export function QrCode({ value, size = 168, label }: { value: string; size?: number; label?: string }): React.JSX.Element {
  const { path, n } = useMemo(() => {
    const flat = toQR(value);
    const side = Math.round(Math.sqrt(flat.length));
    let d = '';
    for (let y = 0; y < side; y++) {
      let x = 0;
      while (x < side) {
        if (flat[y * side + x] !== 1) { x++; continue; }
        let run = 1;
        while (x + run < side && flat[y * side + x + run] === 1) run++;
        d += `M${x + QUIET} ${y + QUIET}h${run}v1h-${run}z`;
        x += run;
      }
    }
    return { path: d, n: side + QUIET * 2 };
  }, [value]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label ?? 'Code QR pour rejoindre la salle'} style={{ width: size, height: size, borderRadius: 6, overflow: 'hidden' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
        <Rect x={0} y={0} width={n} height={n} fill="#ffffff" />
        {/* Bords nets sur le web (sans lissage entre modules) ; propriété absente des types de react-native-svg. */}
        <Path d={path} fill="#000000" {...({ shapeRendering: 'crispEdges' } as object)} />
      </Svg>
    </View>
  );
}
