import { DAY_MS, parisDayAt } from './clock.ts'
import { formatDay, formatEur } from './format.ts'
import { newId } from './ids.ts'
import { addDraft, logActivity } from './receivables.ts'
import { resolveSpokenCallback } from './spoken-date.ts'
import type { DebtorAnswer as RecordedAnswer, Invoice } from './types.ts'

export type DebtorAnswer =
  | { answer: 'promesse'; date: string }
  | { answer: 'confirmer'; promiseId: string }
  | { answer: 'litige'; reason: string }
  | { answer: 'contact'; contact: string }
  | { answer: 'rappel'; when: string }

const VISIT_TITLE = 'A ouvert le lien de réponse'

/** Furthest a debtor may push a payment date from the answer page, in days. */
export const PROMISE_MAX_DAYS = 120

/** First and last payment day (AAAA-MM-JJ, UTC) the answer page accepts at workspace time `now`. */
export function promiseDateBounds(now: number): { min: string; max: string } {
  return { min: new Date(now).toISOString().slice(0, 10), max: new Date(now + PROMISE_MAX_DAYS * DAY_MS).toISOString().slice(0, 10) }
}

/** Why a payment date given on the answer page is refused, in French; undefined when it is accepted. */
export function promiseDateError(date: string, now: number): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Date au format AAAA-MM-JJ attendue.'
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return 'Cette date n’existe pas.'
  const { min, max } = promiseDateBounds(now)
  if (date < min) return 'La date de règlement ne peut pas être passée.'
  if (date > max) return `La date de règlement doit tomber dans les ${PROMISE_MAX_DAYS} prochains jours.`
  return undefined
}

/** Statuses where a person of the team has the invoice: an answer is logged, the status stays. */
function heldByTeam(invoice: Invoice): boolean {
  return invoice.status === 'a_vous' || invoice.status === 'litige'
}

const KEPT_BY_TEAM = 'Statut inchangé : votre équipe garde la main sur cette facture.'

/** Log the debtor opening the answer page, at most once a day. */
export function recordVisit(invoice: Invoice, now: number): Invoice {
  const recent = invoice.activities.some(activity => activity.title === VISIT_TITLE && now - Date.parse(activity.at) < DAY_MS)
  return recent ? invoice : logActivity(invoice, { kind: 'client', actor: 'client', title: VISIT_TITLE }, now)
}

/**
 * Apply the debtor's answer from the public page and move the invoice. An invoice the team
 * holds (À vous, Litige) keeps its status: the answer goes to the journal, a promise is still recorded.
 * The caller validates a promise date with `promiseDateError` first.
 */
export function applyDebtorAnswer(invoice: Invoice, answer: DebtorAnswer, now: number): Invoice {
  const applied = applyPageAnswer(invoice, answer, now)
  const recorded = recordedAnswer(answer, now)
  return recorded === undefined ? applied : { ...applied, answer: recorded }
}

/** The page answer as the CRM's « Réponse du client »; a confirmation of an existing promise adds none. */
function recordedAnswer(answer: DebtorAnswer, now: number): RecordedAnswer | undefined {
  const base = { notedAt: new Date(now).toISOString(), source: 'page' as const }
  switch (answer.answer) {
    case 'promesse':
      return { ...base, outcome: 'promesse', promiseDate: answer.date }
    case 'litige':
      return { ...base, outcome: 'litige', disputeReason: answer.reason, quote: answer.reason }
    case 'contact':
      return { ...base, outcome: 'renvoi', rightContact: answer.contact }
    case 'rappel': {
      const at = resolveSpokenCallback(answer.when, now)
      return { ...base, outcome: 'rappel', quote: answer.when, ...(at !== undefined ? { callbackAt: at } : {}) }
    }
    default:
      return undefined
  }
}

function applyPageAnswer(invoice: Invoice, answer: DebtorAnswer, now: number): Invoice {
  const iso = new Date(now).toISOString()
  const held = heldByTeam(invoice)
  switch (answer.answer) {
    case 'promesse': {
      const promise = { id: newId('pr'), amountEur: invoice.amountEur, dueDate: answer.date, status: 'attendue' as const, confirmedAt: iso }
      // A new date replaces the one still pending instead of counting it as broken.
      const kept = invoice.promises.filter(entry => entry.status !== 'attendue')
      if (held) {
        return logActivity({ ...invoice, promises: [...kept, promise] }, { kind: 'promesse', actor: 'client', title: `Date donnée en ligne : ${formatDay(answer.date)}`, detail: `Promesse confirmée par écrit. ${KEPT_BY_TEAM}` }, now)
      }
      const next = { ...invoice, status: 'promesse' as const, followUpAt: undefined, promises: [...kept, promise], knows: `${formatEur(invoice.amountEur)} promis pour le ${formatDay(answer.date)}, confirmé par écrit` }
      return logActivity(next, { kind: 'promesse', actor: 'client', title: `Date donnée en ligne : ${formatDay(answer.date)}`, detail: 'Promesse confirmée par écrit, sans appel.' }, now)
    }
    case 'confirmer': {
      const promises = invoice.promises.map(entry => (entry.id === answer.promiseId ? { ...entry, confirmedAt: iso } : entry))
      return logActivity({ ...invoice, promises }, { kind: 'promesse', actor: 'client', title: 'Promesse confirmée par écrit' }, now)
    }
    case 'litige': {
      if (held) return logActivity(invoice, { kind: 'litige', actor: 'client', title: 'Litige signalé en ligne', detail: `${answer.reason} · ${KEPT_BY_TEAM}` }, now)
      const next = logActivity({ ...invoice, status: 'litige', disputeReason: answer.reason, knows: answer.reason, followUpAt: undefined }, { kind: 'litige', actor: 'client', title: 'Litige signalé en ligne', detail: answer.reason }, now)
      return addDraft(next, 'litige', now)
    }
    case 'contact': {
      if (held) return logActivity(invoice, { kind: 'client', actor: 'client', title: 'Bon interlocuteur indiqué', detail: `${answer.contact} · ${KEPT_BY_TEAM}` }, now)
      const next = logActivity({ ...invoice, status: 'a_relancer', knows: `Bon interlocuteur : ${answer.contact}` }, { kind: 'client', actor: 'client', title: 'Bon interlocuteur indiqué', detail: answer.contact }, now)
      return addDraft(next, 'renvoi', now)
    }
    default: {
      if (held) return logActivity(invoice, { kind: 'client', actor: 'client', title: 'Rappel demandé en ligne', detail: `${answer.when} · ${KEPT_BY_TEAM}` }, now)
      // « demain 14 h » becomes that time; words the parser cannot read mean tomorrow 10:00.
      const at = resolveSpokenCallback(answer.when, now) ?? parisDayAt(now, 1, 10)
      return logActivity({ ...invoice, status: 'appel', followUpAt: at, knows: `Rappel demandé : ${answer.when}` }, { kind: 'client', actor: 'client', title: 'Rappel demandé en ligne', detail: answer.when }, now)
    }
  }
}
