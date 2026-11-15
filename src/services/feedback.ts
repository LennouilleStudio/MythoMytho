import { Vibration } from 'react-native';
import { createAudioPlayer } from 'expo-audio';

export const buzz = (pattern: number | number[] = 40): void => {
  try { Vibration.vibrate(pattern); } catch { /* non supporté */ }
};

type Player = ReturnType<typeof createAudioPlayer>;
const players = new Map<string, Player>();

/** Joue un son embarqué depuis le début (un lecteur par son, créé au premier appel). */
function play(key: string, load: () => number): void {
  try {
    let p = players.get(key);
    if (!p) { p = createAudioPlayer(load()); players.set(key, p); }
    void p.seekTo(0);
    p.play();
  } catch { /* audio indisponible */ }
}

/** Triple bip de fin de minuteur (fichier généré, embarqué dans l'application). */
export const playTimerEnd = (): void => play('timer-end', () => require('../../assets/sounds/timer-end.wav') as number);
/** Choc sourd du tampon « Éliminé ». */
export const playStamp = (): void => play('stamp', () => require('../../assets/sounds/stamp.wav') as number);
/** Froissement de carte qui se retourne. */
export const playFlip = (): void => play('flip', () => require('../../assets/sounds/flip.wav') as number);
