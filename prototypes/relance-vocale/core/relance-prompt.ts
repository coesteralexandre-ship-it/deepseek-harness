import { AGENT_NAME } from './agent-prompt.ts'
import { ANSWER_TOOL_NAME, describeAnswer } from './answer.ts'
import { parisDate } from './clock.ts'
import type { CollectedField } from './agent-prompt.ts'
import { daysSince, formatDay, formatEur } from './format.ts'
import { PLAYBOOK } from './receivables.ts'
import type { Invoice } from './types.ts'

/** Spoken first on a reminder call. The agent speaks in the creditor's name. */
export const RELANCE_FIRST_MESSAGE = `Bonjour, je suis ${AGENT_NAME}, l’assistante vocale de {{creditor}}. Je suis une intelligence artificielle. J’appelle au sujet de la facture {{invoice_number}} : je suis bien avec {{debtor_contact}} ?`

/** System prompt of the reminder agent. `{{…}}` placeholders are dynamic variables sent at call start. */
export const RELANCE_SYSTEM_PROMPT = `# Rôle
Tu es ${AGENT_NAME}, l’assistante vocale de {{creditor}}, une agence d’intérim. Tu appelles ses clients, au nom de l’agence, pour relancer une facture échue. Tu es courtoise, précise, jamais menaçante. Aujourd’hui nous sommes le {{today}} ({{today_iso}}), heure de Paris.

# La facture
Client appelé : {{debtor_company}}. Interlocuteur connu : {{debtor_contact}} ({{debtor_role}}).
Facture {{invoice_number}} de {{amount}}, pour : {{mission}}.
Échue le {{due_date}}, soit {{days_late}} jours de retard.
Étape de relance : {{step}}. Objectif de cet appel : {{goal}}
Ce que l’on sait déjà : {{history}}

# Déroulé
1. Vérifie que tu parles à la bonne personne. Sinon, demande qui s’occupe des factures fournisseurs et note son nom.
2. Donne le numéro, le montant et la date d’échéance, puis demande si la facture a bien été reçue.
3. Si elle n’a pas été reçue : propose de la renvoyer et demande l’adresse email de la comptabilité fournisseurs.
4. Si elle est reçue : demande à quelle date le règlement est prévu, et ce qui l’a retardé jusqu’ici. Obtiens une date précise et un montant. Si la personne répond « demain », « vendredi » ou « fin du mois », convertis en date exacte et redis-la (« donc jeudi 1er octobre »). Un paiement en deux fois est acceptable : note chaque date et chaque montant.
4 bis. Si la personne dit que c’est déjà payé : demande la date du virement et remercie ; dis qu’un email lui demandera l’avis de virement pour le retrouver.
5. Si la personne conteste (relevé d’heures non signé, contrat de mise à disposition, coefficient, absence refacturée) : note le motif exact et la pièce qui manque, dis qu’un membre de l’équipe de {{creditor}} la rappelle, et n’insiste plus sur le paiement.
6. Répète la date et le montant obtenus, annonce un récapitulatif par email, remercie, puis termine l’appel.

# Noter la réponse dans le dossier
Valeur de l’outil direct pour cet appel : {{outil_direct}}.
Si elle vaut « oui » : dès que la réponse du client est claire, et avant de conclure, appelle l’outil ${ANSWER_TOOL_NAME} une fois, sans l’annoncer. Rappelle-le si le client corrige une date ou un montant. Dans l’outil :
- reponse : promesse, deja_regle (seulement si le virement est déjà parti, au passé), litige, renvoi, rappel ou sans_suite ; un virement qui « part demain » est une promesse ;
- date_reglement au format AAAA-MM-JJ calculé depuis {{today_iso}} (« demain » = le lendemain de {{today_iso}}) ;
- citation : les mots exacts du client sur le paiement, en une phrase ;
- cause_retard : pourquoi ce n’est pas encore payé, selon lui ;
- bon_interlocuteur : pour un renvoi, le nom ou l’email que le client donne (attends de l’avoir avant d’appeler l’outil) ;
- rappel_le au format AAAA-MM-JJTHH:MM, heure de Paris, si le client demande un rappel.
Utilise la réponse de l’outil pour ton récapitulatif. Si elle vaut « non », n’appelle aucun outil : l’analyse de l’appel s’en charge.

# Règles
- Phrases courtes, français naturel, vouvoiement.
- Tu es une IA et tu le dis dès ta première phrase. Tu ne te fais jamais passer pour un humain.
- Jamais de menace, de pénalité, de procédure ni de contentieux. Tu ne modifies jamais de coordonnées bancaires et tu n’en communiques pas à la voix.
- Tu n’insistes jamais plus d’une fois. Si la personne demande à ne plus être appelée, tu le notes et tu raccroches poliment.
- Si on te demande un humain, tu dis que l’équipe de {{creditor}} rappelle dans la journée.
- Tu te présentes une seule fois, dans ta première phrase. Ensuite tu vas droit au sujet.
- Tu lis le numéro de facture sans prononcer les tirets.
- Tu ne prononces jamais de note interne ni le nom d’un outil.`

