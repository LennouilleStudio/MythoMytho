import { Platform } from 'react-native';

/**
 * Notifications push (Expo). Le paquet `expo-notifications` est FACULTATIF : sans lui (ou sur le web), tout ce fichier se résume à « non pris en charge »
 * et le jeu fonctionne exactement comme avant. Pour l'activer : `npx expo install expo-notifications expo-constants`, puis un build de développement / EAS
 * (voir README, « Notifications »).
 */
interface Notifications {
  getPermissionsAsync(): Promise<{ status: string }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  getExpoPushTokenAsync(opts?: { projectId?: string }): Promise<{ data: string }>;
  setNotificationHandler?(h: { handleNotification: () => Promise<Record<string, boolean>> }): void;
}

// Metro n'accepte que des `require('…')` littéraux ; entourés d'un try/catch, ils deviennent des dépendances facultatives.
function loadNotifications(): Notifications | null {
  try { return require('expo-notifications') as Notifications; } catch { return null; }
}
function loadConstants(): { default?: { expoConfig?: { extra?: { eas?: { projectId?: string } } }; easConfig?: { projectId?: string } } } | null {
  try { return require('expo-constants') as ReturnType<typeof loadConstants>; } catch { return null; }
}

export function pushSupported(): boolean {
  return Platform.OS !== 'web' && loadNotifications() !== null;
}

/** Demande l'autorisation puis renvoie le jeton de cet appareil, ou `null` (refusé, indisponible, simulateur…). */
export async function getPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const N = loadNotifications();
  if (!N) return null;
  try {
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const Constants = loadConstants();
    const projectId = Constants?.default?.easConfig?.projectId ?? Constants?.default?.expoConfig?.extra?.eas?.projectId;
    N.setNotificationHandler?.({ handleNotification: async () => ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
    return (await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  } catch { return null; }
}
