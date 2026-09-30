# Brainstorm — relance vocale pour agences d'intérim

Nom de travail : **Échéance** (à remplacer). Agent : **Léa**. Cible de lancement : agences d'intérim indépendantes ou régionales, 2 à 10 agences, 100 à 600 intérimaires par mois.

## 1. Le produit qu'on vend

### La douleur, en une phrase

Une agence d'intérim avance les paies chaque semaine et se fait payer à 45–75 jours. Sa marge nette est de 2 à 4 % : un impayé de 10 k€ demande 300 k€ de chiffre d'affaires pour être compensé. Le DAF le sait, mais relancer au téléphone est fastidieux, mal outillé, et personne n'aime le faire.

### La promesse

« Vos factures échues sont relancées par téléphone à J+3, J+10 et J+20, poliment, tous les jours ouvrés, et chaque promesse de règlement atterrit dans votre compta. »

### Ce que fait l'agent (produit final, au-delà de la démo)

1. **Lit les factures échues** : Sage, Pennylane, Cegid, ou export CSV au début.
2. **Déroule une séquence** :
   - J+3 : appel courtois de confirmation (« la facture est bien reçue ? le bon interlocuteur ? »). Beaucoup d'impayés sont des factures perdues.
   - J+10 : appel de planification : obtenir une **date et un montant** de règlement (la promesse).
   - J+20 : appel ferme mais neutre + email récapitulatif.
   - J+30 : passage à un humain (mise en demeure, cabinet). L'agent ne menace jamais.
3. **Capture pendant la conversation** : promesse (date, montant), litige (motif, pièce manquante, relevé d'heures contesté), bon interlocuteur (comptabilité fournisseurs du client), coordonnées à jour.
4. **Écrit dans les outils** : statut et prochaine action dans la compta ou le CRM, alerte Slack ou email pour les litiges, invitation calendrier pour les promesses.
5. **Reporte** : DSO, cash récupéré, taux de promesses tenues, clients à risque, motifs de litige les plus fréquents.

### Ce qu'il ne fait pas, par choix

- Pas de menace, pas de contentieux, pas de particuliers (B2B uniquement).
- Jamais plus de trois appels par facture et par mois ; un seul interlocuteur relancé à la fois par entreprise.
- Il passe la main à un humain dès qu'un litige est exprimé ou qu'on le lui demande.

### Pourquoi l'intérim d'abord

- Beaucoup de petites factures récurrentes (une par contrat et par mois) : idéal pour l'automatisation, mauvais pour un cabinet de recouvrement au forfait.
- Vocabulaire spécifique que l'agent peut maîtriser : relevés d'heures, contrats de mise à disposition, coefficient, refacturation des absences.
- Un signal externe fort : les comptes déposés montrent les créances clients ; les offres d'emploi « chargé de recouvrement » disent que ça déborde.
- Écosystème repérable : fédérations, experts-comptables spécialisés, éditeurs de paie intérim.

### Concurrence et différence

Sidetrade, Upflow, Kolleno, LeanPay font l'écrit (email, courrier, portail) et le tableau de bord. Les cabinets de recouvrement prennent 10 à 20 % et cassent la relation client. Nous faisons la **voix et la conversation** : on détecte le litige en direct, on obtient une date, on parle le vocabulaire de l'intérim, et on écrit dans leur outil au lieu de le remplacer.

Ce qui se défend dans le temps : les données conversationnelles sur les motifs de non-paiement (scoring de risque par client), les intégrations, le playbook réglementaire.

### Prix (à tester)

| Option | Principe | Avantage | Risque |
|---|---|---|---|
| A. Abonnement | 290 €/mois/agence + 1,50 € par facture relancée | Simple, prévisible | Le client compare au coût d'un stagiaire |
| B. Au succès | 1,5 % du cash encaissé sur factures > 30 jours de retard | Aligné, vente facile | Attribution contestable, trésorerie irrégulière |
| C. Hybride | 1 500 € de mise en place + 0,5 % encaissé | Engage le client | Deux discussions au lieu d'une |

Recommandation : A, avec une garantie « DSO − 10 jours en 90 jours ou remboursé », et un pilote gratuit de 30 jours sur 50 factures pour prouver le chiffre.

## 2. Orchestration : signal → pipeline → appel

### Les signaux

| Signal | Source et détection | Poids |
|---|---|---|
| Post ou commentaire du dirigeant / DAF sur les impayés, le BFR, l'affacturage, « client qui paie à 90 jours » | LinkedIn (recherche par mots-clés + liste de comptes surveillés, via Clay, PhantomBuster ou un scraper) | 5 (post), 3 (commentaire ou réaction) |
| Offre d'emploi « chargé de recouvrement », « credit manager », « comptable clients » | Indeed, WTTJ, APEC, page carrières | 4 |
| Créances clients en hausse, DSO estimé au-dessus du secteur, trésorerie en baisse | Pappers / Infogreffe : comptes annuels, calcul DSO = créances / CA × 365 | 4 |
| Injonctions de payer ou assignations déposées par l'agence | Tribunal de commerce, Infogreffe : preuve de première main qu'elle poursuit déjà | 5 |
| Un client de l'agence entre en sauvegarde ou redressement | BODACC (croiser avec les références clients affichées sur le site de l'agence) | 3 |
| Avis d'intérimaires citant des paies en retard | Google, Indeed, Glassdoor | 2 |
| Croissance rapide : ouverture d'agences, levée de fonds | Presse régionale, LinkedIn | 3 |
| Changement de DAF ou de responsable administratif | LinkedIn (nouveau poste) : un nouvel arrivant veut des victoires rapides | 3 |
| Inbound : guide DSO téléchargé, webinaire, calculateur « combien coûte un jour de DSO » | Site, formulaire | 4 |
| Recommandation d'un client ou d'un partenaire | Manuel | 5 |