/** Data-collection fields of the reminder agent; the post-call analysis fills them. */
export const RELANCE_DATA_COLLECTION: CollectedField[] = [
  { id: 'relance_outcome', type: 'string', description: 'Issue de l’appel, un mot parmi : promesse, deja_regle (le client affirme avoir déjà payé), litige, renvoi, rappel, sans_suite.' },
  { id: 'promise_date', type: 'string', description: 'Date du premier règlement promis (ou du virement déjà fait), au format AAAA-MM-JJ, calculée à partir de la date du jour donnée dans le prompt. Si la date exacte manque, recopie les mots du client (« demain », « vendredi »). Vide sinon.' },
  { id: 'second_payment_date', type: 'string', description: 'Paiement en deux fois : date du second règlement, AAAA-MM-JJ calculée depuis la date du jour, ou les mots du client. Vide sinon.' },
  { id: 'second_payment_amount', type: 'string', description: 'Paiement en deux fois : montant du second règlement en euros, chiffres seulement. Vide si le client dit « le reste » ou s’il n’y a qu’un règlement.' },
  { id: 'promise_amount', type: 'string', description: 'Montant du premier règlement promis, en euros, chiffres seulement. Vide sinon.' },
  { id: 'dispute_reason', type: 'string', description: 'Motif du litige et pièce manquante, en une phrase. Vide sinon.' },
  { id: 'right_contact', type: 'string', description: 'Nom, fonction ou email de la personne à contacter à la place, si l’interlocuteur n’est pas le bon. Vide sinon.' },
  { id: 'debtor_quote', type: 'string', description: 'Les mots exacts du client sur le paiement ou le blocage, en une phrase courte. Vide si le client n’a rien dit d’utile.' },
  { id: 'delay_reason', type: 'string', description: 'Pourquoi la facture n’est pas encore payée, selon le client (validation interne, attend le paiement de son propre client, trésorerie, pièce manquante, oubli). Vide sinon.' },
  { id: 'missing_document', type: 'string', description: 'Pièce que le client attend avant de payer (relevé d’heures signé, contrat de mise à disposition, avoir). Vide sinon.' },
  { id: 'callback_time', type: 'string', description: 'Quand le client veut être rappelé : AAAA-MM-JJTHH:MM heure de Paris si possible, sinon ses mots (« demain matin »). Vide sinon.' },
  { id: 'resume', type: 'string', description: 'Résumé de l’appel en français, en deux phrases au plus : qui a répondu, ce qui a été dit, ce qui a été convenu.' },
]

export const RELANCE_EVALUATION_CRITERION = {
  id: 'got_commitment',
  name: 'Date de règlement obtenue',
  prompt: 'L’appel est un succès si le client a donné une date de règlement précise, ou si un litige a été clairement qualifié.',
}

