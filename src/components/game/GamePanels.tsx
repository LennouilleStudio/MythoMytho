import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ROLE_NAMES, gameOverText, playerWon, type Player, type Winner } from '@/domain';
import { cardIcon, type IconKey } from '@/features/roleMeta';
import { buildSummarySvg, buildSummaryText } from '@/features/summary';
import { shareSummary } from '@/services/shareImage';
import { useToast } from '@/state/toast';
import { alive, type GameAction, type GameState } from '@/state/gameReducer';
import { ThemeOverride, useTheme } from '@/theme/ThemeProvider';
import { ART, fonts } from '@/theme/tokens';
import { CardBackArt, CardFrontArt, backStyle } from '../ui/CardBack';
import { rememberOrigin } from '../ui/cardOrigin';
import { useFeedback } from '../ui/useFeedback';
import { RoleTile } from '../ui/RoleTile';
import { DropStamp } from '../ui/Stamp';
import { NATIVE, useProgress, useReducedMotion } from '../ui/motion';
import { DashLine, Frame, Hatch, Plaque, Sparkle, Stitch, safeId } from '../ui/ornaments';
import { AppText, Button, Callout, Panel } from '../ui/primitives';

type D = React.Dispatch<GameAction>;

export interface BottomActions {
  readonly onScores: () => void;
  readonly onNewRound: () => void;
  readonly onNewGame: () => void;
  /** Bouton « armé » : demande une seconde pression pour confirmer. */
  readonly armed: 'round' | 'game' | null;
}

/** Inclinaison fixe et douce par carte (cartes posées à la main sur la table, mais stable d'un rendu à l'autre). */
const tilt = (i: number): number => (((i * 37) % 7) - 3) * 0.85;

const CARD_W = 120;
const S = CARD_W / 300;
const FLIP_MS = 520;
const DEAL = Easing.out(Easing.cubic);

/**
 * Carte de joueur posée face cachée : dos de tarot (œil), numéro et nom dans les cartouches.
 * - `flip` : toucher la carte la retourne (rotation 3D, face parchemin) avant d'appeler `onPress` ;
 * - elle se balance très légèrement sur la table (coupé si l'utilisateur réduit les animations) ;
 * - `struck` : carte éliminée, œil fermé, tampon « Éliminé » qui s'abat dès que `stampReady`.
 */
