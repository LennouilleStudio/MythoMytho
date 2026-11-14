import React from 'react';
import { SvgXml } from 'react-native-svg';
import type { IconKey } from '@/features/roleMeta';
import { ROLE_ART } from '@/theme/roleArt';

/** Illustration « carte de tarot » d'un rôle (SVG d'origine, 400 × 400, légendes incluses). */
export const RoleArt = React.memo(function RoleArt({ role, size }: { role: IconKey; size: number }): React.JSX.Element {
  return <SvgXml xml={ROLE_ART[role]} width={size} height={size} />;
});
