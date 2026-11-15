import type { IconKey } from '@/features/roleMeta';
import { ROLE_ART } from '@/theme/roleArt';

/** Ce qu'il faut pour dessiner le résumé d'une manche. */
export interface SummaryData {
  readonly round: number;
  readonly title: string;
  readonly subtitle: string;
  readonly civilWord: string;
  readonly undercoverWord: string;
  readonly date: string;
  readonly players: ReadonlyArray<{ name: string; icon: IconKey; won: boolean; roleLabel: string }>;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text: string, max: number): string[] {
  const lines: string[] = []; let cur = '';
  for (const w of text.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

const CREAM = '#d9ccb0'; const BONE = '#f1e8d0'; const BLOOD = '#8f1d27'; const INK = '#0e1613';
const FONT = "Outfit, Montserrat, 'Segoe UI', Helvetica, Arial, sans-serif";
const SPARK = 'M12 1C12.8 7 17 11.2 23 12C17 12.8 12.8 17 12 23C11.2 17 7 12.8 1 12C7 11.2 11.2 7 12 1Z';

/**
 * Carte récapitulative (SVG autonome, 1080 px de large) : titre, vainqueurs, mots, puis toutes les cartes révélées ;
 * les perdants sont voilés et barrés d'une croix rouge. Aucune ressource externe : se convertit en PNG par canvas.
 */
export function buildSummarySvg(d: SummaryData): { svg: string; width: number; height: number } {
  const W = 1080; const cols = Math.min(4, Math.max(2, d.players.length)); const tile = 214; const gap = 24;
  const gridW = cols * tile + (cols - 1) * gap; const x0 = (W - gridW) / 2;
  const subLines = wrap(d.subtitle, 58);
  const headH = 352 + subLines.length * 34;
  const rows = Math.ceil(d.players.length / cols); const rowH = tile + 62;
  const H = headH + rows * rowH + 118;
  let body = '';
  // gouttes de sang le long du bord haut
  const drips = [[90, 70], [210, 120], [360, 54], [520, 96], [670, 60], [820, 128], [950, 74], [1020, 46]];
  body += drips.map(([x, l]) => `<path d="M${x! - 5} 14L${x! + 5} 14L${x! + 0.8} ${l}L${x! - 0.8} ${l}Z" fill="${BLOOD}"/><circle cx="${x}" cy="${l! + 6}" r="6.5" fill="${BLOOD}"/>`).join('');
  body += `<text x="${W / 2}" y="168" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="58" letter-spacing="14" fill="${BONE}">MYTHOMYTHO</text>`;
  body += `<g fill="${CREAM}" opacity="0.8"><path d="${SPARK}" transform="translate(${W / 2 - 346} 142) scale(1.1)"/><path d="${SPARK}" transform="translate(${W / 2 + 322} 142) scale(1.1)"/></g>`;
  body += `<text x="${W / 2}" y="212" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="24" letter-spacing="8" fill="${CREAM}">MANCHE ${d.round}</text>`;
  body += `<text x="${W / 2}" y="290" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="46" fill="${BONE}">${esc(d.title)}</text>`;
  subLines.forEach((l, i) => { body += `<text x="${W / 2}" y="${334 + i * 34}" text-anchor="middle" font-family="${FONT}" font-size="25" fill="${CREAM}" opacity="0.9">${esc(l)}</text>`; });
  d.players.forEach((p, i) => {
    const c = i % cols; const r = Math.floor(i / cols);
    const x = x0 + c * (tile + gap); const y = headH + r * rowH;
    const art = ROLE_ART[p.icon].replace('<svg ', `<svg x="${x + 6}" y="${y + 6}" width="${tile - 12}" height="${tile - 12}" `);
    body += `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" rx="7" fill="#0e1613" stroke="${p.won ? BONE : CREAM}" stroke-width="${p.won ? 4 : 2}" opacity="${p.won ? 1 : 0.55}"/>`;
    body += `<g opacity="${p.won ? 1 : 0.5}">${art}</g>`;
    if (!p.won) body += `<path d="M${x + 38} ${y + 38}L${x + tile - 38} ${y + tile - 38}M${x + tile - 38} ${y + 38}L${x + 38} ${y + tile - 38}" stroke="${BLOOD}" stroke-width="13" stroke-linecap="round" opacity="0.92"/>`;
    body += `<text x="${x + tile / 2}" y="${y + tile + 34}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="22" letter-spacing="3" fill="${p.won ? BONE : '#a39b85'}">${esc(p.name.toUpperCase().slice(0, 14))}</text>`;
  });
  const wy = headH + rows * rowH + 22;
  body += `<line x1="${x0}" y1="${wy - 18}" x2="${x0 + gridW}" y2="${wy - 18}" stroke="${CREAM}" stroke-width="1.5" stroke-dasharray="4 8" opacity="0.6"/>`;
  body += `<text x="${W / 2}" y="${wy + 26}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="25" letter-spacing="2" fill="${BONE}">CIVILS : ${esc(d.civilWord.toUpperCase())}   ·   UNDERCOVER : ${esc(d.undercoverWord.toUpperCase())}</text>`;
  body += `<text x="${W / 2}" y="${wy + 66}" text-anchor="middle" font-family="${FONT}" font-size="18" letter-spacing="4" fill="${CREAM}" opacity="0.7">${esc(d.date)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${INK}"/>`
    + `<rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="${CREAM}" stroke-width="3" opacity="0.8"/>`
    + `<rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="${CREAM}" stroke-width="1.2" opacity="0.5"/>${body}</svg>`;
  return { svg, width: W, height: H };
}

/** Version texte (partage natif : la feuille de partage n'accepte pas d'image sans module supplémentaire). */
export function buildSummaryText(d: SummaryData): string {
  const lines = [`MythoMytho — manche ${d.round}`, d.title, d.subtitle, '', `Civils : ${d.civilWord} · Undercover : ${d.undercoverWord}`, ''];
  for (const p of d.players) lines.push(`${p.won ? '✓' : '✗'} ${p.name} — ${p.roleLabel}`);
  return lines.join('\n');
}
