/** Copie un texte dans le presse-papiers (web). Renvoie false si le navigateur ou l'appareil ne le permet pas : l'appelant propose alors un autre moyen. */
export async function copyText(text: string): Promise<boolean> {
  const nav = (globalThis as unknown as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator;
  try {
    if (nav?.clipboard) { await nav.clipboard.writeText(text); return true; }
  } catch { /* permission refusée : on retombe sur le partage */ }
  return false;
}
