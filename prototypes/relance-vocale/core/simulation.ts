import { AGENT_NAME } from './agent-prompt.ts'
import { parisDate, parisShiftDays, parisWeekday } from './clock.ts'
import { formatEur } from './format.ts'
import type { RelanceResult } from './receivables.ts'
import type { Invoice, RelanceOutcome, TranscriptTurn } from './types.ts'

/** ISO date `days` after `now`, moved to Monday when it falls at the weekend: nobody pays on a Sunday. */
function isoDay(now: number, days: number): string {
  const date = parisShiftDays(now, days)
  const day = parisWeekday(date)
  return parisDate(day === 6 ? parisShiftDays(date, 2) : day === 0 ? parisShiftDays(date, 1) : date)
}

function opening(invoice: Invoice): TranscriptTurn[] {
  return [
    { role: 'agent', text: `Bonjour, je suis ${AGENT_NAME}, l’assistante vocale de ${invoice.creditor.company}. Je suis une intelligence artificielle. J’appelle au sujet de la facture ${invoice.number} : je suis bien avec ${invoice.debtor.contactName} ?` },
    { role: 'user', text: 'Oui, c’est moi.' },
    { role: 'agent', text: `Il s’agit de ${formatEur(invoice.amountEur, true)} pour ${invoice.mission}. La facture vous est bien parvenue ?` },
  ]
}

/** A finished call with its transcript, as the agent would log it. Only the demo and the Simulation tab use it. */
export function simulatedCall(invoice: Invoice, outcome: RelanceOutcome, now: number, promiseInDays = 4): Omit<RelanceResult, 'callId' | 'conversationId'> {
  const contact = invoice.debtor.contactName
  switch (outcome) {
    case 'promesse':
      return {
        mode: 'simulation',
        outcome,
        transcript: [
          ...opening(invoice),
          { role: 'user', text: 'Oui, elle est validée. Elle part dans notre prochaine campagne de virements.' },
          { role: 'agent', text: `Parfait. Je note ${formatEur(invoice.amountEur)} dans ${promiseInDays} jours, et je vous envoie le récapitulatif par email. Bonne journée.` },
        ],
        summary: `${contact} confirme que la facture est validée et la passe dans la prochaine campagne de virements.`,
        promiseAmountEur: invoice.amountEur,
        promiseDate: isoDay(now, promiseInDays),
        quote: 'Elle est validée, elle part dans notre prochaine campagne de virements.',
        delayReason: 'Validation interne terminée, virements groupés',
      }
    case 'deja_regle':
      return {
        mode: 'simulation',
        outcome,
        transcript: [
          ...opening(invoice),
          { role: 'user', text: 'Elle est déjà payée, le virement est parti lundi dernier.' },
          { role: 'agent', text: 'Merci. Je ne le vois pas encore de notre côté : pouvez-vous nous transmettre l’avis de virement ? Je vous envoie un email pour ça. Bonne journée.' },
        ],
        summary: `${contact} affirme que le virement est parti lundi dernier ; avis de virement demandé pour le rapprocher.`,
        promiseAmountEur: invoice.amountEur,
        promiseDate: isoDay(now, -((parisWeekday(now) + 6) % 7 || 7)),
        quote: 'Elle est déjà payée, le virement est parti lundi dernier.',
      }
    case 'litige':
      return {
        mode: 'simulation',
        outcome,
        transcript: [
          ...opening(invoice),
          { role: 'user', text: 'On l’a, mais le relevé d’heures de la dernière semaine n’est pas signé par notre chef d’équipe. Je ne peux pas la valider.' },
          { role: 'agent', text: `C’est noté. Je préviens l’équipe de ${invoice.creditor.company} : elle vous envoie le relevé signé aujourd’hui. Merci, bonne journée.` },
        ],
        summary: `${contact} bloque la facture tant que le relevé d’heures de la dernière semaine n’est pas signé.`,
        disputeReason: 'Relevé d’heures de la dernière semaine non signé par le chef d’équipe.',
        missingDocument: 'Relevé d’heures signé',
        quote: 'Le relevé d’heures de la dernière semaine n’est pas signé, je ne peux pas la valider.',
      }
    case 'renvoi':
      return {
        mode: 'simulation',
        outcome,
        transcript: [
          ...opening(invoice),
          { role: 'user', text: 'Je ne la vois pas. Envoyez-la à la comptabilité fournisseurs, c’est elle qui paie.' },
          { role: 'agent', text: 'Bien sûr. Je la renvoie aujourd’hui à la comptabilité fournisseurs et je reviens vers vous dans trois jours. Merci.' },
        ],
        summary: 'La facture n’était pas arrivée chez la bonne personne. À renvoyer à la comptabilité fournisseurs.',
        rightContact: 'la comptabilité fournisseurs',
      }
    case 'rappel':
      return {
        mode: 'simulation',
        outcome,
        transcript: [
          { role: 'agent', text: `Bonjour, je suis ${AGENT_NAME}, l’assistante vocale de ${invoice.creditor.company}. Je suis une intelligence artificielle. J’appelle au sujet de la facture ${invoice.number}.` },
          { role: 'user', text: 'Je suis en réunion, rappelez-moi demain matin.' },
          { role: 'agent', text: 'Bien sûr, je vous rappelle demain matin. Bonne réunion.' },
        ],
        summary: `${contact} était en réunion et demande un rappel demain matin.`,
        quote: 'Je suis en réunion, rappelez-moi demain matin.',
        callbackAt: 'demain matin',
      }
    default:
      return {
        mode: 'simulation',
        outcome: 'sans_suite',
        transcript: [
          { role: 'agent', text: `Bonjour, ici ${AGENT_NAME}, l’assistante vocale de ${invoice.creditor.company}. Je suis une intelligence artificielle et j’appelais au sujet de la facture ${invoice.number}. Je vous envoie un lien pour nous répondre en une minute. Bonne journée.` },
        ],
        summary: 'Répondeur. Message laissé et lien de réponse envoyé.',
      }
  }
}

/** What a debtor of this profile answers to the reminder call number `attempt` (0 for the first). */
export function demoCallOutcome(invoice: Invoice, attempt: number): { outcome: RelanceOutcome; promiseInDays: number } {
  const broken = invoice.promises.filter(promise => promise.status === 'rompue').length
  switch (invoice.profile) {
    case 'fiable':
      return { outcome: 'promesse', promiseInDays: 3 }
    case 'lent':
      return { outcome: attempt === 0 ? 'sans_suite' : 'promesse', promiseInDays: 5 }
    case 'mauvais':
      return { outcome: 'promesse', promiseInDays: broken === 0 ? 2 : 3 }
    case 'litige':
      return { outcome: 'litige', promiseInDays: 0 }
    case 'renvoi':
      return { outcome: invoice.calls.some(call => call.outcome === 'renvoi') ? 'promesse' : 'renvoi', promiseInDays: 4 }
    default:
      return { outcome: attempt === 1 ? 'rappel' : 'sans_suite', promiseInDays: 0 }
  }
}

/** Whether a debtor of this profile pays on the promised date. */
export function demoPays(invoice: Invoice): boolean {
  return invoice.profile === 'fiable' || invoice.profile === 'lent' || invoice.profile === 'renvoi'
}
