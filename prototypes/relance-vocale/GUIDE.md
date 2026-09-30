# Échéance — démo « signal → pipeline → appel »

Application Next.js 16 déployable sur Vercel : des signaux d'impayés qualifient des agences d'intérim, un pipeline les fait avancer, et un agent vocal ElevenLabs les appelle en se présentant comme la démo du produit. Le brainstorm produit, orchestration et outreach est dans [BRAINSTORM.md](./BRAINSTORM.md).

## Ce que fait la démo

| Page | Rôle |
|---|---|
| `/` | Pipeline en colonnes (Nouveau → À appeler → Appel en cours → À rappeler → RDV pris → Pas intéressé). Glisser-déposer pour changer d'étape. |
| `/signaux` | Boîte de réception des signaux (LinkedIn, offres d'emploi, Pappers, BODACC, presse, avis, inbound, recommandation). Qualifier rend l'entreprise appelable ; ignorer retire le signal du score. Formulaire d'ajout manuel. |
| `/prospects/[id]` | Fiche : contact, score, angle d'ouverture, signaux, historique des appels avec transcription. Panneau d'appel : conversation dans le navigateur, appel sortant réel, ou simulation. |
| `/agent` | Tout ce qu'il faut coller dans ElevenLabs : prompt, premier message, variables dynamiques, collecte de données, webhook, outil de prise de RDV, état de la configuration. |

Trois façons de « passer l'appel » :

1. **Navigateur** — vous jouez le prospect, l'agent vous appelle via WebSocket avec les variables du prospect (`@elevenlabs/react`). À la fin, vous qualifiez l'issue ; si l'agent a appelé l'outil `book_meeting`, le créneau est déjà noté.
2. **Téléphone** — `POST /api/prospects/[id]/call` déclenche un appel sortant ElevenLabs (Twilio ou SIP). L'issue arrive par le webhook post-appel et déplace la carte.
3. **Simulation** — sans compte ElevenLabs, génère un appel terminé (transcription, résumé, issue) pour montrer le pipeline.

## Lancer en local

```sh
cd prototypes/relance-vocale
pnpm install            # lockfile et node_modules propres à ce dossier
cp .env.example .env.local
pnpm dev                # http://localhost:3000
```

Sans aucune variable, l'app tourne en mémoire avec le jeu de test et la simulation. Les fichiers `.env.local` ne sont jamais commités.

## Déployer sur Vercel

1. Importer le dépôt dans Vercel et régler **Root Directory** sur `prototypes/relance-vocale` (le dossier a son propre `pnpm-workspace.yaml` et son propre lockfile : Vercel n'installe pas le monorepo).
2. Variables d'environnement (Settings → Environment Variables) : reprendre `.env.example`. `NEXT_PUBLIC_APP_URL` = l'URL Vercel, utilisée pour afficher les URL de webhook et d'outil sur la page Agent.
3. **Persistance** : Storage → Marketplace → Upstash Redis (plan gratuit). Vercel injecte `KV_REST_API_URL` / `KV_REST_API_TOKEN` (ou les noms `UPSTASH_*`) ; l'app les accepte tous les deux. Sans Redis, chaque instance serverless repart du jeu de test : suffisant pour une démo, pas pour un webhook qui doit retrouver un appel lancé par une autre instance.
4. **Protection** : la démo n'a pas d'authentification. Activez Vercel Authentication ou Password Protection avant de partager l'URL. Le webhook ElevenLabs doit alors rester accessible : Vercel Password Protection laisse passer les chemins déclarés dans « Deployment Protection Exceptions », ou bien utilisez un secret de webhook et un déploiement sans protection.

## Configurer ElevenLabs

### 1. Clé API et agent

- Clé : https://elevenlabs.io/app/settings/api-keys → `ELEVENLABS_API_KEY`.
- Agent : soit `ELEVENLABS_API_KEY=… pnpm create-agent` (crée l'agent avec le prompt de `core/agent-prompt.ts`, la collecte de données et le critère d'évaluation, puis affiche l'identifiant), soit dans le dashboard Conversational AI → New agent en collant les blocs de la page `/agent`. Dans les deux cas, `ELEVENLABS_AGENT_ID` = l'identifiant obtenu.
- Vérifiez sur l'agent : langue **français**, une voix française, et les **variables dynamiques** listées sur `/agent` déclarées avec une valeur par défaut (sinon l'agent refuse de démarrer si une variable manque).

### 2. Conversation dans le navigateur

Rien d'autre : `GET /api/elevenlabs/signed-url` signe l'URL côté serveur, le navigateur ne voit jamais la clé. Le micro doit être autorisé. L'outil client `book_meeting` est fourni par l'app ; déclarez-le sur l'agent (Tools → Client tool, paramètres `slot` et `notes`) pour que le modèle sache l'appeler.

### 3. Appels sortants

- Importer un numéro : Conversational AI → Phone numbers → Twilio (SID + token) ou SIP trunk. Copier son identifiant dans `ELEVENLABS_PHONE_NUMBER_ID`, et mettre `ELEVENLABS_PHONE_PROVIDER=sip_trunk` si c'est un trunk SIP.
- Le bouton « Lancer l'appel » de la fiche prospect compose le numéro saisi (par défaut celui du prospect ; mettez le vôtre pour recevoir l'appel).
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
| `GET/PATCH /api/prospects/[id]` | Fiche ; `{ stage, notes, angle, nextCallAt }` |
| `POST /api/prospects/[id]/call` | Appel sortant ElevenLabs, `{ toNumber? }` |
| `POST /api/prospects/[id]/calls` | Journal des conversations navigateur : `{ action: 'open' \| 'close', … }` |
| `POST /api/prospects/[id]/simulate` | Appel simulé, `{ outcome?: 'rdv' \| 'rappel' \| 'refus' }` |
| `GET/POST /api/signals` | Liste ; ingestion (`prospectId` ou `prospect` à créer) |
| `PATCH /api/signals/[id]` | `{ status: 'qualifie' \| 'ignore' \| 'nouveau' }` |
| `GET /api/elevenlabs/signed-url` | URL signée pour le navigateur |
| `POST /api/webhooks/elevenlabs` | Webhook post-appel |
| `POST /api/tools/book-meeting` | Outil appelé par l'agent |
| `POST /api/reset` | Recharge le jeu de test |

Un outil d'enrichissement (Clay, n8n, scraper LinkedIn) alimente le pipeline en appelant `POST /api/signals` ; la page `/agent` montre un exemple de corps.

## Structure

```
app/            pages et routes API (App Router)
components/     board, cartes, panneau d'appel, boîte de réception
core/           types, store (mémoire ou Upstash), scoring, prompt, client ElevenLabs
scripts/        create-agent.ts
```

Le dossier n'appartient pas au workspace pnpm du dépôt : lint, typecheck et tests du monorepo ne le couvrent pas. Ses vérifications sont `pnpm typecheck` et `pnpm build` dans ce dossier.

## Limites connues

- Aucune authentification ni multi-tenant : une seule « équipe », un seul agent.
- `pnpm create-agent` envoie le format d'agent documenté par ElevenLabs au moment de l'écriture ; si l'API refuse le corps, créez l'agent dans le dashboard avec les blocs de `/agent`.
- Le mode mémoire perd les données à chaque redémarrage ; sur Vercel, ajoutez Upstash avant d'utiliser le webhook.
- Les appels à froid par IA sont encadrés : information sur la nature IA dès le premier message (déjà dans le prompt), respect de l'opposition, horaires B2B, et conservation limitée des transcriptions. Voir la section conformité de [BRAINSTORM.md](./BRAINSTORM.md).
