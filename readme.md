# MythoMytho — Expo / React Native Web (TypeScript strict)

Conversion de la PWA HTML/CSS/JS en application universelle : **iOS, Android et web** depuis une seule base de code,
navigation par **Expo Router**, cible web en **application monopage exportée** (hébergement type GitHub Pages, `CNAME` conservé).

## Démarrer

```bash
npm install
npx expo install --fix      # aligne toutes les dépendances sur la version d'Expo SDK installée
npm run web                 # ou: npm run android / npm run ios
npm run typecheck           # TypeScript strict
npm run test:domain         # règles du jeu + 400 parties simulées (sans dépendance)
npm run build:web           # export statique dans dist/
```

> `package.json` laisse volontairement `*` pour les bibliothèques Expo : `npx expo install --fix` choisit les versions
> compatibles avec votre SDK (testé sur la base d'Expo SDK 58).

## Écran de configuration : tableau de bord

Mode **sombre par défaut** (le thème se mémorise sous la clé `mythomytho_theme_v2`). L'écran s'organise en cartes
(`src/components/dashboard/`) : sélecteur de joueurs en piste, jauge de composition Civils ⟷ imposteurs (touchez la barre
pour régler les imposteurs), jetons de rôles classiques (− / +) et spéciaux (+ / ✕, pastille « ? » pour l'explication),
thèmes, noms et groupes, minuteur et confidentialité. Deux colonnes dès 980 px de large ; en dessous, une colonne et une
barre de lancement fixe. Les icônes des 19 rôles sont des SVG (`RoleArt.tsx`).

## Design : « tarot macabre »

Toute l'interface reprend le style des illustrations de rôles (`assets/icons/*.svg`) : trait crème parchemin sur fonds vert / violet /
bordeaux nuit, un seul accent (rouge sang `#8f1d27`), hachures à 45°, double cadre avec étoiles aux angles, cartouches à lettres
espacées, gouttes de sang effilées et craquelures rouges. Palette stricte dans `src/theme/tokens.ts` (`#d9ccb0`, `#8f1d27`,
`#0e1613`, `#17101f`, `#240a0d`) ; thèmes **Nuit** (défaut) et **Parchemin** (même gravure à l'encre sur papier ; les cartes restent sombres).

* `src/components/ui/ornaments.tsx` : vocabulaire graphique (`Frame`, `Hatch`, `Plaque`, `Divider`, gouttes, craquelures, étoiles).
* `Backdrop` : fond de table (halo, hachures, cadre, gouttes). `CardBack` : dos de carte à l'œil (cartes des joueurs).
* Cartes de rôles : les 19 illustrations d'origine, rendues par `RoleArt` depuis `src/theme/roleArt.ts`, **fichier généré** :
  après modification d'un SVG de `assets/icons/`, relancer `node scripts/build-role-art.mjs`.
* `ThemeOverride` impose une palette à un sous-arbre (carte secrète toujours en parchemin, bannière de fin toujours sombre).
* **Mouvement** (`src/components/ui/motion.ts`) : retournement 3D de la carte du joueur avant la carte secrète, léger balancement des cartes,
  gouttes qui coulent à l'ouverture et à chaque élimination (`bleed.ts`), tampon « Éliminé » qui s'abat sur la carte. Tout est coupé
  quand le système demande de réduire les animations (`useReducedMotion`, y compris `prefers-reduced-motion` sur le web).
* **Textures** : grain de papier sur le parchemin et le fond, vignettage de tranche sur les cartes (`Grain`, `EdgeVignette`).
* **Fin de manche** : toutes les cartes sont révélées, les perdants barrés d'une croix rouge ; les gouttes se multiplient si les imposteurs gagnent.
* **Comment jouer** : six étapes illustrées (`setup/HowToPlay.tsx`). **Accueil** : `Splash.tsx` (carte « Le Mytho » + gouttes) et image native `assets/images/splash.png`.
* **Libellés** : capitales géométriques grasses Outfit (`assets/fonts/Outfit-Bold.ttf`, licence OFL fournie), via `fonts.label`.
* **Annonce d'élimination** : la carte du joueur éliminé arrive face cachée puis se retourne en grand sur son rôle illustré (`game/RevealFlip.tsx`).
  Chaque face porte sa propre rotation 3D : `backfaceVisibility` ne dépend ainsi pas de `preserve-3d`, absent du web.
* **Dos de carte par joueur** : teinte (violet, vert, bordeaux) et petit emblème gravé selon la place à la table (`CardBack.tsx`, `backStyle`).
* **Minuteur** : fiole de sang qui se remplit (`BloodGauge.tsx`), qui pulse sur les 10 dernières secondes.
* **Fond par phase** (`ambience.ts`) : halo vert à la distribution, violet à la discussion, bordeaux au vote, avec lueur de bougie qui respire.
* **Carte secrète** : grandit depuis la carte touchée (`cardOrigin.ts`), parchemin vieilli (plis, taches, bord effiloché ; version légère en thème parchemin).
* **Accueil et scores** : éventail de cartes de rôles, podium en piles de cartes, barres de statistiques hachurées (`Podium.tsx`, `Bars.tsx`).
* **Logo** : une goutte tombe de temps en temps dans le reflet, reflet plus net.
* **Sons et vibrations** : froissement au retournement, choc sourd du tampon (`assets/sounds/`, `useFeedback`), réglable dans « Minuteur et confidentialité »
  (`settings.effects`, activé par défaut). Toutes les animations respectent « réduire les animations ».
* **Distribution** : au début de la manche, les cartes partent du centre de la rangée et glissent à leur place une à une, avec un froissement (`DealIn`).
* **Brillance** : une bande de lumière suit le doigt (ou le pointeur) sur les cartes de rôles et balaie la carte révélée (`ui/Sheen.tsx`).
  L'inclinaison du téléphone n'est pas gérée : elle demanderait `expo-sensors` (`npx expo install expo-sensors`).
* **Fin de manche** : vainqueurs hissés dans un halo crème, perdants affaissés, voilés et barrés ; pluie de gouttes sur tout l'écran quand
  les imposteurs gagnent (`ui/BloodRain.tsx`).
* **Résumé partageable** (`features/summary.ts`, `services/shareImage.ts`) : sur le web, image PNG (feuille de partage du navigateur ou téléchargement) ;
  sur mobile, résumé en texte. Une vraie image sur mobile demanderait `react-native-view-shot` (`npx expo install react-native-view-shot`).
* **Thèmes de mots** : un emblème et une teinte par thème (`ui/ThemeBadge.tsx`) ; **états vides et erreurs** illustrés (`ui/Scenes.tsx`) :
  journal vide, page 404, import de « Mes paires » invalide.
* Icônes d'application et favicons PNG régénérés à partir de la carte « Le Mytho ».

## Adresses

| Adresse | Contenu |
|---|---|
| `/` | **Jeu en ligne** : pseudo, créer / rejoindre une salle (code à 4 lettres), salon, manche. Chaque joueur sur son appareil. |
| `/local` | **Mode local** (un seul appareil, passé de main en main) : l'écran de configuration d'origine, inchangé. |
| `/local/game` | Manche locale (lancée depuis `/local`). |
| `/scores`, `/custom-pairs` | Journal des scores, « Mes paires » (communs aux deux modes). |
| `/game`, `/online` | Anciennes adresses, redirigées vers `/local` et `/`. |

Un seul processus suffit en production : `npm run start:prod` exporte l'application web (`dist/`), compile le moteur et lance le serveur,
qui sert **les pages (avec repli sur `index.html`, donc `/local` fonctionne en accès direct ou après rechargement) et le WebSocket sur le même port**.
Sur le web en production, l'application se connecte à sa propre origine (`wss://votre-domaine`) : aucun réglage d'adresse n'est nécessaire.
`STATIC_DIR=…` change le dossier servi. Tests : `npm run test:server` (parties WebSocket + service des pages).

## Jouer en ligne (serveur autoritaire)

Chaque joueur joue sur son propre appareil. Un petit serveur Node tient la partie ; les téléphones ne font qu'envoyer des intentions
(« j'ai lu ma carte », « je vote pour 3 ») et afficher la vue que le serveur leur renvoie.

```
npm install                 # ajoute esbuild (compilation du moteur de salle)
npm run server              # compile le moteur puis écoute sur le port 8787 (PORT=… pour changer)
npm run test:server         # test de bout en bout : vrais clients WebSocket contre le vrai serveur
```

Dans l'application : « Jouer en ligne » (lien sous le logo). L'hôte crée une salle et communique son **code à 4 lettres** ; les autres le saisissent.
L'adresse du serveur se règle dans « Adresse du serveur » (formulaire) ou par la variable `EXPO_PUBLIC_SERVER_URL` (ex. `ws://192.168.1.20:8787`,
`wss://jeu.example.fr`). Sur le web, par défaut : la même origine que la page en production, et la machine de développement sur le port 8787 avec `expo start`.

**Ce que le serveur garantit**
* Il exécute le même code que l'application (`src/domain`, `src/state/gameReducer.ts`, moteur `src/net/room.ts`, compilé tel quel par `server/build.mjs`).
* Chaque joueur ne reçoit que **sa** carte (`src/net/room.ts › viewFor`). Les rôles d'un joueur ne deviennent publics qu'à son élimination ; mots et rôles de tous à la fin de manche.
* Les droits sont vérifiés côté serveur (hôte seul pour lancer, régler, continuer ; seul le joueur concerné pour Mr. White, Orion, Prométhée ; les éliminés ne votent pas ; pas de vote pour soi).
* Vote secret : on sait **qui** a voté, jamais **pour qui**. Égalité : second tour entre ex æquo, puis tirage au sort.
* Reconnexion : chaque siège a un jeton ; une coupure réseau (ou la fermeture de l'application) ne fait pas perdre sa place. Si l'hôte part, le premier joueur connecté le remplace.
* Aucune dépendance côté serveur : le WebSocket (RFC 6455) est écrit à la main dans `server/server.mjs` (remplaçable par `ws` si vous préférez).

**Déployer** : n'importe quel hébergeur Node (VPS, Fly.io, Railway, Render…) derrière du TLS (`wss://`). `ALLOWED_ORIGINS=https://jeu.example.fr` limite les origines web.
L'état des salles est en mémoire : un redémarrage du serveur ferme les parties en cours.

**Limites connues** : pas de rejoindre en cours de manche (seulement se reconnecter) ; la liste de mots utilisée est celle embarquée (les « Mes paires » locales ne sont pas envoyées) ;
la composition (rôles, thèmes, minuteur) se règle dans le salon et se fige au lancement.

## Premier lancement : à regarder en priorité

1. `npm run typecheck` — la première compilation contre les vrais types React Native / Expo peut révéler des détails de typage
   que la vérification hors ligne n'a pas pu voir.
2. Titres en police Sirelia sur téléphone (lettres, chiffres, accents).
3. Zones sûres (encoche, barre d'état, barre de navigation Android) sur tous les écrans.
4. Saisie dans la modale « Dernière chance » avec le clavier ouvert (iOS : `KeyboardAvoidingView`).
5. Son et vibration de fin de minuteur ; écran maintenu allumé pendant la distribution des cartes.

## Architecture

```
app/                      Routes Expo Router : fines, ne contiennent aucune logique
  _layout.tsx             polices, providers, Stack
  index.tsx               accueil = jeu en ligne (+ raccourcis ?action=scores / ?action=pairs)
  local/index.tsx         mode local : configuration     local/game.tsx  manche locale
  online.tsx game.tsx     anciennes adresses (redirections)
  scores.tsx  custom-pairs.tsx  +not-found.tsx  +html.tsx (shell PWA)
src/
  domain/                 ★ TypeScript pur — aucun import React / React Native
    types.ts constants.ts text.ts roles.ts balance.ts words.ts
    assign.ts             attribution des rôles
    elimination.ts        victoires, Orion, Prométhée, Amoureux, impasses, textes d'annonce
    journal.ts stats.ts   Mr. White, groupes, journal, stats, CSV/JSON, paires, lien de partage
  state/
    gameReducer.ts        ★ flux complet d'une manche, pur et testé
    settings.tsx library.tsx game.tsx toast.tsx AppProviders.tsx   (contextes + persistance)
  components/             interface uniquement (ui/, setup/, game/, scores/)
  services/               plateforme : storage, fichiers, vibration/son, dictée
  theme/                  palette « dossier » (clair/sombre), polices
  data/                   words.json, missions.json (embarqués, hors ligne) + chargeur typé
scripts/                  tests du domaine et du flux
public/                   manifest.json, sw.js, icônes (web)
```

Règle de dépendance : `components → state → domain`. `domain` ne dépend de rien, d'où des tests sans émulateur.

## Correspondance avec l'ancienne version

| Avant (JS global) | Maintenant |
|---|---|
| `core.js` : `state` global + ~200 refs DOM `el` | `domain/types.ts` (états typés immuables) + contextes React |
| `game.js` (attribution), `balance.js`, `themes.js`, `guess.js`, `journal.js` | `domain/assign.ts`, `balance.ts`, `words.ts`, `journal.ts`, `stats.ts` |
| `vote.js` (élimination + UI mélangées) | `domain/elimination.ts` + `state/gameReducer.ts` + `components/game/` |
| `cards.js`, `picker.js`, `questions.js` | `SecretCardModal`, `PickModal`, `GuessModal`, `GameOverPhase` |
| `timer.js`, `wakelock.js`, `audio.js` | `DiscussionTimer`, `expo-keep-awake`, `services/feedback.ts` |
| `custom-ui.js`, `journal-ui.js`, `groups.js` | `CustomPairsScreen`, `ScoresScreen`, `NamesBlock` |
| `sw.js` + `manifest.json` | `public/sw.js` (cache à l'usage) + `public/manifest.json` |
| `mytho.js` (jamais importé) | supprimé (code mort) |

**Données conservées** : les clés `undercover_*_v1` sont inchangées ; sur le web, AsyncStorage utilise localStorage avec la
même clé, donc réglages, groupes, paires et journaux existants sont relus. L'ancien lien `#paires=…` fonctionne toujours.

## Corrections apportées au passage

* « Les Civils ont gagne ! » → **gagné** (accent manquant dans les titres de fin).
* `mytho.js` orphelin (non importé, absent du précache) supprimé.
* Le readme d'origine annonçait 23 modules pour 24 fichiers ; manifest et readme n'avaient plus le même nom d'application.
* Le manifest référençait des captures `screenshot-*.png` absentes du dépôt : retirées.

## Police titre « Sirelia » : piège connu

Seules les lettres A–Z / a–z y sont dessinées : chiffres, accents et ponctuation sont des **glyphes vides**. Ses 36 ligatures
(« ca », « eu », « er », « em »…) étaient vides aussi, d'où des titres amputés (« Nouvelle manche » → « Nouvle nche »).
`assets/fonts/SireliaFixed.otf` est la même police **sans la fonctionnalité `liga`** (le fichier d'origine `Sirelia.otf` est
conservé tel quel). `AppText title` rend les suites de lettres en Sirelia et le reste en Courier Prime
(`src/theme/typography.ts`), comme l'`unicode-range` de l'ancienne version.

## Limites à connaître

* **Jamais lancé avec Expo ni sur appareil** (pas de réseau lors de la conversion). Vérifié : domaine et réducteur
  (TypeScript strict, 3 550 contrôles, 400 parties simulées) ; code applicatif en TypeScript strict ; et rendu réel de
  mes composants dans Chrome avec un substitut HTML des primitives React Native (parcours complet, Orion, Prométhée,
  Mr. White, journal, paires, thème sombre : 0 erreur console). Ce substitut approche `react-native-web` sans être
  identique : le premier `npx expo start` reste la vraie recette, surtout sur mobile.
* Bouton « Installer l'application » : web uniquement (événement `beforeinstallprompt`) ; il n'apparaît que si le navigateur propose l'installation.
* Export/import : téléchargement et sélecteur de fichier sur le web ; sur mobile, feuille de partage native et import par
  collage du JSON.
* Service worker : les bundles Expo sont hachés, il n'y a donc plus de liste de précache fixe ; le cache se remplit à
  l'usage (une première visite en ligne est nécessaire).
* `app.json` fixe `web.output` à `"single"` (application monopage : un seul `index.html` + le JavaScript). Le pré-rendu
  « static » n'apporte rien à ce jeu (tout dépend du navigateur) et, lors du premier test, laissait une page sans script.
  Sur GitHub Pages, copiez `dist/index.html` en `dist/404.html` pour que les liens directs (`/scores`) fonctionnent.
