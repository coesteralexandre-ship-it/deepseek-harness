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

Recherche du 30 septembre 2026 : la voix IA n'est plus une différence à elle seule. Finkare, Recovr, GetBill et Sidetrade (Aimie, grands comptes) la vendent déjà en français ; Monk, Stuut et Peakflo fixent l'état de l'art aux États-Unis et en Asie. Upflow, LeanPay, Clearnox, Aston AI et Pennylane restent à l'écrit, mais Upflow capte déjà promesses et litiges dans les réponses écrites. Les cabinets de recouvrement prennent 2,5 à 20 % et arrivent tard.

Ce qu'aucun acteur trouvé ne réunit : un outil propre à un métier (relevés d'heures, paie de vendredi, créances cédées au factor), la promesse orale suivie jusqu'au virement (confirmation écrite, vérification, rappel si elle est rompue), la relance précoce et courtoise de J+3 à J+20 au forfait plutôt que le recouvrement tardif à la commission, le relais humain programmé, et l'écriture dans la compta du client. La seule étude indépendante (NBER w33669, dettes de particuliers) montre que les promesses faites à une IA sont moins tenues et qu'un relais humain vers le sixième jour rattrape l'écart : la promesse vérifiée répond à ce constat.

Ce qui se défend dans le temps : les données conversationnelles sur les motifs de non-paiement et la fiabilité de chaque payeur, les intégrations aux logiciels de l'intérim, le playbook réglementaire.

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
- **Prospection B2B par agent vocal** : le point le plus risqué. L'article L34-5 du CPCE exige le consentement pour prospecter une personne physique par système automatisé (jusqu'à 375 000 €) ; la CNIL tolère le régime information et opposition entre professionnels mais ne dit rien des agents conversationnels. Voie sûre : l'appel demandé par le prospect (lettre à QR code, page publique). Appels à froid réservés aux standards d'entreprise, après avis d'avocat. L'accord préalable est obligatoire pour les consommateurs depuis le 11 août 2026 : sociétés uniquement, pas d'entrepreneurs individuels ni de mobiles personnels.
- **RGPD** : base légale de l'intérêt légitime, information à la première interaction, droit d'opposition simple (« dites stop »), conservation des transcriptions limitée (par exemple 6 mois), registre des traitements.
- **Enregistrement** : annoncer que l'échange peut être enregistré ; ne pas cloner la voix d'une personne réelle.
- **Recouvrement (produit final)** : les articles R124-1 et suivants encadrent qui recouvre pour le compte d'autrui (assurance, compte dédié, déclaration au procureur). L'agent parle donc au nom de l'agence, qui reste le créancier ; Échéance n'encaisse rien et facture au forfait, jamais à la commission. Pas de pression, pas de fausse qualité, pas de mention d'une procédure qui n'existe pas.

## 3. Outreach : la démo est le produit

### L'idée centrale

On n'envoie pas une plaquette : **Léa appelle le DAF et lui fait entendre ce que ses propres clients entendraient**. L'objection « une IA va braquer mes clients » tombe pendant l'appel lui-même. Si le DAF veut entendre une relance, Léa en joue une courte avec un client fictif.

### Séquence multicanale proposée