### Score et température

Score = somme des poids × 20 × fraîcheur (1 sous 7 jours, 0,7 sous 30 jours, 0,4 au-delà), plafonné à 100. Chaud ≥ 70, tiède ≥ 40, froid en dessous. Les signaux ignorés ne comptent pas. La démo implémente exactement ce calcul (`core/signals.ts`).

### Le pipeline et ses règles

| Étape | Entrée | Règle de sortie |
|---|---|---|
| Nouveau | Un signal est arrivé | Qualification humaine sous 24 h (ou automatique si score ≥ 70 et téléphone connu) |
| À appeler | Signal qualifié, angle d'ouverture généré | Appel dans les 48 h, du mardi au jeudi, 9 h 30–12 h ou 14 h–17 h 30 |
| Appel en cours | L'agent est en ligne | Le webhook post-appel décide de la suite |
| À rappeler | Le prospect a demandé un créneau | Rappel automatique au créneau ; trois tentatives max sur dix jours, puis retour en « À appeler » avec un autre angle |
| RDV pris | Créneau confirmé | Invitation Cal.com, email de confirmation, brief pour la démo humaine (signaux, transcription, objections) |
| Pas intéressé | Refus ou injoignable après trois tentatives | Recyclage à 90 jours, ou immédiat si un nouveau signal de poids 5 arrive |

Autres règles : pas de message sur répondeur au premier essai (un message court au deuxième) ; un seul interlocuteur par entreprise à la fois ; arrêt immédiat sur opposition et inscription sur une liste interne ; plafond de volume quotidien pour garder une voix « rare » ; A/B test des angles d'ouverture par source de signal.

### La stack telle que la démo la préfigure

```
Clay / n8n / scraper  ──POST /api/signals──▶  Pipeline (Next.js + Upstash)
                                                   │ qualification, score, angle
                                                   ▼
                                   ElevenLabs Conversational AI ◀── variables dynamiques
                                   (Twilio / SIP pour le téléphone,   (prénom, société, signal, angle)
                                    WebSocket pour le navigateur)
                                                   │ webhook post-appel : issue, résumé, transcription
                                                   ▼
                                   Pipeline ──▶ Cal.com (RDV) · Slack (alertes) · CRM
```

### Conformité (à faire relire par un juriste)

