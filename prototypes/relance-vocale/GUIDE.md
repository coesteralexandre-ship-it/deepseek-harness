# Échéance — démo « signal → pipeline → appel »

Application Next.js 16 déployable sur Vercel : des signaux d'impayés qualifient des agences d'intérim, un pipeline les fait avancer, et un agent vocal ElevenLabs les appelle en se présentant comme la démo du produit. Autour de l'appel : une lettre imprimable avec QR code, une page publique où le prospect parle à l'agent ou se fait rappeler, et une note vocale exportable vers lemlist et WhatsApp. Le brainstorm produit, orchestration, outreach et niches est dans [BRAINSTORM.md](./BRAINSTORM.md).

## Ce que fait la démo

| Page | Rôle |
|---|---|
| `/` | Pipeline en colonnes (Nouveau → À appeler → Appel en cours → À rappeler → RDV pris → Pas intéressé). Glisser-déposer pour changer d'étape. |
| `/signaux` | Boîte de réception des signaux (LinkedIn, offres d'emploi, Pappers, BODACC, presse, avis, inbound, recommandation). Qualifier rend l'entreprise appelable ; ignorer retire le signal du score. Formulaire d'ajout manuel. |
| `/prospects/[id]` | Fiche : contact, score, angle d'ouverture, signaux, historique des appels avec transcription. Panneau d'appel (navigateur, appel sortant, simulation) et panneau Outreach (lien public, lettre, note vocale, lemlist, WhatsApp). |
| `/prospects/[id]/lettre` | Letter builder : lettre A4 générée depuis le signal le plus fort, éditable, avec QR code vers la page publique ; impression / PDF ; réécriture par LLM si configurée. |
| `/l/[token]` | Page publique derrière le QR code et la note vocale, sans menu : le prospect parle à Léa dans le navigateur, demande à être rappelé, ou écoute le message. Chaque ouverture crée un signal inbound de poids 5 et rend l'entreprise appelable. |
| `/agent` | Tout ce qu'il faut coller dans ElevenLabs : prompt, premier message, variables dynamiques, collecte de données, webhook, outil de prise de RDV, état de la configuration. |

Trois façons de « passer l'appel » :

1. **Navigateur** — vous jouez le prospect, l'agent vous appelle via WebSocket avec les variables du prospect (`@elevenlabs/react`). À la fin, vous qualifiez l'issue ; si l'agent a appelé l'outil `book_meeting`, le créneau est déjà noté.
2. **Téléphone** — `POST /api/prospects/[id]/call` déclenche un appel sortant ElevenLabs (Twilio ou SIP). L'issue arrive par le webhook post-appel et déplace la carte.
3. **Simulation** — sans compte ElevenLabs, génère un appel terminé (transcription, résumé, issue) pour montrer le pipeline.

## La boucle lettre → QR → appel

1. Le letter builder génère une lettre depuis les signaux (`core/letter.ts`) : accroche selon la source du signal le plus fort, angle d'ouverture, présentation honnête de l'IA, invitation à scanner le QR code, mention « stop ». Le texte est éditable et sauvegardé sur le prospect.
2. Le QR code pointe sur `/l/<token>` (token opaque par prospect, `landingToken`). La page ne montre ni menu ni pipeline.
3. Ouvrir la page enregistre un signal « A ouvert le lien de la lettre (QR code) » (au plus un par jour) ; demander un rappel enregistre « A demandé à être rappelé ». Un prospect « Nouveau » ou « Pas intéressé » repasse en « À appeler ».
4. Sur la page, « Parler à Léa » lance la conversation navigateur avec les variables du prospect ; « Appelez-moi » déclenche un appel sortant vers le numéro saisi ; « Écouter » lit la note vocale.
5. La conversation navigateur est journalisée par `/api/l/[token]/calls` ; l'issue est « RDV pris » si l'agent a appelé `book_meeting`, sinon « à qualifier » par un humain.

## Note vocale, lemlist, WhatsApp

- **Script** : `core/letter.ts` produit un texte d'environ 40 secondes (accroche selon le signal, présentation IA, invitation à ouvrir le lien). Il est éditable dans le panneau Outreach et sauvegardé sur le prospect.
- **Synthèse** : `POST /api/prospects/[id]/outreach/audio` appelle ElevenLabs Text to Speech avec `ELEVENLABS_VOICE_ID` (MP3 44,1 kHz 128 kb/s ou Ogg Opus 48 kHz pour WhatsApp) et met le fichier en cache dans le store (`rv:audio:<id>:<format>` sur Redis). `GET /api/prospects/[id]/audio?format=mp3|ogg` le sert ; `GET /api/l/[token]/audio?format=` est l'URL publique, synthétisée à la première demande.
- **lemlist** : `POST /api/prospects/[id]/outreach/lemlist` ajoute le contact à la campagne `LEMLIST_CAMPAIGN_ID` (`POST /api/campaigns/{id}/leads/{email}?deduplicate=true`, authentification Basic avec la clé API) avec les variables `landingUrl`, `audioUrl` (MP3 public), `audioOggUrl`, `letterUrl`, `angle`, `signal`, `role`, `city`. Dans la séquence, un email « Léa vous a laissé un message de 40 secondes » pointe sur `{{audioUrl}}` ou `{{landingUrl}}`. Le MP3 téléchargé sert aussi de message vocal LinkedIn via l'extension lemlist.
- **WhatsApp** : `POST /api/prospects/[id]/outreach/whatsapp` renvoie un lien `wa.me` avec le texte prérempli (le fichier OGG se joint à la main), ou, avec `send: true` et `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`, envoie la note par l'API Cloud (`type: audio`, `audio.link` = URL publique OGG). L'API n'accepte un audio libre que dans une fenêtre de 24 h ouverte par le destinataire ; un premier contact passe par un modèle approuvé.
- **Réécriture LLM** (optionnel) : avec `DEEPSEEK_API_KEY`, le bouton « Réécrire avec l'IA » du letter builder envoie le brouillon à `POST /chat/completions` (API compatible OpenAI) avec des règles strictes : aucun fait inventé, mention IA conservée, pas de promesse.

## Lancer en local

```sh
cd prototypes/relance-vocale
pnpm install            # lockfile et node_modules propres à ce dossier
cp .env.example .env.local
pnpm dev                # http://localhost:3000
```

Sans aucune variable, l'app tourne en mémoire avec le jeu de test, la simulation, le letter builder et la page publique. Les fichiers `.env.local` ne sont jamais commités.

## Déployer sur Vercel

1. Importer le dépôt dans Vercel et régler **Root Directory** sur `prototypes/relance-vocale` (le dossier a son propre `pnpm-workspace.yaml` et son propre lockfile : Vercel n'installe pas le monorepo).
2. Variables d'environnement (Settings → Environment Variables) : reprendre `.env.example`. `NEXT_PUBLIC_APP_URL` = l'URL Vercel ; elle entre dans le QR code, les liens lemlist et les URL audio publiques.
3. **Persistance** : Storage → Marketplace → Upstash Redis (plan gratuit). Vercel injecte `KV_REST_API_URL` / `KV_REST_API_TOKEN` (ou les noms `UPSTASH_*`) ; l'app les accepte tous les deux. Sans Redis, chaque instance serverless repart du jeu de test : suffisant pour une démo, pas pour un webhook, un QR code ou une URL audio qui doivent retrouver l'état d'une autre instance.
4. **Protection** : la démo n'a pas d'authentification. Activez Vercel Authentication ou Password Protection avant de partager l'URL, en laissant passer `/l/*`, `/api/l/*`, `/api/webhooks/*` et `/api/tools/*` (« Deployment Protection Exceptions ») : ce sont les seuls chemins que le prospect, ElevenLabs, lemlist et WhatsApp doivent atteindre.

## Configurer ElevenLabs

### 1. Clé API et agent

- Clé : https://elevenlabs.io/app/settings/api-keys → `ELEVENLABS_API_KEY`.
- Agent : soit `pnpm create-agent` (lit `.env.local`, crée l'agent avec le prompt de `core/agent-prompt.ts`, la collecte de données et le critère d'évaluation, puis affiche l'identifiant), soit dans le dashboard Conversational AI → New agent en collant les blocs de la page `/agent`. Dans les deux cas, `ELEVENLABS_AGENT_ID` = l'identifiant obtenu.
- Vérifiez sur l'agent : langue **français**, une voix française, et les **variables dynamiques** listées sur `/agent` déclarées avec une valeur par défaut (sinon l'agent refuse de démarrer si une variable manque).
- Voix : choisissez une voix française dans la Voice Library et mettez son identifiant dans `ELEVENLABS_VOICE_ID` ; elle sert à la note vocale et à l'agent créé par script.

### 2. Conversation dans le navigateur

Rien d'autre : `GET /api/elevenlabs/signed-url` signe l'URL côté serveur, le navigateur ne voit jamais la clé. Le micro doit être autorisé. L'outil client `book_meeting` est fourni par l'app ; déclarez-le sur l'agent (Tools → Client tool, paramètres `slot` et `notes`) pour que le modèle sache l'appeler.

### 3. Appels sortants

- Importer un numéro : Conversational AI → Phone numbers → Twilio (SID + token) ou SIP trunk. Copier son identifiant dans `ELEVENLABS_PHONE_NUMBER_ID`, et mettre `ELEVENLABS_PHONE_PROVIDER=sip_trunk` si c'est un trunk SIP.
- Le bouton « Lancer l'appel » de la fiche prospect compose le numéro saisi (par défaut celui du prospect ; mettez le vôtre pour recevoir l'appel). Sur la page publique, « Appelez-moi » compose le numéro saisi par le visiteur.
- Les numéros du jeu de test sont fictifs.

### 4. Webhook post-appel

Settings → Webhooks → Post-call → URL `https://<votre-app>/api/webhooks/elevenlabs`, événement `post_call_transcription`. Copier le secret affiché dans `ELEVENLABS_WEBHOOK_SECRET` : l'app vérifie la signature HMAC (`ElevenLabs-Signature: t=…,v0=…`, tolérance 30 minutes). Le webhook :

- retrouve le prospect par la variable dynamique `prospect_id` (ou par l'identifiant de conversation d'un appel ouvert) ;
- lit `analysis.data_collection_results.outcome` (`rdv`, `rappel`, `refus`) ou, à défaut, le critère `booked_meeting` ;
- enregistre résumé, créneau, transcription, et déplace la carte.

Sans secret configuré, le webhook est accepté sans vérification (mode démo).

### 5. Outil serveur « prise de rendez-vous » (optionnel)

Pour que l'agent enregistre le RDV pendant un appel téléphonique : Agent → Tools → Webhook, `POST https://<votre-app>/api/tools/book-meeting`, en-tête `x-tool-secret: <TOOL_SECRET>`, paramètres `prospect_id` (valeur : variable dynamique `prospect_id`), `slot` et `notes` (remplis par le modèle). Sans cet outil, le créneau arrive quand même par la collecte de données à la fin de l'appel.

## API

| Route | Usage |
|---|---|
| `GET /api/prospects` | Prospects avec signaux et score |
| `GET/PATCH /api/prospects/[id]` | Fiche ; `{ stage, notes, angle, letter, voiceScript, nextCallAt }` |
| `POST /api/prospects/[id]/call` | Appel sortant ElevenLabs, `{ toNumber? }` |
| `POST /api/prospects/[id]/calls` | Journal des conversations navigateur : `{ action: 'open' \| 'close', … }` |
| `POST /api/prospects/[id]/simulate` | Appel simulé, `{ outcome?: 'rdv' \| 'rappel' \| 'refus' }` |
| `POST /api/prospects/[id]/letter` | `{ action: 'generate' }` modèle depuis les signaux ; `{ action: 'polish', text? }` réécriture LLM |
| `GET /api/prospects/[id]/outreach` | Liens publics, état des notes vocales, intégrations activées |
| `POST /api/prospects/[id]/outreach/audio` | Synthèse `{ format?: 'mp3' \| 'ogg', script?, regenerate? }` |
| `GET /api/prospects/[id]/audio?format=` | Note vocale en cache |
| `POST /api/prospects/[id]/outreach/lemlist` | Ajout à la campagne lemlist, `{ email? }` |
| `POST /api/prospects/[id]/outreach/whatsapp` | `{ to?, send? }` : lien `wa.me` ou envoi par l'API Cloud |
| `GET /api/l/[token]/audio?format=` | Note vocale publique (synthétisée à la demande) |
| `POST /api/l/[token]/call` | Rappel demandé par le prospect, `{ toNumber }` |
| `POST /api/l/[token]/calls` | Journal de la conversation navigateur publique |
| `GET/POST /api/signals` | Liste ; ingestion (`prospectId` ou `prospect` à créer) |
| `PATCH /api/signals/[id]` | `{ status: 'qualifie' \| 'ignore' \| 'nouveau' }` |
| `GET /api/elevenlabs/signed-url` | URL signée pour le navigateur |
| `POST /api/webhooks/elevenlabs` | Webhook post-appel |
| `POST /api/tools/book-meeting` | Outil appelé par l'agent |
| `POST /api/reset` | Recharge le jeu de test |

Un outil d'enrichissement (Clay, n8n, scraper LinkedIn) alimente le pipeline en appelant `POST /api/signals` ; la page `/agent` montre un exemple de corps.

## Structure

```
app/(app)/      pages internes : pipeline, signaux, fiche, letter builder, agent
app/(public)/   page publique /l/[token] (sans menu)
app/api/        routes API
components/     board, cartes, panneau d'appel, outreach, letter builder, page publique
core/           types, store (mémoire ou Upstash), scoring, prompt, lettre et script vocal,
                clients ElevenLabs (agent, TTS), lemlist, WhatsApp, DeepSeek
scripts/        create-agent.ts
```

Le dossier n'appartient pas au workspace pnpm du dépôt : lint, typecheck et tests du monorepo ne le couvrent pas. Ses vérifications sont `pnpm typecheck` et `pnpm build` dans ce dossier.

## Limites connues

- Aucune authentification ni multi-tenant : une seule « équipe », un seul agent. Les routes publiques `/l/*` ne sont protégées que par le token du prospect.
- `pnpm create-agent` envoie le format d'agent documenté par ElevenLabs au moment de l'écriture ; si l'API refuse le corps, créez l'agent dans le dashboard avec les blocs de `/agent`.
- Le mode mémoire perd les données à chaque redémarrage ; sur Vercel, ajoutez Upstash avant d'utiliser le webhook, le QR code ou les URL audio publiques.
- lemlist et WhatsApp : les appels API suivent leur documentation actuelle mais n'ont pas été exercés avec de vrais comptes dans ce dépôt ; l'erreur renvoyée par l'API est affichée telle quelle dans le panneau.
- Les appels à froid par IA sont encadrés : information sur la nature IA dès le premier message (déjà dans le prompt, la lettre et la note vocale), respect de l'opposition, horaires B2B, conservation limitée des transcriptions. Voir la section conformité de [BRAINSTORM.md](./BRAINSTORM.md).
