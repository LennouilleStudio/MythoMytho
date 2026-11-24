import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { formatClock } from '@/domain';
import { buildSummarySvg, buildSummaryText } from '@/features/summary';
import { buzz, playTimerEnd } from '@/services/feedback';
import { shareSummary } from '@/services/shareImage';
import { useOnline } from '@/state/online';
import { useSettings } from '@/state/settings';
import { useToast } from '@/state/toast';
import { ThemeOverride, useTheme } from '@/theme/ThemeProvider';
import { ART, fonts } from '@/theme/tokens';
import type { GameView, PlayerView } from '@/net/protocol';
import { BANNER, PlayerCard, RevealedCard } from '../game/GamePanels';
import { RevealFlip } from '../game/RevealFlip';
import { BloodGauge } from '../ui/BloodGauge';
import { BloodRain } from '../ui/BloodRain';
import { ModalSheet } from '../ui/ModalSheet';
import { Page, Screen } from '../ui/Screen';
import { setAmbience } from '../ui/ambience';
import { bleed, bleedReset } from '../ui/bleed';
import { takeOrigin } from '../ui/cardOrigin';
import { DashLine, Frame, Plaque, Sparkle } from '../ui/ornaments';
import { AppText, Button, Callout, Field, Panel } from '../ui/primitives';
import { HistoryPanel } from './History';
import { OnlineCardModal } from './OnlineCard';
import { SocialDock } from './Social';

/* ----------------------------------------------------------------- petits éléments */

function Caption({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'accent' | 'blood' }): React.JSX.Element {
  return <AppText label size={9.5} tone={tone} center style={{ letterSpacing: 1.4, textTransform: 'uppercase' }}>{children}</AppText>;
}

function Waiting({ children }: { children: string }): React.JSX.Element {
  return <AppText tone="muted" size={12.5} center>{children}</AppText>;
}

/** Minuteur calé sur l'horloge du serveur : tous les joueurs voient le même temps restant. */
function OnlineTimer({ view, g }: { view: PlayerView; g: GameView }): React.JSX.Element | null {
  const { serverNow, send } = useOnline();
  const { settings } = useSettings();
  const t = g.timer;
  const [, tick] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    if (!t) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [t]);
  // Le serveur est l'horloge de référence : `t.over` met tous les joueurs d'accord, même si leur horloge locale dérive.
  const leftMs = t ? (t.over ? 0 : Math.max(0, t.endsAt - serverNow())) : 0;
  useEffect(() => {
    if (!t) { done.current = false; return; }
    if (leftMs > 0) { done.current = false; return; }
    if (!done.current) { done.current = true; buzz([200, 100, 200, 100, 400]); if (settings.timerSound) playTimerEnd(); }
  }, [t, leftMs, settings.timerSound]);
  if (!t) return null;
  const left = Math.ceil(leftMs / 1000);
  const over = left === 0;
  const danger = left > 0 && left <= 10;
  return (
    <View style={{ marginBottom: 18 }}>
      <Callout accent={over || danger ? 'blood' : 'default'}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <BloodGauge fill={t.totalSec > 0 ? 1 - leftMs / (t.totalSec * 1000) : 0} danger={danger || over} />
          <View style={{ flex: 1, gap: 8 }}>
            <AppText tone={over || danger ? 'blood' : 'muted'} label size={11} style={{ letterSpacing: 1.3, textTransform: 'uppercase' }}>{over ? 'Temps écoulé — place au vote !' : danger ? 'Le sang monte…' : 'Temps de discussion'}</AppText>
            <AppText bold tone={over || danger ? 'blood' : 'accent'} size={30}>{formatClock(left)}</AppText>
            {view.isHost ? <View style={{ flexDirection: 'row' }}><Button small variant="ghost" label="+1 min" onPress={() => send({ t: 'extend' })} /></View> : null}
          </View>
        </View>
      </Callout>
    </View>
  );
}

/* ----------------------------------------------------------------- phases */

