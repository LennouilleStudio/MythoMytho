/** Remplace la transparence d'une couleur #rrggbb ou rgba(...) (halos, voiles et hachures teintés). */
export function alpha(color: string, a: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1] as string, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
  return rgba ? `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${a})` : color;
}
