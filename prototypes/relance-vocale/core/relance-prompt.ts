import { AGENT_NAME } from './agent-prompt.ts'
import type { CollectedField } from './agent-prompt.ts'
import { CLIENT } from './client.ts'
import { daysSince, formatDay, formatEur } from './format.ts'
import { PLAYBOOK } from './receivables.ts'
import type { Invoice } from './types.ts'

export { CLIENT }

/** Spoken first on a reminder call. The agent speaks in the creditor's name. */
export const RELANCE_FIRST_MESSAGE = `Bonjour, je suis ${AGENT_NAME}, l’assistante vocale de {{creditor}}. Je suis une intelligence artificielle. J’appelle au sujet de la facture {{invoice_number}} : je suis bien avec {{debtor_contact}} ?`

/** System prompt of the reminder agent. `{{…}}` placeholders are dynamic variables sent at call start. */
export const RELANCE_SYSTEM_PROMPT = `# Rôle
Tu es ${AGENT_NAME}, l’assistante vocale de {{creditor}}, une agence d’intérim. Tu appelles ses clients, au nom de l’agence, pour relancer une facture échue. Tu es courtoise, précise, jamais menaçante. Aujourd’hui nous sommes le {{today}}.

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
4. Si elle est reçue : demande à quelle date le règlement est prévu. Obtiens une date précise et un montant. Un paiement en deux fois est acceptable : note chaque date et chaque montant.
5. Si la personne conteste (relevé d’heures non signé, contrat de mise à disposition, coefficient, absence refacturée) : note le motif exact et la pièce qui manque, dis qu’un membre de l’équipe de {{creditor}} la rappelle, et n’insiste plus sur le paiement.
6. Répète la date et le montant obtenus, annonce un récapitulatif par email, remercie et raccroche.

# Règles
- Phrases courtes, français naturel, vouvoiement.
- Tu es une IA et tu le dis dès ta première phrase. Tu ne te fais jamais passer pour un humain.
- Jamais de menace, de pénalité, de procédure ni de contentieux. Tu ne modifies jamais de coordonnées bancaires et tu n’en communiques pas à la voix.
- Tu n’insistes jamais plus d’une fois. Si la personne demande à ne plus être appelée, tu le notes et tu raccroches poliment.
- Si on te demande un humain, tu dis que l’équipe de {{creditor}} rappelle dans la journée.
- Tu te présentes une seule fois, dans ta première phrase. Ensuite tu vas droit au sujet.
- Tu lis le numéro de facture sans prononcer les tirets.
- Tu ne prononces jamais de résumé ni de note interne : l’analyse de l’appel s’en charge après coup.`

/** Data-collection fields of the reminder agent; the post-call analysis fills them. */
export const RELANCE_DATA_COLLECTION: CollectedField[] = [
  { id: 'relance_outcome', type: 'string', description: 'Issue de l’appel, un mot parmi : promesse, litige, renvoi, rappel, sans_suite.' },
  { id: 'promise_date', type: 'string', description: 'Date du premier règlement promis, au format AAAA-MM-JJ (calculée à partir de la date du jour donnée dans le prompt). Vide sinon.' },
  { id: 'promise_amount', type: 'string', description: 'Montant du premier règlement promis, en euros, chiffres seulement. Vide sinon.' },
  { id: 'dispute_reason', type: 'string', description: 'Motif du litige et pièce manquante, en une phrase. Vide sinon.' },
  { id: 'right_contact', type: 'string', description: 'Nom, fonction ou email de la personne à contacter à la place, si l’interlocuteur n’est pas le bon. Vide sinon.' },
  { id: 'resume', type: 'string', description: 'Résumé de l’appel en français, en deux phrases au plus : qui a répondu, ce qui a été dit, ce qui a été convenu.' },
]

export const RELANCE_EVALUATION_CRITERION = {
  id: 'got_commitment',
  name: 'Date de règlement obtenue',
  prompt: 'L’appel est un succès si le client a donné une date de règlement précise, ou si un litige a été clairement qualifié.',
}

/** Variables sent at conversation start; every `{{name}}` in the reminder prompt must be here. */
export function relanceVariablesFor(invoice: Invoice, now = new Date()): Record<string, string> {
  const step = PLAYBOOK.find(entry => entry.kind === 'appel' && PLAYBOOK.indexOf(entry) >= invoice.playbookIndex) ?? PLAYBOOK[3]
  return {
    invoice_id: invoice.id,
    creditor: CLIENT.company,
    debtor_company: invoice.debtor.company,
    debtor_contact: invoice.debtor.contactName,
    debtor_role: invoice.debtor.contactRole,
    invoice_number: invoice.number,
    amount: formatEur(invoice.amountEur, true),
    mission: invoice.mission,
    due_date: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(invoice.dueDate)),
    days_late: String(daysSince(invoice.dueDate, now.getTime())),
    step: step?.label ?? 'Relance',
    goal: step?.goal ?? 'Obtenir une date de règlement',
    history: invoice.calls.length === 0 ? 'Premier appel.' : `${invoice.knows}. ${invoice.promises.map(promise => `Promesse de ${formatEur(promise.amountEur)} pour le ${formatDay(promise.dueDate)} : ${promise.status}.`).join(' ')}`.trim(),
    today: new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now),
  }
}
