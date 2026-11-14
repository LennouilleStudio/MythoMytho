import type { BaseRole, Player, SpecialKey } from '@/domain';

/** Tous les rôles qui ont une icône : Civils/Undercover/Mr. White/Espion + les 15 rôles spéciaux. */
export type IconKey = BaseRole | SpecialKey;
/** Camp d'un rôle : détermine la teinte du jeton (camp du rôle (Civils, imposteurs, neutre)). */
export type Tone = 'civil' | 'impostor' | 'neutral';

export const SHORT_LABEL: Readonly<Record<IconKey, string>> = {
  civil: 'Civils', undercover: 'Undercover', mrwhite: 'Mr. White', espion: 'Espion',
  idiot: 'Idiot', fantome: 'Fantôme', mime: 'Mime', procureur: 'Procureur', amoureux: 'Amoureux',
  mytho: 'Mytho', voyeur: 'Voyeur', janus: 'Janus', fauxfrere: 'Faux-Frère', jumeaux: 'Jumeaux',
  tiresias: 'Tirésias', orion: 'Orion', hercule: 'Hercule', prometheus: 'Prométhée', judas: 'Judas',
};

export const TONE: Readonly<Record<IconKey, Tone>> = {
  civil: 'civil', undercover: 'impostor', mrwhite: 'neutral', espion: 'impostor',
  idiot: 'neutral', fantome: 'neutral', mime: 'neutral', procureur: 'neutral', amoureux: 'neutral',
  mytho: 'civil', voyeur: 'civil', janus: 'civil', fauxfrere: 'impostor', jumeaux: 'civil',
  tiresias: 'civil', orion: 'civil', hercule: 'civil', prometheus: 'civil', judas: 'impostor',
};

export const CIVIL_DESC = 'Tous les Civils reçoivent le même mot et cherchent à démasquer l\'imposteur. Leur nombre se déduit des autres rôles.';
export const UNDERCOVER_DESC = "Reçoit un mot différent, mais proche, de celui des Civils : il doit se fondre dans la masse sans se trahir.";

/**
 * Illustration d'un joueur. Même priorité que la ligne « Tu es … » de la carte secrète ; avec `withBadges`
 * (révélation de fin de manche), les rôles à simple badge (Idiot, Fantôme, Mime, Procureur, Amoureux) passent avant Civil/Undercover.
 */
export function cardIcon(p: Player, withBadges = false): IconKey {
  if (p.baseRole === 'mrwhite') return 'mrwhite';
  if (p.baseRole === 'espion') return 'espion';
  if (p.traitor) return p.traitor;
  if (p.mytho) return 'mytho';
  if (p.voyeur) return 'voyeur';
  if (p.janus) return 'janus';
  if (p.tiresias) return 'tiresias';
  if (p.orion) return 'orion';
  if (p.prometheus) return 'prometheus';
  if (p.hercule) return 'hercule';
  if (p.twin) return 'jumeaux';
  if (withBadges) {
    if (p.idiot) return 'idiot';
    if (p.fantome) return 'fantome';
    if (p.mime) return 'mime';
    if (p.procureur) return 'procureur';
    if (p.loverId !== null) return 'amoureux';
  }
  return p.baseRole === 'undercover' ? 'undercover' : 'civil';
}