- **Nature IA** : l'agent dit qu'il est une IA dans sa première phrase et le répète si on lui demande (obligation de transparence, AI Act art. 50 ; et c'est ce qui rend la démo honnête).
- **Prospection B2B** : le démarchage téléphonique B2B est autorisé en France ; Bloctel concerne les consommateurs. Respecter l'opposition, ne pas appeler les lignes personnelles des salariés, préférer le standard ou la ligne professionnelle.
- **RGPD** : base légale de l'intérêt légitime, information à la première interaction, droit d'opposition simple (« dites stop »), conservation des transcriptions limitée (par exemple 6 mois), registre des traitements.
- **Enregistrement** : annoncer que l'échange peut être enregistré ; ne pas cloner la voix d'une personne réelle.
- **Recouvrement (produit final)** : le recouvrement amiable B2B n'exige pas d'agrément, mais pas de pression, pas de fausse qualité, pas de mention d'une procédure qui n'existe pas.

## 3. Outreach : la démo est le produit

### L'idée centrale

On n'envoie pas une plaquette : **Léa appelle le DAF et lui fait entendre ce que ses propres clients entendraient**. L'objection « une IA va braquer mes clients » tombe pendant l'appel lui-même. Si le DAF veut entendre une relance, Léa en joue une courte avec un client fictif.

### Séquence multicanale proposée

| Jour | Canal | Contenu |
|---|---|---|
| J0 | Appel Léa | Ouverture sur le signal (« votre post sur les clients à 90 jours… »), démo en direct, proposition de 20 minutes avec un humain |
| J0 | Email (si RDV) | Confirmation + « voici ce que Léa a noté » (résumé, promesse d'agenda) |
| J+1 | Email (si injoignable) | « Léa a essayé de vous joindre » + lien « Parlez à Léa maintenant » (conversation dans le navigateur, préchargée avec les variables du prospect) |
| J+3 | LinkedIn (humain) | Invitation + un message court qui cite le signal, pas le produit |
| J+7 | Lettre | Une page, un chiffre (« 78 jours de DSO contre 52 pour le secteur »), un QR code vers la conversation Léa. Optionnel, pour les comptes à score ≥ 70 |
| J+10 | Appel Léa | Deuxième tentative, autre angle (offre d'emploi plutôt que post LinkedIn) |
| J+30 | Email | Étude de cas d'un confrère, puis silence jusqu'au prochain signal |

### Idées d'acquisition au-delà de la séquence

1. **Reverse demo** : une page « Faites-vous appeler par Léa » où l'on entre son numéro et l'agent appelle dans les 30 secondes. À pousser dans les posts LinkedIn et sur le stand des salons RH.
2. **Baromètre des délais de paiement dans l'intérim** : une étude annuelle calculée depuis les comptes publiés (Pappers), relayée par la presse spécialisée. Chaque agence citée devient un prospect qui a une raison de répondre.
3. **Calculateur « un jour de DSO vous coûte X € »** : formulaire à trois champs, résultat par email, signal inbound de poids 4.
4. **Recommandation systématique** : à la fin de chaque démo humaine, demander un confrère (« qui a le même problème que vous ? »). Le signal « recommandation » vaut 5.
5. **Partenaires prescripteurs** : experts-comptables spécialisés intérim, éditeurs de paie intérim (marketplaces), factors et assureurs-crédit (moins de sinistres si les clients sont relancés tôt), fédérations professionnelles.
6. **Contenu vocal** : publier des extraits (avec accord) d'appels de relance réussis ; rien ne vend une voix comme l'entendre.

### Messages par interlocuteur

| Persona | Ce qu'il entend | Ce qu'il craint |
|---|---|---|
| DAF / credit manager | DSO, cash, promesses tenues, moins de relances fastidieuses | Le ton avec les grands comptes, l'intégration avec la compta |
| Dirigeant | Marge protégée, moins de temps au téléphone, sérénité le vendredi (jour de paie) | Le prix, l'image auprès des clients |
| Comptable clients | L'agent absorbe la relance, il garde le lettrage et les litiges | Être remplacé (répondre : l'agent lui apporte les litiges qualifiés) |

### Objections attendues

- « Une IA va braquer mes clients » → écoutez, c'est ce que vous entendez maintenant ; ton réglable ; passage à un humain sur litige.
- « On a déjà un cabinet » → le cabinet intervient à J+60 et prend 15 % ; nous à J+3 pour une fraction, et le cabinet garde le contentieux.
- « Nos clients paient quand ils veulent » → justement : une date obtenue au téléphone est tenue deux fois plus souvent qu'une relance email (chiffre à valider sur le pilote).
- « Et le RGPD ? » → nature IA annoncée, opposition en un mot, B2B uniquement, conservation limitée.

### Ordres de grandeur à mesurer sur le premier lot (hypothèses, pas des chiffres acquis)

Taux de décroché 25–35 %, conversation de plus de 60 secondes sur 50 % des décrochés, rendez-vous sur 15–25 % des conversations, présence au rendez-vous 70 %, signature 20–30 %. Soit environ un client pour 40 à 60 appels. À comparer avec la séquence email actuelle dès les 100 premiers appels.

## 4. Ce que la démo montre déjà

- Les signaux et leur poids, la qualification, le score et la température.
- Le pipeline et les règles de sortie (par l'issue de l'appel).
- L'appel navigateur avec les variables dynamiques du prospect, l'outil `book_meeting`, l'appel téléphonique sortant, le webhook post-appel qui déplace la carte.
- L'ingestion `POST /api/signals` pour brancher Clay ou n8n.

Ce qu'il reste à construire pour vendre le produit final : la lecture des factures échues (intégrations compta), la séquence J+3 / J+10 / J+20 par facture, l'écriture des promesses dans la compta, le reporting DSO, l'authentification et le multi-tenant.