export function PlayerCard({ player, index, onPress, faded, struck, stampReady = true, flip, caption }: {
  player: Pick<Player, 'name'>; index: number; onPress?: () => void; faded?: boolean; struck?: boolean; stampReady?: boolean; flip?: boolean; caption?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const idle = !faded && !struck;
  const fx = useFeedback();
  const back = backStyle(index);
  const ref = useRef<View>(null);

  // Balancement : va-et-vient lent, déphasé d'une carte à l'autre.
  const sway = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !idle) { sway.setValue(0); return; }
    const d = 2600 + (index % 4) * 330;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(sway, { toValue: 1, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      Animated.timing(sway, { toValue: 0, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduce, idle, index, sway]);
  const t = tilt(index);
  const swayRot = sway.interpolate({ inputRange: [0, 1], outputRange: [`${t - 0.9}deg`, `${t + 0.9}deg`] });
  const swayY = sway.interpolate({ inputRange: [0, 1], outputRange: [0, -2.5] });

  // Retournement : 0 → 1 = 0° → 180° ; la face parchemin apparaît à mi-course.
  const turn = useRef(new Animated.Value(0)).current;
  const [turning, setTurning] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current); }, []);
  useEffect(() => { if (faded) { turn.setValue(0); setTurning(false); } }, [faded, turn]);
  const press = (): void => {
    if (!onPress || turning) return;
    ref.current?.measureInWindow?.((x, y, w, h) => rememberOrigin({ x, y, w, h }));
    if (!flip || reduce) { onPress(); return; }
    setTurning(true);
    fx.flip();
    Animated.timing(turn, { toValue: 1, duration: FLIP_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: NATIVE }).start(({ finished }) => {
      if (!finished) return;
      onPress();
      // La fenêtre qui s'ouvre recouvre la carte ; on la repose face cachée derrière (utile quand elle reste touchable, en ligne).
      resetTimer.current = setTimeout(() => { turn.setValue(0); setTurning(false); }, 700);
    });
  };
  // Chaque face porte sa propre rotation (et non le parent) : `backfaceVisibility` ne dépend alors pas de `preserve-3d`, absent du web.
  const rotBack = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const rotFront = turn.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const lift = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -14, -4] });
  const grow = turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1.06] });
  const face = { position: 'absolute', top: 0, left: 0, width: CARD_W, height: (CARD_W * 4) / 3, backfaceVisibility: 'hidden', borderRadius: 6, overflow: 'hidden' } as const;

  return (
    <Pressable ref={ref} onPress={press} disabled={!onPress || faded} accessibilityRole="button"
      accessibilityLabel={caption ? `${player.name} — ${caption}` : player.name} accessibilityState={{ disabled: !onPress || !!faded }}>
      {({ pressed }) => (
        <Animated.View style={{ width: CARD_W, height: (CARD_W * 4) / 3, borderRadius: 6, boxShadow: pressed ? '0 18px 28px -12px rgba(0,0,0,0.75)' : `0 12px 24px -12px ${colors.shadow}`, transform: [{ rotate: pressed ? '0deg' : swayRot }, { translateY: pressed ? -4 : swayY }] }}>
          <Animated.View style={{ width: CARD_W, height: (CARD_W * 4) / 3, opacity: faded || struck ? 0.55 : 1, transform: [{ translateY: lift }, { scale: grow }] }}>
            <Animated.View style={{ ...face, transform: [{ perspective: 900 }, { rotateY: rotBack }] }}>
              <CardBackArt width={CARD_W} closed={faded || struck} tint={back.tint} mark={back.mark} />
              <View pointerEvents="none" style={{ position: 'absolute', top: 9 * S, left: 92 * S, width: 116 * S, height: 42 * S, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: ART.cream, fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.6 }}>{`#${index + 1}`}</Text>
              </View>
              <View pointerEvents="none" style={{ position: 'absolute', top: 334 * S, left: 32 * S, width: 236 * S, height: 48 * S, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text numberOfLines={1} style={{ color: ART.cream, fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', textAlign: 'center', textDecorationLine: struck ? 'line-through' : 'none' }}>{player.name}</Text>
              </View>
            </Animated.View>
            {flip ? (
              <Animated.View style={{ ...face, transform: [{ perspective: 900 }, { rotateY: rotFront }] }}>
                <CardFrontArt width={CARD_W} />
                <View pointerEvents="none" style={{ position: 'absolute', top: 334 * S, left: 32 * S, width: 236 * S, height: 48 * S, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                  <Text numberOfLines={1} style={{ color: ART.green, fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase' }}>{player.name}</Text>
                </View>
              </Animated.View>
            ) : null}
          </Animated.View>
          {struck ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <DropStamp label="Éliminé" active={!!stampReady} size={13} onImpact={fx.stamp} />
            </View>
          ) : null}
        </Animated.View>
      )}
    </Pressable>
  );
}

/** Dimensions de la rangée de cartes : l'origine de la distribution est son centre. */
const RowContext = createContext<{ w: number; h: number }>({ w: 0, h: 0 });

const CardsRow = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent): void => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: width, h: height }));
  };
  return (
    <RowContext.Provider value={box}>
      <View onLayout={onLayout} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 30, paddingTop: 4 }}>{children}</View>
    </RowContext.Provider>
  );
};

/**
 * Distribution : la carte part du centre de la rangée (réduite, penchée) et glisse jusqu'à sa place, avec un léger froissement ;
 * une carte après l'autre. Sans animation (mouvement réduit), les cartes sont simplement posées.
 */
function DealIn({ index, children }: { index: number; children: React.ReactNode }): React.JSX.Element {
  const row = useContext(RowContext);
  const fx = useFeedback();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ready = pos !== null && row.w > 0;
  const p = useProgress(ready, { duration: 560, delay: 120 + index * 150, easing: DEAL });
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(fx.deal, 120 + index * 150 + 40);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  const dx = pos ? row.w / 2 - (pos.x + CARD_W / 2) : 0;
  const dy = pos ? row.h / 2 - (pos.y + (CARD_W * 4) / 6) : 0;
  const side = index % 2 ? 1 : -1;
  return (
    <Animated.View
      onLayout={(e) => { const { x, y } = e.nativeEvent.layout; setPos((o) => (o && o.x === x && o.y === y ? o : { x, y })); }}
      style={{
        opacity: ready ? p.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 1] }) : 0,
        transform: [
          { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
          { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) },
          { rotate: p.interpolate({ inputRange: [0, 1], outputRange: [`${side * 24}deg`, '0deg'] }) },
          { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) },
        ],
      }}>
      {children}
    </Animated.View>
  );
}

const Rule = (): React.JSX.Element => {
  const { colors } = useTheme();
  return <DashLine color={colors.line} style={{ flex: 0, marginBottom: 20 }} />;
};

