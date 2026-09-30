# Échéance — relance vocale des factures, et sa prospection

Application Next.js 16 déployée sur Vercel, en deux espaces. **Relance** : le poste clients d'une agence d'intérim, où l'agent vocal ElevenLabs appelle les clients au sujet des factures échues, obtient une date et un montant de règlement, qualifie les litiges, et suit chaque promesse jusqu'au virement. **Prospection** : des signaux d'impayés qualifient des agences, un pipeline les fait avancer, et l'agent les appelle en se présentant comme la démo du produit, avec une lettre imprimable à QR code, une page publique et une note vocale. L'étude de marché et le positionnement sont dans [BRAINSTORM.md](./BRAINSTORM.md).

## Les écrans

| Page | Rôle |
|---|---|
| `/` | Poste clients : encours échu, promis cette semaine, litiges, file d'appels du jour, et pour chaque facture ce que l'agent a appris au téléphone. |
| `/factures/[id]` | Fiche facture : console vocale (navigateur, téléphone, simulation), promesses, litige, historique des appels avec transcription, lien de la page de réponse du client, décisions (règlement reçu, reprendre la main). |
| `/promesses` | Registre des promesses : promis, reçu et paie hebdomadaire sur cinq semaines, toutes les promesses, fiabilité de chaque payeur. |
| `/f/[token]` | Page publique du client relancé, sans compte : donner une date de paiement, signaler un litige, indiquer la bonne personne, demander un rappel. |
| `/pipeline` | Pipeline de prospection en colonnes ; glisser-déposer pour changer d'étape. |
| `/signaux` | Boîte de réception des signaux ; qualifier rend l'entreprise appelable. |
| `/prospects/[id]` | Fiche prospect : console vocale, signaux, angle, appels, et le panneau lettre, note vocale, lemlist, WhatsApp. |
| `/prospects/[id]/lettre` | Letter builder : lettre A4 avec QR code vers la page publique, éditable, impression ou PDF. |
| `/l/[token]` | Page publique du prospect : il parle à l'agent dans le navigateur ou écoute la note vocale. Chaque ouverture crée un signal. |
| `/agent` | Les deux agents (relance, prospection), leurs consignes, et l'état de chaque branchement. |
| `/connexion` | Saisie du code d'accès quand `APP_ACCESS_CODE` est défini. |

Trois façons de passer un appel, depuis la console vocale d'une facture ou d'un prospect :

1. **Navigateur** — vous jouez l'interlocuteur, l'agent vous parle via WebSocket avec les variables de la facture ou du prospect (`@elevenlabs/react`). À la fin, l'app relit l'analyse de l'agent (`action: 'analyze'`) et met la fiche à jour : promesse, litige, rendez-vous. Si l'analyse ne revient pas, vous qualifiez l'issue à la main.
2. **Téléphone** — appel sortant ElevenLabs (Twilio ou SIP) vers le numéro saisi. L'app interroge l'analyse jusqu'à la fin de l'appel ; le webhook post-appel fait le même travail quand personne n'a la page ouverte.
3. **Simulation** — sans minutes consommées, rejoue un appel terminé avec sa transcription.

## La boucle lettre → QR → appel