function RevealPhase({ view, g, onOpenCard }: { view: PlayerView; g: GameView; onOpenCard: () => void }): React.JSX.Element {
  const { send } = useOnline();
  const all = g.players.every((p) => p.viewed);
  const seen = g.players.filter((p) => p.viewed).length;
  return (
    <View>
      <Callout>
        <AppText tone="muted" size={12.5} style={{ lineHeight: 20 }}>
          {g.spectator
            ? 'Les joueurs lisent chacun leur carte : vous voyez qui a terminé, sans rien savoir des mots.'
            : <>{'Touchez '}<AppText bold tone="muted" size={12.5}>votre carte</AppText>{' pour lire votre mot : vous seul(e) le recevez. Les autres cartes sont celles des autres joueurs ; elles s\'éteignent quand leur propriétaire a lu la sienne.'}</>}
        </AppText>
      </Callout>
      <View style={{ height: 22 }} />
      <OnlineTimer view={view} g={g} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 26, paddingTop: 4 }}>
        {g.players.map((p) => {
          const mine = p.id === g.me?.id;
          return (
            <View key={p.id} style={{ alignItems: 'center', gap: 6 }}>
              <PlayerCard flip={mine} player={p} index={p.id} faded={!mine && p.viewed} caption={mine ? 'ma carte' : p.viewed ? 'carte lue' : 'pas encore lue'}
                onPress={mine ? onOpenCard : undefined} />
              <Caption tone={mine ? 'accent' : 'muted'}>{mine ? (p.viewed ? 'Ma carte · lue ✓' : 'Ma carte') : p.viewed ? 'Lue ✓' : p.connected ? '…' : 'Hors ligne'}</Caption>
            </View>
          );
        })}
      </View>
      <DashLine color="rgba(217,204,176,0.25)" style={{ flex: 0, marginBottom: 20 }} />
      <View style={{ gap: 12 }}>
        <AppText tone="muted" size={11.5}>{`${seen}/${g.players.length} cartes lues`}</AppText>
        {view.isHost
          ? (
            <>
              <Button arrow label="Lancer le vote" disabled={!all} onPress={() => send({ t: 'startVote' })} />
              {all ? null : <Button variant="ghost" label="Ouvrir le vote sans attendre les cartes non lues" onPress={() => send({ t: 'startVote', force: true })} />}
            </>
          )
          : all ? <Waiting>Tout le monde a lu sa carte : en attente du lancement du vote par l'hôte.</Waiting> : null}
      </View>
    </View>
  );
}