export function GameHeader({ state }: { state: GameState }): React.JSX.Element {
  const { colors } = useTheme();
  const seen = state.players.filter((p) => p.viewed).length;
  const n = state.players.length;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
      <View>
        <AppText title size={26}>{`Manche ${state.round}`}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
          <Sparkle size={9} color={colors.bloodHi} />
          <AppText tone="accent" label size={10.8} style={{ letterSpacing: 1.8, textTransform: 'uppercase' }}>{`${n} agents en jeu`}</AppText>
        </View>
      </View>
      {state.phase === 'reveal' ? (
        <View style={{ minWidth: 180 }}>
          <AppText tone="muted" size={10.5} style={{ textAlign: 'right', marginBottom: 6 }}>{`${seen}/${n} cartes consultées`}</AppText>
          <View style={{ height: 10, borderRadius: 2, backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.lineStrong, overflow: 'hidden' }}>
            <View style={{ width: `${n ? (seen / n) * 100 : 0}%`, height: '100%', backgroundColor: colors.accent }}><Hatch color="rgba(14,22,19,0.4)" gap={4} /></View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function BottomRow({ actions, extra }: { actions: BottomActions; extra?: React.ReactNode }): React.JSX.Element {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {extra}
      <Button variant="ghost" label="Journal des scores" onPress={actions.onScores} />
      <Button variant="ghost" label={actions.armed === 'round' ? 'Confirmer ?' : 'Nouvelle manche (mêmes joueurs)'} onPress={actions.onNewRound} />
      <Button variant="ghost" label={actions.armed === 'game' ? 'Confirmer ?' : 'Nouvelle partie'} onPress={actions.onNewGame} />
    </View>
  );
}

export function RevealPhase({ state, dispatch, actions }: { state: GameState; dispatch: D; actions: BottomActions }): React.JSX.Element {
  const all = state.players.length > 0 && state.players.every((p) => p.viewed);
  return (
    <View>
      <Callout>
        <AppText tone="muted" size={12.5} style={{ lineHeight: 20 }}>
          {'Faites circuler l\'appareil. Chaque joueur touche '}<AppText bold tone="muted" size={12.5}>sa propre carte</AppText>
          {', mémorise son mot en privé, puis appuie sur « Cacher » avant de transmettre l\'appareil au suivant. Une carte déjà consultée ne peut pas être rouverte.'}
        </AppText>
      </Callout>
      <View style={{ height: 22 }} />
      {all ? (
        <View style={{ marginBottom: 18 }}>
          <Callout tone="ok"><AppText size={12.5} style={{ lineHeight: 19 }}>Toutes les cartes ont été consultées. La discussion peut commencer, puis lancez le vote.</AppText></Callout>
        </View>
      ) : null}
      {/* Le minuteur s'insère ici (voir GameScreen). */}
      <CardsRow>
        {state.players.map((p, i) => (
          <DealIn key={p.id} index={i}>
            <PlayerCard flip player={p} index={i} faded={p.viewed} caption={p.viewed ? 'carte vue' : 'toucher pour voir'} onPress={() => dispatch({ type: 'OPEN_CARD', id: p.id })} />
          </DealIn>
        ))}
      </CardsRow>
      <Rule />
      <View style={{ gap: 12 }}>
        <Button arrow label="Lancer le vote" disabled={!all} onPress={() => dispatch({ type: 'START_VOTE' })} />
        <BottomRow actions={actions} />
      </View>
    </View>
  );
}

export function VotePhase({ state, dispatch, actions }: { state: GameState; dispatch: D; actions: BottomActions }): React.JSX.Element {
  const living = alive(state);
  // Le tampon ne s'abat qu'une fois les fenêtres d'annonce refermées : on le voit tomber sur la carte.
  const stampReady = state.modal === 'none' && !state.summaryOpen;
  return (
    <View>
      <AppText title size={20} style={{ marginBottom: 10 }}>Vote d'élimination</AppText>
      <Callout accent="blood">
        <AppText tone="muted" size={12.5} style={{ lineHeight: 20 }}>Le groupe discute, puis désigne d'un commun accord le joueur à éliminer en touchant sa carte.</AppText>
      </Callout>
      <View style={{ height: 18 }} />
      <CardsRow>
        {state.players.map((p, i) => {
          const isAlive = living.some((a) => a.id === p.id);
          return (
            <PlayerCard key={p.id} player={p} index={i} struck={!isAlive} stampReady={stampReady} caption={isAlive ? 'désigner' : 'éliminé'}
              onPress={isAlive ? () => dispatch({ type: 'ASK_ELIMINATE', id: p.id }) : undefined} />
          );
        })}
      </CardsRow>
      <Rule />
      <BottomRow actions={actions} extra={<Button variant="ghost" label="Voir tous les rôles" onPress={() => dispatch({ type: 'OPEN_SUMMARY' })} />} />
    </View>
  );
}

/** Bannière de fin : une carte imprimée, toujours sombre ; les gouttes se multiplient quand les imposteurs l'emportent. */
export const BANNER: Readonly<Record<Winner, { bg: string; stroke: string; drips: number; dripMax: number }>> = {
  civils: { bg: ART.green, stroke: ART.cream, drips: 0, dripMax: 44 },
  undercover: { bg: ART.burgundy, stroke: ART.blood, drips: 11, dripMax: 104 },
  idiot: { bg: ART.violet, stroke: ART.cream, drips: 0, dripMax: 44 },
  amoureux: { bg: ART.violet, stroke: ART.blood, drips: 3, dripMax: 50 },
  mrwhite: { bg: ART.green, stroke: ART.cream, drips: 5, dripMax: 70 },
};

/** Halo crème qui respire derrière une carte gagnante. */
function Glow({ size }: { size: number }): React.JSX.Element {
  const id = safeId(useId());
  const reduce = useReducedMotion();
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) { o.setValue(0.5); return; }
    const l = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      Animated.timing(o, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
    ]));
    l.start();
    return () => l.stop();
  }, [reduce, o]);
  const d = size * 1.7;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: (size - d) / 2, top: (size - d) / 2, width: d, height: d, opacity: o.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.95] }) }}>
      <Svg width={d} height={d}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0.35" stopColor="#f1e8d0" stopOpacity={0.34} />
            <Stop offset="1" stopColor="#f1e8d0" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Carte révélée en fin de manche. Vainqueur : se hisse (un peu plus haut, un peu plus grand) dans un halo crème.
 * Perdant : s'affaisse, se penche, se voile, puis une croix rouge s'abat dessus.
 */
