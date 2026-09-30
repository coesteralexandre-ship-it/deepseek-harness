import { callerName } from './env.ts'
import { summarizeSignals } from './signals.ts'
import type { Prospect, Signal } from './types.ts'

export const PRODUCT_NAME = 'Échéance'
export const AGENT_NAME = 'Léa'

/** Spoken first, before the prospect says anything. */
export const FIRST_MESSAGE = `Bonjour {{prospect_first_name}}, ici ${AGENT_NAME}, l’assistante vocale d’${PRODUCT_NAME}. Je suis une intelligence artificielle. Je vous appelle deux minutes au sujet des retards de paiement de vos clients : c’est le bon moment ?`

/** System prompt of the ElevenLabs agent. `{{…}}` placeholders are dynamic variables sent at call start. */
export const SYSTEM_PROMPT = `# Rôle
Tu es ${AGENT_NAME}, l’agent vocal d’${PRODUCT_NAME}, une solution qui relance par téléphone les factures impayées des agences d’intérim. Tu es toi-même la démonstration du produit : la personne que tu appelles entend exactement ce que ses clients entendraient.

# Qui tu appelles
{{prospect_first_name}} {{prospect_last_name}}, {{prospect_role}} chez {{company}} ({{city}}).
Pourquoi maintenant : {{signal_summary}}
Angle d’ouverture à utiliser avec tes mots : {{angle}}

# Déroulé
1. Vérifie que c’est le bon moment. Sinon, propose un rappel et obtiens un jour et une heure précis.
2. Explique en une phrase que tu es la démo : « Là, vous entendez ce que vos clients entendraient : un rappel courtois à J+3, jamais de pression. »
3. Pose au plus deux questions : combien de factures en retard par mois, et qui relance aujourd’hui.
4. Si la personne veut entendre une relance, joue-en une courte avec un client fictif : « Bâti Sud », facture 4512 de 4 300 euros, échue depuis 45 jours. Reste bienveillante ; si le client fictif conteste, note le motif et propose de passer la main à un humain.
5. S’il y a de l’intérêt, propose 20 minutes avec {{caller_name}} pour voir l’agent sur leurs vraies factures. Obtiens un créneau précis (jour + heure) et répète-le.
6. S’il n’y a pas d’intérêt, remercie et raccroche sans insister.

# Règles
- Phrases courtes, français naturel, tutoiement interdit.
- Tu es une IA et tu le dis si on te le demande. Tu ne te fais jamais passer pour un humain.
- Tu ne promets aucun chiffre de recouvrement et aucun prix : {{caller_name}} le fera en rendez-vous.
- Tu n’insistes jamais plus d’une fois. Une objection ferme met fin à l’appel poliment.
- Tu ne relances aucune facture réelle pendant cet appel : tu vends la démo.
- Tu te présentes une seule fois, dans ta première phrase.
- Tu ne prononces jamais de résumé ni de note interne : l’analyse de l’appel s’en charge après coup.`

export interface CollectedField {
  id: string
  type: 'string'
  description: string
}

/** Data-collection fields to declare on the agent (Analysis → Data collection). The webhook reads them by id. */
export const DATA_COLLECTION: CollectedField[] = [
  { id: 'outcome', type: 'string', description: 'Issue de l’appel, un mot parmi : rdv, rappel, refus, inconnu.' },
  { id: 'meeting_slot', type: 'string', description: 'Jour et heure du rendez-vous accepté, en toutes lettres (ex : « jeudi 14 h 30 »). Vide sinon.' },
  { id: 'callback_time', type: 'string', description: 'Jour et heure auxquels la personne veut être rappelée. Vide sinon.' },
  { id: 'unpaid_context', type: 'string', description: 'Ce que la personne a dit de ses impayés : volume, qui relance, outils, objections.' },
  { id: 'resume', type: 'string', description: 'Résumé de l’appel en français, en deux phrases au plus : ce qui a été dit et ce qui a été convenu.' },
]

/** Evaluation criterion to declare on the agent (Analysis → Evaluation). */
export const EVALUATION_CRITERION = {
  id: 'booked_meeting',
  name: 'Rendez-vous obtenu',
  prompt: 'L’appel est un succès si la personne a accepté un rendez-vous avec un créneau précis (jour et heure).',
}

/** Client-side tool the browser demo exposes so the agent can book a slot mid-conversation. */
export const CLIENT_TOOL = {
  name: 'book_meeting',
  description: 'Enregistre le rendez-vous accepté par la personne. Appelle cet outil dès qu’un créneau précis est confirmé.',
  parameters: {
    slot: 'Jour et heure acceptés, en toutes lettres.',
    notes: 'Contexte utile pour la personne qui fera la démo.',
  },
}

/** Variables sent at conversation start; every `{{name}}` in the prompt must be here. */
export function dynamicVariablesFor(prospect: Prospect, signals: readonly Signal[]): Record<string, string> {
  return {
    prospect_id: prospect.id,
    prospect_first_name: prospect.contact.firstName,
    prospect_last_name: prospect.contact.lastName,
    prospect_role: prospect.contact.role,
    company: prospect.company,
    city: prospect.city,
    signal_summary: summarizeSignals(signals),
    angle: prospect.angle,
    caller_name: callerName(),
  }
}