/** Compte à rebours du vote, sur l'horloge du serveur. */
function VoteCountdown({ endsAt }: { endsAt: number }): React.JSX.Element {
  const { serverNow } = useOnline();
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 250); return () => clearInterval(id); }, []);
  const left = Math.max(0, Math.ceil((endsAt - serverNow()) / 1000));
  return (
    <AppText bold size={13} tone={left <= 10 ? 'accent' : 'muted'}>
      {left > 0 ? `Temps pour voter : ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Temps écoulé : dépouillement…'}
    </AppText>
  );
}

function VotePhase({ view, g }: { view: PlayerView; g: GameView }): React.JSX.Element {
  const { send } = useOnline();
  const v = g.vote;
  const alive = g.players.filter((p) => !p.eliminated);
  const [stamped, setStamped] = useState(true);
  useEffect(() => { setStamped(true); }, [g.modal]);
  return (
    <View>
      <AppText title size={20} style={{ marginBottom: 10 }}>Vote d'élimination</AppText>
      <Callout accent="blood">
        <AppText tone="muted" size={12.5} style={{ lineHeight: 20 }}>
          {v?.canVote ? 'Chacun vote en secret pour le joueur à éliminer : touchez sa carte. Vous pouvez changer d\'avis tant que tout le monde n\'a pas voté.' : g.spectator ? 'Vous regardez la manche en spectateur : vous votez à partir de la suivante.' : 'Vous êtes éliminé(e) : vous suivez le vote sans y participer.'}
        </AppText>
      </Callout>
      {v?.endsAt ? <View style={{ marginTop: 12 }}><VoteCountdown endsAt={v.endsAt} /></View> : null}
      {v?.note ? <View style={{ marginTop: 12 }}><Callout tone="ok"><AppText size={12.5}>{v.note}</AppText></Callout></View> : null}
      <View style={{ height: 18 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 26, paddingTop: 4 }}>
        {g.players.map((p) => {
          const isCandidate = v?.candidates.includes(p.id) ?? false;
          const mine = p.id === g.me?.id;
          const votedFor = v?.myVote === p.id;
          const hasVoted = v?.voted.includes(p.id) ?? false;
          const canPick = !!v?.canVote && isCandidate && !mine;
          return (
            <View key={p.id} style={{ alignItems: 'center', gap: 6 }}>
              <PlayerCard player={p} index={p.id} struck={p.eliminated} stampReady={stamped} faded={!p.eliminated && !isCandidate}
                caption={p.eliminated ? 'éliminé' : canPick ? 'voter' : undefined} onPress={canPick ? () => send({ t: 'vote', target: p.id }) : undefined} />
              {votedFor ? <Plaque label="Votre vote" tone="blood" size={9.5} /> : <Caption tone={hasVoted ? 'accent' : 'muted'}>{p.eliminated ? 'Éliminé' : mine ? 'Vous' : hasVoted ? 'A voté ✓' : p.idle ? 'Inactif' : p.connected ? '…' : 'Hors ligne'}</Caption>}
            </View>
          );
        })}
      </View>
      <DashLine color="rgba(217,204,176,0.25)" style={{ flex: 0, marginBottom: 20 }} />
      <View style={{ gap: 12 }}>
        <AppText tone="muted" size={11.5}>{`${v?.voted.length ?? 0}/${alive.length} ont voté`}</AppText>
        {view.isHost ? <Button variant="ghost" label="Dépouiller maintenant" disabled={(v?.voted.length ?? 0) === 0} onPress={() => send({ t: 'forceVote' })} /> : null}
      </View>
    </View>
  );
}

function GameOverPhase({ view, g }: { view: PlayerView; g: GameView }): React.JSX.Element {
  const { colors } = useTheme();
  const { send } = useOnline();
  const toast = useToast();
  const r = g.result;
  if (!r) return <View />;
  const b = BANNER[r.winner];
  const winners = r.players.filter((p) => p.won);
  const losers = r.players.filter((p) => !p.won);
  const title = r.title.replace(/ ([!?:;])/g, '\u202F$1');
  const share = (): void => {
    const data = {
      round: g.round, title, subtitle: r.subtitle, civilWord: r.civilWord, undercoverWord: r.undercoverWord,
      date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
      players: r.players.map((p) => ({ name: p.name, icon: p.icon, won: p.won, roleLabel: p.roleLabel })),
    };
    const img = buildSummarySvg(data);
    void shareSummary({ ...img, text: buildSummaryText(data), filename: `mythomytho-manche-${g.round}.png` })
      .then((res) => toast(res === 'image' ? 'Image du résumé prête.' : res === 'text' ? 'Résumé partagé.' : 'Impossible de créer l\'image.'));
  };
  return (
    <View style={{ gap: 16 }}>
      <ThemeOverride mode="dark">
        <Frame bg={b.bg} stroke={b.stroke} soft="rgba(217,204,176,0.4)" drips={b.drips > 0} dripCount={b.drips} dripMax={b.dripMax} seed={23} style={{ alignItems: 'center', gap: 12, paddingVertical: 40, paddingHorizontal: 28 }}>
          <AppText title size={32} center>{title}</AppText>
          <AppText center tone="muted" size={13.5}>{r.subtitle}</AppText>
          <View style={{ alignSelf: 'stretch' }}><DashLine color="rgba(217,204,176,0.35)" style={{ flex: 0 }} /></View>
          <AppText center tone="accent" bold size={13}>{`Civils : ${r.civilWord} · Undercover : ${r.undercoverWord}`}</AppText>
        </Frame>
      </ThemeOverride>

      <Frame style={{ padding: 22, paddingTop: 30, gap: 14 }}>
        <View style={{ position: 'absolute', top: -13, left: 20 }}><Plaque label="Les cartes révélées" /></View>
        <View style={{ gap: 26, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'center', paddingTop: 12 }}>
            {winners.map((p, k) => <RevealedCard key={p.id} player={p} index={k} size={winners.length > 4 ? 104 : 128} won />)}
          </View>
          {losers.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center', paddingTop: 6 }}>
              {losers.map((p, k) => <RevealedCard key={p.id} player={p} index={k + winners.length} size={92} won={false} />)}
            </View>
          ) : null}
        </View>
      </Frame>

      {r.askLie && view.isHost ? (
        <Panel style={{ gap: 10 }}>
          <AppText bold size={14}>{`Le groupe a-t-il repéré le mensonge de ${r.askLie} ?`}</AppText>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button small variant={r.lie === 'spotted' ? 'primary' : 'ghost'} label="Oui, repéré" onPress={() => send({ t: 'lie', value: 'spotted' })} />
            <Button small variant={r.lie === 'passed' ? 'primary' : 'ghost'} label="Non, il est passé" onPress={() => send({ t: 'lie', value: 'passed' })} />
          </View>
        </Panel>
      ) : null}
      {r.askMission && view.isHost ? (
        <Panel style={{ gap: 10 }}>
          <AppText bold size={14}>{`${r.askMission.name} a-t-il/elle accompli sa mission ?`}</AppText>
          <AppText tone="muted" size={12.5}>{r.askMission.mission}</AppText>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button small variant={r.mission === 'success' ? 'primary' : 'ghost'} label="Accomplie" onPress={() => send({ t: 'mission', value: 'success' })} />
            <Button small variant={r.mission === 'fail' ? 'primary' : 'ghost'} label="Ratée" onPress={() => send({ t: 'mission', value: 'fail' })} />
          </View>
        </Panel>
      ) : null}
      <View style={{ gap: 12 }}>
        {view.isHost
          ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Button arrow label="Manche suivante" onPress={() => send({ t: 'nextRound' })} />
              <Button variant="ghost" label="Revanche" onPress={() => send({ t: 'rematch' })} />
            </View>
          )
          : <Text style={{ color: colors.muted, fontFamily: fonts.body, fontSize: 12.5 }}>L'hôte lance la manche suivante ou une revanche.</Text>}
        <HistoryPanel history={view.history} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Button variant="ghost" label="Partager le résumé" onPress={share} />
          {view.isHost ? <Button variant="ghost" label="Retour au salon" onPress={() => send({ t: 'toLobby' })} /> : null}
        </View>
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------- fenêtres partagées */

function Prompts({ view, g }: { view: PlayerView; g: GameView }): React.JSX.Element {
  const { send } = useOnline();
  const [text, setText] = useState('');
  useEffect(() => { setText(''); }, [g.guess?.stage, g.guess?.byName]);
  const name = (id: number): string => g.players.find((p) => p.id === id)?.name ?? '?';
  const pick = g.pick;
  const guess = g.guess;
  const a = g.announce;
  return (
    <>
      <ModalSheet visible={!!a} kicker="élimination" title={a?.headline} center>
        {a && a.victims.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginVertical: 4 }}>
            {a.victims.map((vic, i) => <RevealFlip key={vic.id} player={vic} index={vic.id} size={a.victims.length <= 1 ? 190 : a.victims.length === 2 ? 128 : 96} delay={450 + i * 350} />)}
          </View>
        ) : null}
        {a?.lines.map((l, i) => <AppText key={i} tone={i === 0 ? 'default' : 'accent'} size={14} center>{l}</AppText>)}
        <AppText tone="muted" size={13} center>{a?.text ?? ''}</AppText>
        {view.isHost ? <Button arrow center label={a?.button ?? 'Continuer'} onPress={() => send({ t: 'continue' })} /> : <Waiting>En attente de l'hôte…</Waiting>}
      </ModalSheet>

      <ModalSheet visible={!!pick} kicker={pick?.purpose === 'orion' ? 'dernier tir' : 'sacrifice'} title={pick?.purpose === 'orion' ? 'Orion, le Chasseur' : 'Prométhée'} center>
        {pick?.mine ? (
          <>
            <AppText tone="muted" size={13} center>{pick.purpose === 'orion' ? 'Désignez publiquement un joueur qui tombe avec vous.' : 'Désignez un joueur : son camp sera révélé à tous.'}</AppText>
            <View style={{ alignSelf: 'stretch', gap: 8 }}>
              {pick.candidates.map((id) => <Button key={id} variant="ghost" block label={name(id)} onPress={() => send({ t: 'pick', target: id })} />)}
            </View>
          </>
        ) : (
          <>
            <AppText tone="muted" size={13} center>{`${pick?.byName ?? 'Un joueur'} choisit sa cible…`}</AppText>
            {view.isHost ? <Button variant="ghost" small center label="Passer (choix au hasard)" onPress={() => send({ t: 'skip' })} /> : null}
          </>
        )}
      </ModalSheet>

      <ModalSheet visible={!!guess} kicker="dernière chance" title={guess?.stage === 'result' ? (guess.outcome === 'win' ? 'Bonne réponse !' : guess.outcome === 'skip' ? 'Pas de proposition' : 'Raté !') : 'Mr. White'} center>
        {guess?.stage === 'result' ? (
          <>
            <AppText size={13.5} center>{guess.outcome === 'win' ? `${guess.byName} a trouvé le mot des Civils et gagne la partie à lui/elle seul(e) !` : `${guess.byName} ${guess.outcome === 'skip' ? 'passe son tour' : `a proposé « ${guess.guess ?? ''} »`}. Le mot reste secret.`}</AppText>
            {view.isHost ? <Button arrow center label={guess.outcome === 'win' ? 'Voir le résultat' : guess.hasNext ? 'Mr. White suivant' : 'Continuer'} onPress={() => send({ t: 'continue' })} /> : <Waiting>En attente de l'hôte…</Waiting>}
          </>
        ) : guess?.mine ? (
          <>
            <AppText tone="muted" size={13} center>Devine le mot des Civils. Si tu le trouves, tu gagnes seul(e) la partie !</AppText>
            <View style={{ alignSelf: 'stretch' }}><Field label="Ta proposition" value={text} onChangeText={setText} autoCapitalize="none" /></View>
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
              <Button variant="ghost" label="Renoncer" onPress={() => send({ t: 'guess', value: null })} />
              <Button arrow label="Valider" disabled={!text.trim()} onPress={() => send({ t: 'guess', value: text })} />
            </View>
          </>
        ) : (
          <>
            <AppText tone="muted" size={13} center>{`${guess?.byName ?? 'Mr. White'} tente de deviner le mot des Civils…`}</AppText>
            {view.isHost ? <Button variant="ghost" small center label="Passer son tour" onPress={() => send({ t: 'skip' })} /> : null}
          </>
        )}
      </ModalSheet>
    </>
  );
}

/* ----------------------------------------------------------------- écran de jeu */

export function OnlineGame(): React.JSX.Element {
  const { view, leave, status } = useOnline();
  const router = useRouter();
  const [cardOpen, setCardOpen] = useState(false);
  const [origin, setOrigin] = useState<ReturnType<typeof takeOrigin>>(null);
  const g = view?.game ?? null;

  // Ambiance du fond et sang à chaque élimination, comme en mode local.
  const dead = g ? g.players.filter((p) => p.eliminated).length : 0;
  const prevDead = useRef(dead);
  useEffect(() => {
    if (dead > prevDead.current) bleed();
    if (dead === 0) bleedReset();
    prevDead.current = dead;
  }, [dead]);
  const discussing = !!g && g.phase === 'reveal' && g.players.every((p) => p.viewed);
  const winner = g?.result?.winner;
  useEffect(() => {
    if (!g) return;
    setAmbience(g.phase === 'vote' || (g.phase === 'gameover' && winner !== 'civils') ? 'burgundy' : discussing ? 'violet' : 'green');
  }, [g, discussing, winner]);
  useEffect(() => () => setAmbience('none'), []);

  if (!view || !g) return <View />;
  const openCard = (): void => { setOrigin(takeOrigin()); setCardOpen(true); };
  const closeCard = (): void => { setCardOpen(false); };
  return (
    <Screen>
      <Page>
        {status === 'reconnecting' ? <View style={{ marginBottom: 14 }}><Callout accent="blood"><AppText size={12.5}>Connexion perdue… reconnexion en cours. Votre place est conservée.</AppText></Callout></View> : null}
        {g.spectator ? <View style={{ marginBottom: 14 }}><Callout><AppText size={12.5}>{g.phase === 'gameover' ? 'Vous étiez spectateur de cette manche : vous jouerez la suivante.' : 'Vous êtes arrivé en cours de manche : vous regardez, et vous jouerez dès la manche suivante.'}</AppText></Callout></View> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <View>
            <AppText title size={26}>{`Manche ${g.round}`}</AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 }}>
              <Sparkle size={9} color={ART.blood} />
              <AppText tone="accent" label size={10.8} style={{ letterSpacing: 1.8, textTransform: 'uppercase' }}>{`Salle ${view.code} · ${g.players.length} agents${g.spectators.length > 0 ? ` · ${g.spectators.length} ${g.spectators.length > 1 ? 'spectateurs' : 'spectateur'}` : ''}`}</AppText>
            </View>
          </View>
          <Button small variant="ghost" label="Quitter" onPress={() => { leave(); router.replace('/'); }} />
        </View>

        {g.phase === 'reveal' ? <RevealPhase view={view} g={g} onOpenCard={openCard} /> : null}
        {g.phase === 'vote' ? <VotePhase view={view} g={g} /> : null}
        {g.phase === 'gameover' ? <GameOverPhase view={view} g={g} /> : null}

        <View style={{ marginTop: 26 }}><SocialDock /></View>
      </Page>
      <OnlineSeen g={g} open={cardOpen} origin={origin} onClose={closeCard} />
      <Prompts view={view} g={g} />
      <BloodRain active={g.phase === 'gameover' && (winner === 'undercover' || winner === 'mrwhite')} />
    </Screen>
  );
}

/** Fenêtre de ma carte : à la fermeture, le serveur est prévenu que je l'ai lue. */
function OnlineSeen({ g, open, origin, onClose }: { g: GameView; open: boolean; origin: ReturnType<typeof takeOrigin>; onClose: () => void }): React.JSX.Element | null {
  const { send } = useOnline();
  const me = g.me;
  if (!me) return null; // spectateur : pas de carte
  return (
    <OnlineCardModal open={open} card={me.card} icon={me.icon} origin={origin}
      onClose={() => { onClose(); if (!me.viewed) send({ t: 'seen' }); }} />
  );
}