export function RevealedCard({ player, won, size, index }: { player: { name: string; icon: IconKey; eliminated: boolean }; won: boolean; size: number; index: number }): React.JSX.Element {
  const { colors } = useTheme();
  const move = useProgress(true, { duration: 700, delay: 350 + index * 120 });
  const cross = useProgress(!won, { duration: 320, delay: 1000 + index * 110 });
  const scale = cross.interpolate({ inputRange: [0, 1], outputRange: [2, 1] });
  const lean = index % 2 ? 4 : -4;
  const ty = move.interpolate({ inputRange: [0, 1], outputRange: [0, won ? -12 : 12] });
  const sc = move.interpolate({ inputRange: [0, 1], outputRange: [1, won ? 1.07 : 0.94] });
  const rot = move.interpolate({ inputRange: [0, 1], outputRange: ['0deg', won ? '0deg' : `${lean}deg`] });
  return (
    <View style={{ width: size, gap: 8 }} accessible accessibilityLabel={`${player.name} : ${won ? 'gagnant' : 'perdant'}`}>
      <Animated.View style={{ transform: [{ translateY: ty }, { scale: sc }, { rotate: rot }] }}>
        {won ? <Glow size={size} /> : null}
        <View>
          <RoleTile icon={player.icon} active={won} size={size} shineAuto={won} shineDelay={1100 + index * 140} />
          {!won ? (
            <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', opacity: cross, transform: [{ scale }] }}>
              <Stitch size={size * 0.78} color={ART.blood} width={3.2} />
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>
      <Text numberOfLines={1} style={{ color: won ? colors.accent : colors.muted, fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', textAlign: 'center', textDecorationLine: player.eliminated ? 'line-through' : 'none', textDecorationColor: colors.bloodHi }}>{player.name}</Text>
    </View>
  );
}

export function GameOverPhase({ state, dispatch, actions, onNextRound }: {
  state: GameState; dispatch: D; actions: BottomActions; onNextRound: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const toast = useToast();
  if (!state.winner) return <View />;
  const text = gameOverText(state.winner, state.winnerReason, state.winnerDetail, state.players, state.civilWord);
  const mytho = state.players.find((p) => p.mytho);
  const hercule = state.players.find((p) => p.hercule);
  const b = BANNER[state.winner];
  const winner = state.winner;
  const share = (): void => {
    const data = {
      round: state.round, title: text.title.replace(/ ([!?:;])/g, '\u202F$1'), subtitle: text.subtitle, civilWord: state.civilWord, undercoverWord: state.undercoverWord,
      date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
      players: state.players.map((p) => ({ name: p.name, icon: cardIcon(p, true), won: playerWon(p, winner, state.winnerPlayerId), roleLabel: ROLE_NAMES[p.baseRole] ?? p.baseRole })),
    };
    const img = buildSummarySvg(data);
    void shareSummary({ ...img, text: buildSummaryText(data), filename: `mythomytho-manche-${state.round}.png` }).then((r) => {
      toast(r === 'image' ? 'Image du résumé prête.' : r === 'text' ? 'Résumé partagé.' : 'Impossible de créer l\'image.');
    });
  };
  return (
    <View style={{ gap: 16 }}>
      <ThemeOverride mode="dark">
        <Frame bg={b.bg} stroke={b.stroke} soft="rgba(217,204,176,0.4)" drips={b.drips > 0} dripCount={b.drips} dripMax={b.dripMax} seed={23} style={{ alignItems: 'center', gap: 12, paddingVertical: 40, paddingHorizontal: 28 }}>
          <AppText title size={32} center>{text.title.replace(/ ([!?:;])/g, '\u202F$1')}</AppText>
          <AppText center tone="muted" size={13.5}>{text.subtitle}</AppText>
          <View style={{ alignSelf: 'stretch' }}><DashLine color="rgba(217,204,176,0.35)" style={{ flex: 0 }} /></View>
          <AppText center tone="accent" bold size={13}>{`Civils : ${state.civilWord} · Undercover : ${state.undercoverWord}`}</AppText>
        </Frame>
      </ThemeOverride>

      <Frame style={{ padding: 22, paddingTop: 30, gap: 14 }}>
        <View style={{ position: 'absolute', top: -13, left: 20 }}><Plaque label="Les cartes révélées" /></View>
        {(() => {
          const rank = state.players.map((p, i) => ({ p, i, won: playerWon(p, winner, state.winnerPlayerId) }));
          const winners = rank.filter((r) => r.won); const losers = rank.filter((r) => !r.won);
          return (
            <View style={{ gap: 26, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'center', paddingTop: 12 }}>
                {winners.map((r, k) => <RevealedCard key={r.p.id} player={{ name: r.p.name, icon: cardIcon(r.p, true), eliminated: r.p.eliminated }} index={k} size={winners.length > 4 ? 104 : 128} won />)}
              </View>
              {losers.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center', paddingTop: 6 }}>
                  {losers.map((r, k) => <RevealedCard key={r.p.id} player={{ name: r.p.name, icon: cardIcon(r.p, true), eliminated: r.p.eliminated }} index={k + winners.length} size={92} won={false} />)}
                </View>
              ) : null}
            </View>
          );
        })()}
        <AppText tone="muted" size={11.5} center>Les perdants sont barrés d'une croix ; un nom rayé désigne un joueur éliminé en cours de manche.</AppText>
      </Frame>

      {mytho ? (
        <Panel style={{ gap: 10 }}>
          <AppText bold size={14}>{`Le groupe a-t-il repéré le mensonge de ${mytho.name} ?`}</AppText>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button small variant={state.lie === 'spotted' ? 'primary' : 'ghost'} label="Oui, repéré" onPress={() => dispatch({ type: 'ANSWER_LIE', value: 'spotted' })} />
            <Button small variant={state.lie === 'passed' ? 'primary' : 'ghost'} label="Non, il est passé" onPress={() => dispatch({ type: 'ANSWER_LIE', value: 'passed' })} />
          </View>
        </Panel>
      ) : null}
      {hercule ? (
        <Panel style={{ gap: 10 }}>
          <AppText bold size={14}>{`${hercule.name} a-t-il/elle accompli sa mission ?`}</AppText>
          <AppText tone="muted" size={12.5}>{hercule.mission}</AppText>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button small variant={state.mission === 'success' ? 'primary' : 'ghost'} label="Accomplie" onPress={() => dispatch({ type: 'ANSWER_MISSION', value: 'success' })} />
            <Button small variant={state.mission === 'fail' ? 'primary' : 'ghost'} label="Ratée" onPress={() => dispatch({ type: 'ANSWER_MISSION', value: 'fail' })} />
          </View>
        </Panel>
      ) : null}
      <View style={{ gap: 12 }}>
        <Button arrow label="Nouvelle manche" onPress={onNextRound} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Button variant="ghost" label="Partager le résumé" onPress={share} />
          <Button variant="ghost" label="Voir tous les rôles" onPress={() => dispatch({ type: 'OPEN_SUMMARY' })} />
          <Button variant="ghost" label="Journal des scores" onPress={actions.onScores} />
          <Button variant="ghost" label="Nouvelle partie" onPress={actions.onNewGame} />
        </View>
      </View>
    </View>
  );
}
