# Échéance, relance vocale des factures et sa prospection

Application Next.js 16 déployée sur Vercel, direction artistique Pigment, en deux espaces.

**Relance** : le pipeline d'une agence d'intérim, sept colonnes (À relancer, Email envoyé, Appel, Promesse, Litige, À vous, Encaissé). Chaque facture échue suit une séquence (email J+1, appel de Léa J+3, email J+7, appels J+10 et J+20, humain J+30, rien le week-end) et change de colonne toute seule : une date obtenue, un litige, une réponse du client ou un virement la font avancer. Les factures arrivent par import de la balance âgée ; les virements, par rapprochement du relevé bancaire.

**Prospection** : des signaux d'impayés (dont un radar sur les comptes publics des agences) qualifient des agences, un pipeline les fait avancer, et l'agent les appelle en se présentant comme la démo du produit, avec une lettre imprimable à QR code, une page publique et une note vocale. L'étude de marché et le positionnement sont dans [BRAINSTORM.md](./BRAINSTORM.md).

## Les écrans

| Page | Rôle |
|---|---|
| `/` | Pipeline de relance : cockpit (horloge, mode Démo/Réel, +1 jour, Rejouer 14 jours, agenda des 7 jours), indicateurs, tableau à 7 colonnes animé, journal en direct. Glisser une carte la déplace. |
| `/factures/[id]` | Fiche facture : prochaine action (avec « lancer maintenant »), ce que Léa sait, studio d'emails, promesses, journal, appels avec transcription, console vocale (navigateur, téléphone, simulation), page de réponse du client, décisions. |
| `/promesses` | Promis, reçu et paie hebdomadaire sur cinq semaines, toutes les promesses, fiabilité de chaque payeur. |
| `/journal` | Tout ce qui s'est passé, par jour, filtrable par acteur (Léa, Autopilote, Clients, Vous). |
| `/automatisations` | La séquence, les règles de passage d'une colonne à l'autre, le mode de l'autopilote, les garde-fous. |
| `/importer` | Import de la balance âgée : collage depuis Excel ou fichier CSV (UTF-8 ou Windows-1252), colonnes reconnues automatiquement et modifiables, aperçu, lignes écartées avec leur motif, doublons ignorés. |
| `/rapprochement` | Collage du relevé bancaire : chaque crédit est rapproché d'une facture ou d'une promesse (numéro de facture, nom du client, montant) ; les rapprochements sûrs sont cochés, rien ne s'applique sans validation. Un acompte réduit le reste dû. |
| `/reglages` | L'agence : nom, ville, signature des emails, paie hebdomadaire. Enregistrer met ce nom sur toutes les factures ouvertes. |
| `/f/[token]` | Page publique du client relancé : date de paiement, litige, bon interlocuteur, rappel, ou confirmation d'une promesse d'un clic. |
| `/pipeline`, `/signaux`, `/prospects/[id]`, `/prospects/[id]/lettre`, `/l/[token]` | Prospection : pipeline des agences, signaux avec le radar open data, fiche, letter builder, page publique du prospect. |
| `/agent` | Les deux agents (relance, prospection), leurs consignes, l'état de chaque branchement. |
| `/connexion` | Saisie du code d'accès quand `APP_ACCESS_CODE` est défini. |

## Radar open data

Sur `/signaux`, « Balayer » interroge l'[API Recherche d'entreprises](https://recherche-entreprises.api.gouv.fr) (agences d'intérim NAF 78.20Z, catégorie PME, siège dans le département) puis les [ratios INPI](https://data.economie.gouv.fr/explore/dataset/ratios_inpi_bce/) (crédit clients en jours) par lots de 40 SIREN. Seuls comptent les comptes des trois derniers exercices et les délais entre 10 et 200 jours. Les agences au-dessus du seuil entrent dans le pipeline avec un signal « Comptes publiés » et un angle d'ouverture chiffré (leur délai contre la médiane de l'échantillon) ; une seule société par réseau de franchise. Gratuit, sans clé ; l'annuaire ne publie pas de téléphone.

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

- retrouve la facture ou le prospect par l'identifiant de conversation d'un appel que l'app a elle-même ouvert (les variables dynamiques seules ne suffisent pas : le navigateur les contrôle) ;
- pour une relance, lit `relance_outcome`, `promise_date`, `promise_amount`, `dispute_reason`, `right_contact` ; pour un prospect, `outcome` (`rdv`, `rappel`, `refus`) ou, à défaut, le critère `booked_meeting` ;
- enregistre résumé, créneau, transcription, et déplace la carte.

En production, sans secret configuré, le webhook répond 503. En développement, il est accepté sans vérification. Il est facultatif tant qu'une page reste ouverte : la console vocale relit la même analyse par `GET /v1/convai/conversations/{id}`.

### 5. Outil serveur « prise de rendez-vous » (optionnel)

Pour que l'agent enregistre le RDV pendant un appel téléphonique : Agent → Tools → Webhook, `POST https://<votre-app>/api/tools/book-meeting`, en-tête `x-tool-secret: <TOOL_SECRET>`, paramètres `conversation_id` (valeur : variable système `system__conversation_id`, qui désigne l'appel ouvert par l'app), `prospect_id` (variable dynamique `prospect_id`), `slot` et `notes` (remplis par le modèle). En production, `TOOL_SECRET` est obligatoire. Sans cet outil, le créneau arrive quand même par la collecte de données à la fin de l'appel.

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
| `POST /api/f/[token]` | Réponse du client relancé : `{ answer: 'promesse', date }`, `'confirmer'`, `'litige'`, `'contact'` ou `'rappel'` |
| `GET/POST /api/autopilot` | Vue du tableau ; `{ action: 'advance', days }` avance l'horloge et fait agir l'autopilote, `{ action: 'mode', autopilot }` |
| `GET /api/cron/autopilot` | Tâche du matin, `Authorization: Bearer <CRON_SECRET>` |
| `POST /api/invoices/[id]/emails`, `PATCH` | Préparer un brouillon `{ kind }` ; enregistrer, réécrire, supprimer ou marquer envoyé |
| `POST /api/invoices/import` | Import de lignes déjà lues `{ rows }` |
| `POST /api/reconcile` | `{ action: 'analyze', text }` puis `{ action: 'apply', items }` |
| `POST /api/radar` | `{ departement, minDsoDays, maxCompanies }` |
| `GET/PATCH /api/settings` | Réglages de l'agence |
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
- Import et rapprochement passent par un collage ou un fichier CSV : pas encore de connexion directe à Pennylane, Sage ou à la banque (voir BRAINSTORM, section outillage : API Pennylane puis Chift).
- Le mode mémoire perd les données à chaque redémarrage ; sur Vercel, ajoutez Upstash avant d'utiliser le webhook, le QR code ou les URL audio publiques.
- lemlist et WhatsApp : les appels API suivent leur documentation actuelle mais n'ont pas été exercés avec de vrais comptes dans ce dépôt ; l'erreur renvoyée par l'API est affichée telle quelle dans le panneau.
- Les appels à froid par IA sont encadrés : information sur la nature IA dès le premier message (déjà dans le prompt, la lettre et la note vocale), respect de l'opposition, horaires B2B, conservation limitée des transcriptions. Voir la section conformité de [BRAINSTORM.md](./BRAINSTORM.md).
