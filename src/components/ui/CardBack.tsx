import React, { useId } from 'react';
import Svg, { Circle, Defs, Line, Path, Pattern, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ART } from '@/theme/tokens';
import { Grain, SPARK_PATH, safeId } from './ornaments';

/** Dos de carte (300 × 400) : œil entouré de rayons, double cadre, hachures, craquelure et gouttes de sang. */
export function CardBackArt({ width, closed }: { width: number; closed?: boolean }): React.JSX.Element {
  const id = safeId(useId());
  const vg = `${id}v`;
  const C = ART.cream; const B = ART.blood; const V = ART.violet;
  const rays = Array.from({ length: 20 }, (_, i) => {
    const a = (i / 20) * Math.PI * 2; const r0 = 76; const r1 = i % 2 ? 86 : 94;
    return `M${(150 + Math.cos(a) * r0).toFixed(1)} ${(195 + Math.sin(a) * r0).toFixed(1)}L${(150 + Math.cos(a) * r1).toFixed(1)} ${(195 + Math.sin(a) * r1).toFixed(1)}`;
  }).join('');
  return (
    <Svg width={width} height={(width * 4) / 3} viewBox="0 0 300 400">
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={7} height={7} patternTransform="rotate(45)">
          <Line x1={0} y1={0} x2={0} y2={7} stroke={C} strokeWidth={1.1} opacity={0.5} />
        </Pattern>
        <RadialGradient id={vg} cx={150} cy={190} r={250} gradientUnits="userSpaceOnUse">
          <Stop offset="0.55" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.45} />
        </RadialGradient>
      </Defs>
      <Rect width={300} height={400} rx={6} fill={V} />
      <Grain w={300} h={400} color={C} seed={9} density={0.5} opacity={0.14} />
      <Polygon points="20,20 130,20 20,130" fill={`url(#${id})`} />
      <Polygon points="280,380 170,380 280,270" fill={`url(#${id})`} />
      <Rect x={9} y={9} width={282} height={382} rx={3} fill="none" stroke={C} strokeWidth={2.6} strokeLinejoin="round" />
      <Rect x={20} y={20} width={260} height={360} fill="none" stroke={C} strokeWidth={1} opacity={0.75} />
      <Path d="M60 12L66 74M232 12L228 48M268 12L271 92" stroke={B} strokeWidth={3.4} strokeLinecap="round" fill="none" />
      <Circle cx={66} cy={78} r={4.2} fill={B} /><Circle cx={228} cy={52} r={3.6} fill={B} /><Circle cx={271} cy={96} r={4} fill={B} />
      <Circle cx={150} cy={195} r={104} fill="none" stroke={C} strokeWidth={1} strokeDasharray="3 8" opacity={0.7} strokeLinecap="round" />
      <Circle cx={150} cy={195} r={70} fill="none" stroke={C} strokeWidth={2.2} />
      <Path d={rays} stroke={C} strokeWidth={1.6} strokeLinecap="round" fill="none" />
      {closed ? (
        <>
          <Path d="M96 195Q150 232 204 195" fill="none" stroke={C} strokeWidth={2.8} strokeLinecap="round" />
          <Path d="M110 206L104 219M130 215L127 230M150 219L150 234M170 215L173 230M190 206L196 219" stroke={C} strokeWidth={1.8} strokeLinecap="round" fill="none" />
          <Path d="M88 150L212 240" stroke={B} strokeWidth={3} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Path d="M96 195Q150 146 204 195Q150 244 96 195Z" fill={V} stroke={C} strokeWidth={2.4} strokeLinejoin="round" />
          <Circle cx={150} cy={195} r={25} fill="none" stroke={C} strokeWidth={2} />
          <Circle cx={150} cy={195} r={13} fill={B} />
          <Circle cx={144} cy={189} r={3.2} fill={C} />
          <Path d="M110 176L102 162M130 163L126 146M150 157L150 138M170 163L174 146M190 176L198 162" stroke={C} strokeWidth={1.6} strokeLinecap="round" fill="none" />
        </>
      )}
      {[[56, 112], [246, 122], [60, 270], [242, 262]].map((p, i) => (
        <Path key={i} d={SPARK_PATH} fill={C} transform={`translate(${(p[0] as number) - 7} ${(p[1] as number) - 7}) scale(${14 / 24})`} />
      ))}
      <Path d="M20 318L38 310L44 294L62 288" stroke={B} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={62} cy={288} r={2.2} fill={B} />
      <Rect x={92} y={9} width={116} height={42} fill={V} stroke={C} strokeWidth={2.2} rx={2} />
      <Rect x={32} y={334} width={236} height={48} fill={V} stroke={C} strokeWidth={2.2} rx={2} />
      <Rect width={300} height={400} rx={6} fill={`url(#${vg})`} />
    </Svg>
  );
}

/** Face d'une carte retournée : parchemin gravé à l'encre, sceau rouge, étoiles ; le nom du joueur est posé dessus par le composant. */
export function CardFrontArt({ width }: { width: number }): React.JSX.Element {
  const id = safeId(useId());
  const vg = `${id}v`;
  const I = ART.green; const P = '#e3d8bb'; const B = ART.blood;
  return (
    <Svg width={width} height={(width * 4) / 3} viewBox="0 0 300 400">
      <Defs>
        <RadialGradient id={vg} cx={150} cy={190} r={250} gradientUnits="userSpaceOnUse">
          <Stop offset="0.5" stopColor="#3a2a10" stopOpacity={0} />
          <Stop offset="1" stopColor="#3a2a10" stopOpacity={0.35} />
        </RadialGradient>
      </Defs>
      <Rect width={300} height={400} rx={6} fill={P} />
      <Grain w={300} h={400} color={I} seed={4} density={0.7} opacity={0.22} />
      <Rect x={9} y={9} width={282} height={382} rx={3} fill="none" stroke={I} strokeWidth={2.6} />
      <Rect x={20} y={20} width={260} height={360} fill="none" stroke={I} strokeWidth={1} opacity={0.7} />
      <Circle cx={150} cy={190} r={74} fill="none" stroke={I} strokeWidth={1.4} strokeDasharray="3 7" />
      <Circle cx={150} cy={190} r={52} fill={B} />
      <Circle cx={150} cy={190} r={52} fill="none" stroke={I} strokeWidth={2.2} />
      <Path d={SPARK_PATH} fill="#f1e8d0" transform="translate(118 158) scale(2.67)" />
      {[[52, 62], [248, 62], [52, 322], [248, 322]].map((p, i) => (
        <Path key={i} d={SPARK_PATH} fill={I} transform={`translate(${(p[0] as number) - 9} ${(p[1] as number) - 9}) scale(${18 / 24})`} />
      ))}
      <Rect x={32} y={334} width={236} height={48} fill={P} stroke={I} strokeWidth={2.2} rx={2} />
      <Rect width={300} height={400} rx={6} fill={`url(#${vg})`} />
    </Svg>
  );
}