| Jour | Canal | Contenu |
|---|---|---|
| J0 | Appel Léa | Ouverture sur le signal (« votre post sur les clients à 90 jours… »), démo en direct, proposition de 20 minutes avec un humain |
| J0 | Email (si RDV) | Confirmation + « voici ce que Léa a noté » (résumé, promesse d'agenda) |
| J+1 | Email (si injoignable) | « Léa vous a laissé un message de 40 secondes » + lien vers la note vocale et « Parlez à Léa maintenant » (conversation dans le navigateur, préchargée avec les variables du prospect). Envoyé par lemlist avec `{{audioUrl}}` et `{{landingUrl}}` |
| J+2 | WhatsApp (si numéro professionnel) | La même note vocale en OGG, envoyée à la main depuis le lien `wa.me`, ou par l'API Cloud dans une fenêtre de 24 h ouverte par le prospect |
| J+3 | LinkedIn (humain) | Invitation + message vocal LinkedIn (le MP3 de Léa via l'extension lemlist) ou un texte court qui cite le signal, pas le produit |
| J+7 | Lettre | Une page générée depuis le signal le plus fort, un chiffre (« 78 jours de DSO contre 52 pour le secteur »), un QR code vers la page publique. Le scan devient un signal de poids 5 et rend la carte appelable. Pour les comptes à score ≥ 70 |
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

## 4. Top 10 des niches à prospecter

Critères de classement : douleur de trésorerie et marge fine, volume de petites factures récurrentes (là où une voix infatigable bat un humain), acceptabilité du téléphone chez leurs clients, signaux publics détectables, décideur joignable, friction réglementaire faible (B2B uniquement).

| # | Niche | Pourquoi ça marche | Signal à détecter | Angle d'ouverture |
|---|---|---|---|---|
| 1 | Agences d'intérim indépendantes (2–10 agences) | Paies avancées chaque semaine, DSO 50–80 j, une facture par contrat et par mois | Pappers (créances clients ↑), offres « chargé de recouvrement », posts LinkedIn sur le BFR | « Je suis l'agent qui relancerait vos clients ; vous entendez ce qu'ils entendraient » |
| 2 | Propreté et sécurité privée | Même mécanique que l'intérim (masse salariale mensuelle, grands comptes à 60 j), contrats récurrents, des milliers de PME | Pappers, marchés BOAMP gagnés (volume), avis salariés « paie en retard » | « Vos contrats sont récurrents, vos relances peuvent l'être aussi » |
| 3 | Transport routier PME et affrètement | Marge 1–3 %, gasoil payé comptant, factures par lot, DSO 45–60 j | Pappers, croissance de flotte, BODACC des chargeurs clients | « Un jour de DSO sur deux cents lots, c'est un camion de trésorerie » |
| 4 | Sous-traitants BTP second œuvre et loueurs de matériel | Situations à 60–90 j, retenues de garantie, litiges fréquents : l'agent doit escalader vite | BODACC des donneurs d'ordres, injonctions au tribunal de commerce, permis de construire | « Relancer vos situations à J+3 sans que vos conducteurs de travaux décrochent » |
| 5 | Grossistes CHR et fournisseurs de restaurants | Factures hebdomadaires nombreuses, clients fragiles, relation téléphonique naturelle | BODACC des restaurants clients, avis Google (fermetures), saisonnalité | « Vos clients sont au téléphone toute la journée ; nous aussi » |
| 6 | Cabinets d'expertise comptable | Honoraires mensuels récurrents sur des centaines de dossiers, et ils prescrivent l'outil à leurs propres clients | Recrutements « assistant(e) facturation », taille du cabinet, réseaux de l'Ordre | « Vos honoraires relancés sans y passer vos soirées, et un outil à proposer à vos clients » |
| 7 | ESN, agences digitales, portage salarial | TJM facturés mensuellement, DSO 60 j et plus, marges comprimées | LinkedIn (consultants impayés), offres « credit manager », Pappers | « Vos consultants sont payés le 5, vos clients paient le 60 » |
| 8 | Cabinets de recrutement | Factures de placement élevées, litiges de garantie, métier qui vit au téléphone | LinkedIn, offres « office manager facturation », croissance d'équipe | « Un placement impayé efface dix commissions » |
| 9 | Franchiseurs et réseaux (redevances) | Redevances mensuelles auprès de dizaines ou centaines de franchisés, relation à préserver | Croissance du réseau (presse franchise), Pappers, BODACC des franchisés | « Relancer un franchisé sans abîmer le réseau » |
| 10 | Maintenance technique récurrente (ascenseurs, CVC, sécurité incendie, télésurveillance) et coworking | Contrats récurrents, petites factures, clients syndics et PME lents à payer | Appels d'offres, Pappers, avis clients | « Des centaines de petites factures : le cas parfait pour une voix qui ne se lasse pas » |

À éviter au démarrage : tout ce qui touche des particuliers (syndics vers copropriétaires, santé, auto-écoles : encadrement B2C), les avocats (déontologie du recouvrement), les fournisseurs de la grande distribution (rapport de force, paiement imposé), la formation financée par les OPCO (payeur institutionnel que la voix ne fait pas accélérer).

Ordre d'attaque conseillé : 1 seul secteur jusqu'à dix clients (l'intérim), puis 2 et 3 qui réutilisent le même vocabulaire de paie avancée, puis 6 comme canal de prescription vers les autres.

## 5. Ce que la démo montre déjà

- Les signaux et leur poids, la qualification, le score et la température.
- Le pipeline et les règles de sortie (par l'issue de l'appel).
- L'appel navigateur avec les variables dynamiques du prospect, l'outil `book_meeting`, l'appel téléphonique sortant, le webhook post-appel qui déplace la carte.
- La lettre générée depuis le signal le plus fort avec son QR code, la page publique où le prospect parle à Léa ou se fait rappeler, et le scan qui redevient un signal.
- La note vocale de Léa en MP3 et OGG, l'export vers une campagne lemlist avec les liens en variables, l'envoi WhatsApp par lien ou par l'API Cloud.
- L'ingestion `POST /api/signals` pour brancher Clay ou n8n.

Ce qu'il reste à construire pour vendre le produit final : la lecture des factures échues (intégrations compta), la séquence J+3 / J+10 / J+20 par facture, l'écriture des promesses dans la compta, le reporting DSO, l'authentification et le multi-tenant.