1. Le letter builder génère une lettre depuis les signaux (`core/letter.ts`) : accroche selon la source du signal le plus fort, angle d'ouverture, présentation honnête de l'IA, invitation à scanner le QR code, mention « stop ». Le texte est éditable et sauvegardé sur le prospect.
2. Le QR code pointe sur `/l/<token>` (token opaque par prospect, `landingToken`). La page ne montre ni menu ni pipeline.
3. Ouvrir la page enregistre un signal « A ouvert le lien de la lettre (QR code) » (au plus un par jour) ; demander un rappel enregistre « A demandé à être rappelé ». Un prospect « Nouveau » ou « Pas intéressé » repasse en « À appeler ».
4. Sur la page, « Parler à Léa » lance la conversation navigateur avec les variables du prospect ; « Écouter » lit la note vocale. « Appelez-moi » n'apparaît que si `PUBLIC_CALLBACK=1` : sans cela, n'importe qui avec le lien pourrait faire composer un numéro.
5. La conversation navigateur est journalisée par `/api/l/[token]/calls`, puis l'analyse de l'agent remplace l'issue provisoire.

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
pnpm sync-agents        # crée les deux agents ElevenLabs et écrit leurs identifiants dans .env.local
pnpm dev                # http://localhost:3000
```

Sans aucune variable, l'app tourne en mémoire avec le jeu de test, la simulation, le letter builder et la page publique. Les fichiers `.env.local` ne sont jamais commités.

## Déployer sur Vercel

```sh
vercel link --yes --project echeance
vercel env add APP_ACCESS_CODE production      # et les variables ELEVENLABS_* de .env.local
vercel deploy --prod
```

1. **Accès** : `APP_ACCESS_CODE` est obligatoire en ligne, puisque l'espace interne lance de vrais appels. `proxy.ts` exige le code (cookie posé par `/connexion`, ou `Authorization: Bearer <code>` pour un outil d'ingestion) partout sauf sur `/l/*`, `/f/*`, `/api/l/*`, `/api/f/*`, `/api/webhooks/*` et `/api/tools/*`.
2. **Adresse publique** : sans `NEXT_PUBLIC_APP_URL`, l'app prend le domaine de production Vercel pour les QR codes, les liens de réponse et les URL audio.
3. **Persistance** : Storage → Marketplace → Upstash Redis (plan gratuit). Vercel injecte `KV_REST_API_URL` / `KV_REST_API_TOKEN` (ou les noms `UPSTASH_*`). Sans Redis, chaque instance repart du jeu de test : suffisant pour une démo, pas pour retrouver une promesse ou un appel d'une instance à l'autre.
4. Le dossier a son propre `pnpm-workspace.yaml` et son propre lockfile : Vercel n'installe pas le monorepo. Pour un import depuis GitHub, régler **Root Directory** sur `prototypes/relance-vocale`.

## Configurer ElevenLabs

### 1. Clé API et agents

- Clé : https://elevenlabs.io/app/settings/api-keys → `ELEVENLABS_API_KEY`. Voix française de la Voice Library → `ELEVENLABS_VOICE_ID`.
- `pnpm sync-agents` crée les deux agents, ou les met à jour s'ils existent : prospection (`core/agent-prompt.ts` → `ELEVENLABS_AGENT_ID`) et relance (`core/relance-prompt.ts` → `ELEVENLABS_RELANCE_AGENT_ID`). Il déclare la langue, la voix, les variables dynamiques avec une valeur par défaut, la collecte de données et le critère d'évaluation, et écrit les identifiants dans `.env.local`.
- Après une modification des consignes, relancer `pnpm sync-agents`.

### 2. Conversation dans le navigateur

Rien d'autre : `GET /api/elevenlabs/signed-url` (`?agent=relance` pour l'agent de relance) signe l'URL côté serveur, le navigateur ne voit jamais la clé. Le micro doit être autorisé. La page publique passe par `GET /api/l/[token]/signed-url`, qui n'accepte qu'un jeton connu.

### 3. Appels sortants

- Importer un numéro : Conversational AI → Phone numbers → Twilio (SID + token) ou SIP trunk. Copier son identifiant dans `ELEVENLABS_PHONE_NUMBER_ID`, et mettre `ELEVENLABS_PHONE_PROVIDER=sip_trunk` si c'est un trunk SIP.
- L'onglet « Téléphone » de la console vocale compose le numéro saisi (par défaut celui de la fiche ; mettez le vôtre pour recevoir l'appel). Sur la page publique, « Appelez-moi » exige `PUBLIC_CALLBACK=1`.
- Les numéros du jeu de test sont fictifs.

### 4. Webhook post-appel

Settings → Webhooks → Post-call → URL `https://<votre-app>/api/webhooks/elevenlabs`, événement `post_call_transcription`. Copier le secret affiché dans `ELEVENLABS_WEBHOOK_SECRET` : l'app vérifie la signature HMAC (`ElevenLabs-Signature: t=…,v0=…`, tolérance 30 minutes). Le webhook :

- retrouve la facture par la variable dynamique `invoice_id`, ou le prospect par `prospect_id` (ou par l'identifiant de conversation d'un appel ouvert) ;
- pour une relance, lit `relance_outcome`, `promise_date`, `promise_amount`, `dispute_reason`, `right_contact` ; pour un prospect, `outcome` (`rdv`, `rappel`, `refus`) ou, à défaut, le critère `booked_meeting` ;
- enregistre résumé, créneau, transcription, et déplace la carte.

Sans secret configuré, le webhook est accepté sans vérification (mode démo). Il est facultatif tant qu'une page reste ouverte : la console vocale relit la même analyse par `GET /v1/convai/conversations/{id}`.

### 5. Outil serveur « prise de rendez-vous » (optionnel)

Pour que l'agent enregistre le RDV pendant un appel téléphonique : Agent → Tools → Webhook, `POST https://<votre-app>/api/tools/book-meeting`, en-tête `x-tool-secret: <TOOL_SECRET>`, paramètres `prospect_id` (valeur : variable dynamique `prospect_id`), `slot` et `notes` (remplis par le modèle). Sans cet outil, le créneau arrive quand même par la collecte de données à la fin de l'appel.

## API

| Route | Usage |
|---|---|
| `GET /api/prospects` | Prospects avec signaux et score |
| `GET/PATCH /api/prospects/[id]` | Fiche ; `{ stage, notes, angle, letter, voiceScript, nextCallAt }` |
| `POST /api/prospects/[id]/call` | Appel sortant ElevenLabs, `{ toNumber? }` |
| `POST /api/prospects/[id]/calls` | Journal des conversations : `{ action: 'open' \| 'close' \| 'analyze', … }` |
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
| `POST /api/invoices/[id]/call` | Appel de relance sortant, `{ toNumber? }` |
| `POST /api/invoices/[id]/calls` | Journal des appels de relance : `{ action: 'open' \| 'close' \| 'analyze', … }` |
| `POST /api/invoices/[id]/simulate` | Relance simulée, `{ outcome?: 'promesse' \| 'litige' \| 'renvoi' }` |
| `PATCH /api/invoices/[id]` | Décision : `{ action: 'paid' \| 'takeover' \| 'resume' }` ou `{ action: 'promise', promiseId, status }` |
| `POST /api/f/[token]` | Réponse du client relancé : `{ answer: 'promesse', date }`, `'litige'`, `'contact'` ou `'rappel'` |
| `GET /api/l/[token]/signed-url` | URL signée pour la page publique, jeton connu exigé |
| `GET /api/elevenlabs/signed-url` | URL signée pour le navigateur ; `?agent=relance` pour l'agent de relance |
| `POST/DELETE /api/auth` | Échange le code d'accès contre le cookie ; déconnexion |
| `POST /api/webhooks/elevenlabs` | Webhook post-appel |
| `POST /api/tools/book-meeting` | Outil appelé par l'agent |
| `POST /api/reset` | Recharge le jeu de test |

Un outil de veille alimente le pipeline en appelant `POST /api/signals` avec `Authorization: Bearer <APP_ACCESS_CODE>` ; la page `/agent` montre un exemple de corps.

## Structure

```
app/(app)/      pages internes : poste clients, facture, promesses, pipeline, signaux, prospect, letter builder, agent
app/(public)/   pages publiques /l/[token] (prospect) et /f/[token] (client relancé), sans menu
app/connexion/  saisie du code d'accès
app/api/        routes API
components/     barre latérale, console vocale, tableaux, letter builder, formulaires publics
core/           types, store (mémoire ou Upstash), factures et promesses (receivables), consignes des deux agents,
                scoring des signaux, lettre et script vocal, clients ElevenLabs, lemlist, WhatsApp, DeepSeek, accès
proxy.ts        garde d'accès par code
scripts/        sync-agents.ts
```

Le dossier n'appartient pas au workspace pnpm du dépôt : lint, typecheck et tests du monorepo ne le couvrent pas. Ses vérifications sont `pnpm typecheck` et `pnpm build` dans ce dossier.

## Limites connues

- Un code d'accès partagé, pas de comptes ni de multi-tenant : une seule agence cliente (Flexo RH, jeu de test). Les routes publiques `/l/*` et `/f/*` ne sont protégées que par leur jeton.
- Les factures viennent du jeu de test : l'import (CSV, Pennylane) et le rapprochement bancaire des promesses restent à construire ; une promesse se marque tenue ou rompue à la main.
- Le mode mémoire perd les données à chaque redémarrage ; sur Vercel, ajoutez Upstash avant d'utiliser le webhook, le QR code ou les URL audio publiques.
- lemlist et WhatsApp : les appels API suivent leur documentation actuelle mais n'ont pas été exercés avec de vrais comptes dans ce dépôt ; l'erreur renvoyée par l'API est affichée telle quelle dans le panneau.
- Les appels à froid par IA sont encadrés : information sur la nature IA dès le premier message (déjà dans le prompt, la lettre et la note vocale), respect de l'opposition, horaires B2B, conservation limitée des transcriptions. Voir la section conformité de [BRAINSTORM.md](./BRAINSTORM.md).