/** Variables sent at conversation start; every `{{name}}` in the reminder prompt must be here. */
export function relanceVariablesFor(invoice: Invoice, now = new Date(), options: { liveTool?: boolean } = {}): Record<string, string> {
  const step = PLAYBOOK.find(entry => entry.kind === 'appel' && PLAYBOOK.indexOf(entry) >= invoice.playbookIndex) ?? PLAYBOOK[3]
  return {
    invoice_id: invoice.id,
    creditor: invoice.creditor.company,
    debtor_company: invoice.debtor.company,
    debtor_contact: invoice.debtor.contactName,
    debtor_role: invoice.debtor.contactRole,
    invoice_number: invoice.number,
    amount: formatEur(invoice.amountEur, true),
    mission: invoice.mission,
    due_date: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(invoice.dueDate)),
    days_late: String(daysSince(invoice.dueDate, now.getTime())),
    step: step?.label ?? 'Relance',
    goal: step?.goal ?? 'Obtenir une date de règlement',
    history: [
      invoice.calls.length === 0 ? 'Premier appel.' : `${invoice.knows}.`,
      ...invoice.promises.map(promise => `Promesse de ${formatEur(promise.amountEur)} pour le ${formatDay(promise.dueDate)} : ${promise.status}.`),
      invoice.answer !== undefined ? `Dernière réponse du client : ${describeAnswer(invoice.answer)}${invoice.answer.quote !== undefined ? ` (« ${invoice.answer.quote} »)` : ''}.` : '',
    ].filter(Boolean).join(' '),
    today: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now),
    today_iso: parisDate(now.getTime()),
    // Only a browser conversation has a page to run the answer tool; a phone call relies on the post-call analysis.
    outil_direct: options.liveTool === true ? 'oui' : 'non',
  }
}

/** Client tool declared on the reminder agent: the browser console runs it and writes the answer into the invoice live. */
export const ANSWER_TOOL = {
  type: 'client',
  name: ANSWER_TOOL_NAME,
  description: 'Uniquement si la variable outil_direct vaut « oui » ; jamais sinon, en particulier jamais au téléphone. Note dans le dossier de la facture la réponse du client (promesse, déjà réglé, litige, renvoi, rappel), avec ses mots, dès que la réponse est claire, et de nouveau si le client la corrige.',
  expects_response: true,
  // Phone calls use a separate agent without this tool (ELEVENLABS_RELANCE_PHONE_AGENT_ID).
  response_timeout_secs: 8,
  pre_tool_speech: 'auto',
  execution_mode: 'immediate',
  parameters: {
    type: 'object',
    required: ['reponse'],
    properties: {
      reponse: { type: 'string', enum: ['promesse', 'deja_regle', 'litige', 'renvoi', 'rappel', 'sans_suite'], description: 'Issue de l’échange.' },
      citation: { type: 'string', description: 'Les mots exacts du client sur le paiement ou le blocage, une phrase.' },
      cause_retard: { type: 'string', description: 'Pourquoi la facture n’est pas encore payée, selon le client.' },
      date_reglement: { type: 'string', description: 'Date du règlement promis, ou du virement déjà fait, au format AAAA-MM-JJ.' },
      montant: { type: 'number', description: 'Montant du règlement en euros, chiffres seulement. Omettre si c’est le montant total de la facture.' },
      date_second_reglement: { type: 'string', description: 'Paiement en deux fois : date du second règlement, AAAA-MM-JJ.' },
      montant_second_reglement: { type: 'number', description: 'Paiement en deux fois : montant du second règlement en euros.' },
      motif_litige: { type: 'string', description: 'Litige : motif exact.' },
      piece_manquante: { type: 'string', description: 'Litige : pièce attendue avant de payer.' },
      bon_interlocuteur: { type: 'string', description: 'Personne à qui renvoyer la facture ou à rappeler : nom, fonction, email. Obligatoire pour un renvoi dès que le client l’a donné.' },
      rappel_le: { type: 'string', description: 'Rappel demandé : AAAA-MM-JJTHH:MM, heure de Paris.' },
    },
  },
} as const
