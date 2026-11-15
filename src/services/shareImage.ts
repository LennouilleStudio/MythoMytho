import { Platform, Share } from 'react-native';

type Dom = {
  Image: new () => { onload: (() => void) | null; onerror: (() => void) | null; src: string };
  document: { createElement(tag: string): { width: number; height: number; getContext(t: string): { drawImage(i: unknown, x: number, y: number): void } | null; toBlob(cb: (b: Blob | null) => void, type: string): void } & Record<string, unknown> };
};

/** Rend un SVG en PNG (canvas du navigateur). Les polices du système remplacent les polices web dans l'image. */
function svgToPng(svg: string, width: number, height: number): Promise<Blob | null> {
  const g = globalThis as unknown as Dom;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new g.Image();
    img.onload = () => {
      const canvas = g.document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); return resolve(null); }
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => resolve(b), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export type ShareResult = 'image' | 'text' | 'failed';

/**
 * Partage le résumé d'une manche. Web : image PNG (feuille de partage du navigateur si elle accepte les fichiers, sinon téléchargement).
 * Mobile : texte via la feuille de partage (une image demanderait `react-native-view-shot`, absent des dépendances).
 */
export async function shareSummary(args: { svg: string; width: number; height: number; text: string; filename: string }): Promise<ShareResult> {
  if (Platform.OS !== 'web') {
    try { await Share.share({ title: 'MythoMytho', message: args.text }); return 'text'; } catch { return 'failed'; }
  }
  const blob = await svgToPng(args.svg, args.width, args.height);
  if (!blob) return 'failed';
  const nav = globalThis as unknown as { navigator?: { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> }; File?: new (p: BlobPart[], n: string, o: { type: string }) => File };
  try {
    if (nav.File && nav.navigator?.canShare && nav.navigator.share) {
      const file = new nav.File([blob], args.filename, { type: 'image/png' });
      if (nav.navigator.canShare({ files: [file] })) { await nav.navigator.share({ files: [file], title: 'MythoMytho' }); return 'image'; }
    }
  } catch { /* partage annulé ou refusé : repli sur le téléchargement */ }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = args.filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'image';
}
