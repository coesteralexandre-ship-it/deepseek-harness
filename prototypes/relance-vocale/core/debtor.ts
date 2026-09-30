import { DAY_MS } from './clock.ts'
import { formatDay, formatEur } from './format.ts'
import { newId } from './ids.ts'
import { addDraft, logActivity } from './receivables.ts'
import type { Invoice } from './types.ts'

export type DebtorAnswer =
  | { answer: 'promesse'; date: string }
  | { answer: 'confirmer'; promiseId: string }
  | { answer: 'litige'; reason: string }
  | { answer: 'contact'; contact: string }
  | { answer: 'rappel'; when: string }

const VISIT_TITLE = 'A ouvert le lien de réponse'

/** Log the debtor opening the answer page, at most once a day. */
export function recordVisit(invoice: Invoice, now: number): Invoice {
  const recent = invoice.activities.some(activity => activity.title === VISIT_TITLE && now - Date.parse(activity.at) < DAY_MS)
  return recent ? invoice : logActivity(invoice, { kind: 'client', actor: 'client', title: VISIT_TITLE }, now)
}

/** Apply the debtor's answer from the public page and move the invoice. */
export function applyDebtorAnswer(invoice: Invoice, answer: DebtorAnswer, now: number): Invoice {
  const iso = new Date(now).toISOString()
  switch (answer.answer) {
    case 'promesse': {
      const promise = { id: newId('pr'), amountEur: invoice.amountEur, dueDate: answer.date, status: 'attendue' as const, confirmedAt: iso }
      // A new date replaces the one still pending instead of counting it as broken.
      const kept = invoice.promises.filter(entry => entry.status !== 'attendue')
      const next = { ...invoice, status: 'promesse' as const, followUpAt: undefined, promises: [...kept, promise], knows: `${formatEur(invoice.amountEur)} promis pour le ${formatDay(answer.date)}, confirmé par écrit` }
      return logActivity(next, { kind: 'promesse', actor: 'client', title: `Date donnée en ligne : ${formatDay(answer.date)}`, detail: 'Promesse confirmée par écrit, sans appel.' }, now)
    }
    case 'confirmer': {
      const promises = invoice.promises.map(entry => (entry.id === answer.promiseId ? { ...entry, confirmedAt: iso } : entry))
      return logActivity({ ...invoice, promises }, { kind: 'promesse', actor: 'client', title: 'Promesse confirmée par écrit' }, now)
    }
    case 'litige': {
      const next = logActivity({ ...invoice, status: 'litige', disputeReason: answer.reason, knows: answer.reason, followUpAt: undefined }, { kind: 'litige', actor: 'client', title: 'Litige signalé en ligne', detail: answer.reason }, now)
      return addDraft(next, 'litige', now)
    }
    case 'contact': {
      const next = logActivity({ ...invoice, status: 'a_relancer', knows: `Bon interlocuteur : ${answer.contact}` }, { kind: 'client', actor: 'client', title: 'Bon interlocuteur indiqué', detail: answer.contact }, now)
      return addDraft(next, 'renvoi', now)
    }
    default: {
      const tomorrow = new Date(now + DAY_MS)
      tomorrow.setHours(10, 0, 0, 0)
      return logActivity({ ...invoice, status: 'appel', followUpAt: tomorrow.toISOString(), knows: `Rappel demandé : ${answer.when}` }, { kind: 'client', actor: 'client', title: 'Rappel demandé en ligne', detail: answer.when }, now)
    }
  }
}
