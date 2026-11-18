import React from 'react';
import { Platform } from 'react-native';
import { SvgXml } from 'react-native-svg';
import type { IconKey } from '@/features/roleMeta';
import { ROLE_ART } from '@/theme/roleArt';
import { Safe } from './ornaments';

/**
 * Illustration « carte de tarot » d'un rôle (SVG d'origine, 400 × 400, légendes incluses).
 * Web : le navigateur dessine le SVG lui-même (fidèle et bien plus léger que d'en recréer 4 000 éléments React) ;
 * mobile : `SvgXml`.
 */
export const RoleArt = React.memo(function RoleArt({ role, size }: { role: IconKey; size: number }): React.JSX.Element {
  const xml = ROLE_ART[role];
  if (Platform.OS === 'web') {
    const sized = xml.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `);
    return React.createElement('div', { style: { width: size, height: size, pointerEvents: 'none' }, role: 'img', 'aria-label': role, dangerouslySetInnerHTML: { __html: sized } });
  }
  return <Safe><SvgXml xml={xml} width={size} height={size} /></Safe>;
});
