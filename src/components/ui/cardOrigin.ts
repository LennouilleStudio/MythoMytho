/** Position écran de la dernière carte touchée : la carte secrète grandit depuis cet endroit (voir ModalSheet `from`). */
export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
let last: Rect | null = null;
export const rememberOrigin = (r: Rect | null): void => { last = r; };
export const takeOrigin = (): Rect | null => { const r = last; last = null; return r; };
