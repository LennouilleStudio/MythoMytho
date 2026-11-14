// Génère src/theme/roleArt.ts à partir de assets/icons/*.svg (illustrations « cartes de tarot » des rôles).
// Allègement sans perte visuelle : seuls les attributs qui valent déjà leur valeur par défaut sont retirés.
// Usage : node scripts/build-role-art.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'assets', 'icons');
/** Clé de rôle de l'application → nom de fichier. */
const FILES = {
  civil: 'civil', undercover: 'undercover', mrwhite: 'mr-white', espion: 'espion',
  idiot: 'idiot', fantome: 'fantome', mime: 'mime', procureur: 'procureur', amoureux: 'amoureux',
  mytho: 'mytho', voyeur: 'voyeur', janus: 'janus', fauxfrere: 'faux-frere', jumeaux: 'jumeaux',
  tiresias: 'tiresias', orion: 'orion', hercule: 'hercule', prometheus: 'promethee', judas: 'judas',
};

function slim(svg) {
  let s = svg.replace(/\s+role="img"/, '');
  // « stroke="none" stroke-width="0" » est le comportement par défaut ; un « stroke-width="0" » isolé (avec un trait coloré) reste.
  s = s.replace(/ stroke="none" stroke-width="0"/g, '').replace(/ stroke="none"/g, '');
  s = s.replace(/ \/>/g, '/>');
  // Largeur/hauteur fixes retirées : la taille vient du composant.
  s = s.replace(/ width="400" height="400"/, '');
  return s;
}

const art = {}; const bg = {};
for (const [key, file] of Object.entries(FILES)) {
  const raw = readFileSync(join(dir, `${file}.svg`), 'utf8').trim();
  art[key] = slim(raw);
  const m = /<rect width="400" height="400" fill="(#[0-9a-fA-F]{6})"/.exec(raw);
  bg[key] = (m ? m[1] : '#0e1613').toLowerCase();
}

const out = `/* Généré par scripts/build-role-art.mjs depuis assets/icons/*.svg — ne pas modifier à la main. */
import type { IconKey } from '@/features/roleMeta';

/** Fond de chaque carte (vert, violet ou bordeaux nuit) : sert de teinte à la tuile du rôle. */
export const ROLE_BG: Readonly<Record<IconKey, string>> = ${JSON.stringify(bg, null, 2)};

/** Illustrations 400 × 400 (SVG en texte, rendues par SvgXml). */
export const ROLE_ART: Readonly<Record<IconKey, string>> = ${JSON.stringify(art, null, 1)};
`;
writeFileSync(join(root, 'src', 'theme', 'roleArt.ts'), out);
const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`roleArt.ts : ${Object.keys(art).length} illustrations, ${kb} Ko`);
console.log(bg);
