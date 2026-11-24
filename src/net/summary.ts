import type { RoundSummary } from './protocol';

/** Résumé d'une manche en texte (partage, copie). Logique pure : les rôles sont publics une fois la manche terminée. */
export function roundText(r: RoundSummary): string {
  const lines = [`Manche ${r.round} — ${r.title}`, `Mots : ${r.civilWord} / ${r.undercoverWord}`];
  r.turns.forEach((t, i) => {
    const votes = t.votes.map((v) => `${v.from}→${v.to}`).join(', ');
    lines.push(`Tour ${i + 1} : ${votes} ⇒ ${t.eliminated} éliminé(e)${t.note ? ` (${t.note})` : ''}`);
  });
  lines.push(`Rôles : ${r.players.map((p) => `${p.name} (${p.roleLabel}${p.won ? ', gagne' : ''})`).join(', ')}`);
  return lines.join('\n');
}

/** Toutes les manches d'une salle, de la plus ancienne à la plus récente. */
export function historyText(history: readonly RoundSummary[]): string {
  return history.map(roundText).join('\n\n');
}
