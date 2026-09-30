import { DAY_MS } from './clock.ts'
import { draftEmail } from './emails.ts'
import { daysSince, formatDay, formatEur } from './format.ts'
import { newId } from './ids.ts'
import type { Tone } from './stages.ts'
import type { Activity, CallMode, EmailKind, Invoice, InvoiceStatus, PaymentPromise, PromiseStatus, RelanceCallRecord, RelanceOutcome, TranscriptTurn } from './types.ts'

export const STAGE_META: Record<InvoiceStatus, { label: string; hint: string; tone: Tone }> = {
  a_relancer: { label: 'À relancer', hint: 'Échue, la séquence démarre', tone: 'neutral' },
  email_envoye: { label: 'Email envoyé', hint: 'Relance écrite, en attente de réponse', tone: 'amethyst' },
  appel: { label: 'Appel', hint: 'Léa appelle ou rappelle', tone: 'turquoise' },
  promesse: { label: 'Promesse', hint: 'Une date et un montant obtenus', tone: 'warn' },
  litige: { label: 'Litige', hint: 'Une pièce ou un désaccord bloque', tone: 'hot' },
  a_vous: { label: 'À vous', hint: 'Votre équipe reprend la main', tone: 'sienna' },
  encaissee: { label: 'Encaissé', hint: 'Règlement reçu', tone: 'ok' },
}

export type PlaybookKind = 'email' | 'appel' | 'humain'

export interface PlaybookStep {
  id: string
  /** Days after the due date. */
  day: number
  kind: PlaybookKind
  label: string
  goal: string
  email?: EmailKind
}

/** The reminder sequence every open invoice follows until it gets a date, a dispute, or cash. */
export const PLAYBOOK: PlaybookStep[] = [
  { id: 'e1', day: 1, kind: 'email', label: 'Email de rappel', goal: 'Rappel courtois avec la facture et le lien de réponse', email: 'rappel' },
  { id: 'c1', day: 3, kind: 'appel', label: 'Appel de confirmation', goal: 'Confirmer que la facture est reçue et chez le bon interlocuteur' },
  { id: 'e2', day: 7, kind: 'email', label: 'Email de demande de date', goal: 'Demander une date de règlement par écrit', email: 'date' },
  { id: 'c2', day: 10, kind: 'appel', label: 'Appel pour une date', goal: 'Obtenir une date et un montant de règlement' },
  { id: 'c3', day: 20, kind: 'appel', label: 'Appel ferme', goal: 'Appel ferme et neutre, suivi d’un récapitulatif écrit' },
  { id: 'h', day: 30, kind: 'humain', label: 'Relais humain', goal: 'Votre équipe reprend la main' },
]

export const PROMISE_STATUS_META: Record<PromiseStatus, { label: string; tone: Tone }> = {
  attendue: { label: 'Attendue', tone: 'warn' },
  tenue: { label: 'Tenue', tone: 'ok' },
  rompue: { label: 'Rompue', tone: 'hot' },
}

export const RELANCE_OUTCOME_META: Record<RelanceOutcome, { label: string; tone: Tone }> = {
  promesse: { label: 'Promesse obtenue', tone: 'ok' },
  litige: { label: 'Litige exprimé', tone: 'hot' },
  renvoi: { label: 'Facture renvoyée', tone: 'neutral' },
  rappel: { label: 'Rappel demandé', tone: 'warn' },
  sans_suite: { label: 'Sans réponse', tone: 'mute' },
}

export const OPEN_STAGES: InvoiceStatus[] = ['a_relancer', 'email_envoye', 'appel', 'promesse']

export type NextActionKind = 'email' | 'appel' | 'verification' | 'humain'

export interface NextAction {
  kind: NextActionKind
  /** ISO time the autopilot runs it. */
  at: string
  label: string
  email?: EmailKind
  /** Set when the action is a playbook step rather than a dated follow-up. */
  playbookIndex?: number
}

/** 10:00 local time on the day `days` after `iso`. */
function dayAt(iso: string, days: number, hour = 10): string {
  const date = new Date(Date.parse(iso) + days * DAY_MS)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

/** Same time on the next working day when `iso` falls on a Saturday or a Sunday: nobody is called at the weekend. */
function workingDay(iso: string): string {
  const date = new Date(iso)
  const day = date.getDay()
  if (day === 6) date.setDate(date.getDate() + 2)
  else if (day === 0) date.setDate(date.getDate() + 1)
  return date.toISOString()
}

export function openPromise(invoice: Invoice): PaymentPromise | undefined {
  return invoice.promises.find(promise => promise.status === 'attendue')
}

/** What the engine does next on this invoice, and when; none once it is paid, disputed or handed over. */
export function nextAction(invoice: Invoice): NextAction | undefined {
  if (invoice.status === 'encaissee' || invoice.status === 'litige' || invoice.status === 'a_vous') return undefined
  const promise = openPromise(invoice)
  if (invoice.status === 'promesse' && promise !== undefined && !Number.isNaN(Date.parse(promise.dueDate))) {
    return { kind: 'verification', at: workingDay(dayAt(promise.dueDate, 1, 9)), label: `Vérifier le virement de ${formatEur(promise.amountEur)}` }
  }
  if (invoice.followUpAt !== undefined) return { kind: 'appel', at: workingDay(invoice.followUpAt), label: 'Rappel convenu' }
  const step = PLAYBOOK[invoice.playbookIndex]
  if (step === undefined) return undefined
  return { kind: step.kind, at: workingDay(dayAt(invoice.dueDate, step.day)), label: step.label, email: step.email, playbookIndex: invoice.playbookIndex }
}

/** Append one line to the invoice's journal. */
export function logActivity(invoice: Invoice, entry: Omit<Activity, 'id' | 'at'>, now: number): Invoice {
  const activity: Activity = { id: newId('ac'), at: new Date(now).toISOString(), ...entry }
  return { ...invoice, activities: [...invoice.activities, activity], updatedAt: activity.at }
}

/** Add an email draft and log it. */
export function addDraft(invoice: Invoice, kind: EmailKind, now: number, actor: Activity['actor'] = 'autopilote'): Invoice {
  const draft = draftEmail(invoice, kind, now)
  return logActivity({ ...invoice, emails: [...invoice.emails, draft] }, { kind: 'email', actor, title: 'Brouillon préparé', detail: draft.subject }, now)
}

/** Mark a draft as sent. `simulated` is for the demo autopilot, which sends nothing. */
export function sendDraft(invoice: Invoice, emailId: string, now: number, actor: Activity['actor'], simulated: boolean): Invoice {
  const email = invoice.emails.find(entry => entry.id === emailId)
  if (email === undefined || email.status === 'envoye') return invoice
  const sentAt = new Date(now).toISOString()
  const emails = invoice.emails.map(entry => (entry.id === emailId ? { ...entry, status: 'envoye' as const, sentAt, simulated } : entry))
  const status: InvoiceStatus = invoice.status === 'a_relancer' ? 'email_envoye' : invoice.status
  const knows = email.kind === 'renvoi' ? 'Facture renvoyée à la bonne personne' : invoice.status === 'a_relancer' ? `Relance écrite envoyée le ${formatDay(sentAt)}` : invoice.knows
  return logActivity({ ...invoice, emails, status, knows }, { kind: 'email', actor, title: 'Email envoyé', detail: email.subject }, now)
}

export interface RelanceResult {
  callId?: string
  conversationId?: string
  mode?: CallMode
  outcome: RelanceOutcome
  summary?: string
  promiseAmountEur?: number
  promiseDate?: string
  disputeReason?: string
  rightContact?: string
  transcript?: TranscriptTurn[]
  error?: string
}

function unansweredStreak(calls: readonly RelanceCallRecord[]): number {
  let streak = 0
  for (const call of [...calls].reverse()) {
    if (call.status !== 'termine') continue
    if (call.outcome === 'sans_suite' || call.outcome === 'rappel') streak += 1
    else break
  }
  return streak
}

/** Close the matching call, log what it produced, draft the follow-up email, and move the invoice. */
export function applyRelanceResult(invoice: Invoice, result: RelanceResult, now: number): Invoice {
  const iso = new Date(now).toISOString()
  const existing = invoice.calls.find(call =>
    (result.callId !== undefined && call.id === result.callId)
    || (result.conversationId !== undefined && call.conversationId === result.conversationId))
  const closed: RelanceCallRecord = {
    id: existing?.id ?? newId('rc'),
    mode: existing?.mode ?? result.mode ?? 'telephone',
    conversationId: result.conversationId ?? existing?.conversationId,
    startedAt: existing?.startedAt ?? iso,
    endedAt: iso,
    status: result.error === undefined ? 'termine' : 'echec',
    outcome: result.outcome,
    summary: result.summary ?? existing?.summary,
    disputeReason: result.disputeReason,
    rightContact: result.rightContact,
    transcript: result.transcript ?? existing?.transcript,
    error: result.error,
  }
  const calls = existing === undefined ? [...invoice.calls, closed] : invoice.calls.map(call => (call.id === existing.id ? closed : call))
  let next: Invoice = { ...invoice, calls }
  if (result.error !== undefined) {
    return logActivity(next, { kind: 'appel', actor: 'lea', title: 'Appel échoué', detail: result.error }, now)
  }
  // A finished call consumes the playbook's pending call step.
  if (PLAYBOOK[next.playbookIndex]?.kind === 'appel') next = { ...next, playbookIndex: next.playbookIndex + 1 }
  const meta = RELANCE_OUTCOME_META[result.outcome]
  next = logActivity(next, { kind: 'appel', actor: 'lea', title: `Appel : ${meta.label.toLowerCase()}`, detail: result.summary }, now)

  switch (result.outcome) {
    case 'promesse': {
      const date = result.promiseDate ?? dayAt(iso, 5).slice(0, 10)
      const promise: PaymentPromise = { id: newId('pr'), amountEur: result.promiseAmountEur ?? next.amountEur, dueDate: date, status: 'attendue' }
      next = { ...next, status: 'promesse', followUpAt: undefined, promises: [...next.promises, promise], knows: `${formatEur(promise.amountEur)} promis pour le ${formatDay(date)}` }
      next = logActivity(next, { kind: 'promesse', actor: 'lea', title: `Promesse : ${formatEur(promise.amountEur)} le ${formatDay(date)}` }, now)
      return addDraft(next, 'recap_promesse', now)
    }
    case 'litige':
      next = { ...next, status: 'litige', followUpAt: undefined, disputeReason: result.disputeReason ?? next.disputeReason, knows: result.disputeReason ?? 'Litige exprimé, motif à préciser' }
      next = logActivity(next, { kind: 'litige', actor: 'lea', title: 'Litige qualifié', detail: next.disputeReason }, now)
      return addDraft(next, 'litige', now)
    case 'renvoi':
      next = { ...next, status: 'a_relancer', followUpAt: dayAt(iso, 3), knows: result.rightContact !== undefined ? `Facture à renvoyer à ${result.rightContact}` : 'Facture jamais reçue, à renvoyer' }
      return addDraft(next, 'renvoi', now)
    default: {
      const streak = unansweredStreak(next.calls)
      if (streak >= 3) {
        next = { ...next, status: 'a_vous', followUpAt: undefined, knows: `${streak} appels sans date obtenue` }
        return logActivity(next, { kind: 'etape', actor: 'autopilote', title: 'Passage à votre équipe', detail: 'Trois appels sans date : Léa passe la main.' }, now)
      }
      return {
        ...next,
        status: 'appel',
        followUpAt: result.outcome === 'rappel' ? dayAt(iso, 1) : undefined,
        knows: result.outcome === 'rappel' ? 'Rappel demandé pour demain' : `${streak} appel${streak > 1 ? 's' : ''} sans réponse`,
      }
    }
  }
}

export function openRelanceCall(invoice: Invoice, mode: CallMode, conversationId: string | undefined, now: number): { invoice: Invoice; call: RelanceCallRecord } {
  const call: RelanceCallRecord = { id: newId('rc'), mode, conversationId, startedAt: new Date(now).toISOString(), status: 'en_cours' }
  const opened = logActivity({ ...invoice, calls: [...invoice.calls, call], status: invoice.status === 'encaissee' ? invoice.status : 'appel' }, { kind: 'appel', actor: 'lea', title: mode === 'telephone' ? 'Léa appelle' : 'Conversation avec Léa', detail: invoice.debtor.contactName }, now)
  return { call, invoice: opened }
}

/** Record the payment: every open promise counts as kept. */
export function markPaid(invoice: Invoice, now: number, actor: Activity['actor']): Invoice {
  const iso = new Date(now).toISOString()
  const paid: Invoice = {
    ...invoice,
    status: 'encaissee',
    paidAt: iso,
    followUpAt: undefined,
    knows: 'Règlement reçu',
    promises: invoice.promises.map(promise => (promise.status === 'attendue' ? { ...promise, status: 'tenue' as const } : promise)),
  }
  return logActivity(paid, { kind: 'paiement', actor, title: `Règlement reçu : ${formatEur(invoice.amountEur, true)}` }, now)
}

/** A promised date passed without the payment: draft the email and call back the next day, or hand over after two. */
export function breakPromise(invoice: Invoice, promiseId: string, now: number, actor: Activity['actor']): Invoice {
  const promise = invoice.promises.find(entry => entry.id === promiseId)
  if (promise === undefined) return invoice
  const promises = invoice.promises.map(entry => (entry.id === promiseId ? { ...entry, status: 'rompue' as const } : entry))
  const broken = promises.filter(entry => entry.status === 'rompue').length
  let next = logActivity({ ...invoice, promises }, { kind: 'promesse', actor, title: `Promesse non tenue : ${formatEur(promise.amountEur)} du ${formatDay(promise.dueDate)}` }, now)
  if (broken >= 2) {
    next = { ...next, status: 'a_vous', followUpAt: undefined, knows: `${broken} promesses non tenues` }
    return logActivity(next, { kind: 'etape', actor: 'autopilote', title: 'Passage à votre équipe', detail: 'Deux promesses non tenues : demander un acompte ou plafonner l’encours.' }, now)
  }
  next = { ...next, status: 'appel', followUpAt: dayAt(new Date(now).toISOString(), 1, 9), knows: 'Promesse non tenue, rappel demain' }
  return addDraft(next, 'promesse_rompue', now)
}

export function keepPromise(invoice: Invoice, promiseId: string, now: number, actor: Activity['actor']): Invoice {
  const promise = invoice.promises.find(entry => entry.id === promiseId)
  if (promise === undefined) return invoice
  const promises = invoice.promises.map(entry => (entry.id === promiseId ? { ...entry, status: 'tenue' as const } : entry))
  const paidEur = promises.filter(entry => entry.status === 'tenue').reduce((sum, entry) => sum + entry.amountEur, 0)
  const next = logActivity({ ...invoice, promises }, { kind: 'promesse', actor, title: `Promesse tenue : ${formatEur(promise.amountEur)}` }, now)
  if (paidEur >= invoice.amountEur) return markPaid(next, now, actor)
  const rest = promises.find(entry => entry.status === 'attendue')
  return { ...next, knows: rest !== undefined ? `Solde de ${formatEur(rest.amountEur)} attendu le ${formatDay(rest.dueDate)}` : next.knows }
}

/** Map free text from the agent's data collection to a reminder outcome. */
export function parseRelanceOutcome(value: unknown): RelanceOutcome {
  if (typeof value !== 'string') return 'sans_suite'
  const text = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/promesse|promise|paiement|regle/.test(text)) return 'promesse'
  if (/litige|conteste|dispute/.test(text)) return 'litige'
  if (/renvoi|non recue|pas recue|resend/.test(text)) return 'renvoi'
  if (/rappel|callback/.test(text)) return 'rappel'
  return 'sans_suite'
}

/** "9 800", "9800,50 €", "9 800 euros" → 9800 or 9800.5; undefined when no number is found. */
export function parseAmount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const match = /(\d[\d\s.,]*)/u.exec(value)
  if (match === null) return undefined
  const compact = (match[1] ?? '').replace(/\s/gu, '')
  const normalized = /,\d{1,2}$/.test(compact) ? compact.replace(/\./g, '').replace(',', '.') : compact.replace(/,/g, '')
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? amount : undefined
}

export function daysLate(invoice: Invoice, now: number): number {
  return daysSince(invoice.dueDate, now)
}

/** Monday 00:00 of the week containing `time`, local time. */
export function weekStart(time: number): number {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return date.getTime()
}

export interface ReceivablesKpis {
  overdueEur: number
  overdueCount: number
  debtorCount: number
  promisedThisWeekEur: number
  receivedThisWeekEur: number
  collectedEur: number
  keptRate: number | undefined
  leaActions7d: number
  openDisputes: number
  waitingOnYou: number
}

export function receivablesKpis(invoices: readonly Invoice[], now: number): ReceivablesKpis {
  const open = invoices.filter(invoice => invoice.status !== 'encaissee')
  const start = weekStart(now)
  const end = start + 7 * DAY_MS
  const promises = invoices.flatMap(invoice => invoice.promises)
  const thisWeek = promises.filter(promise => {
    const time = Date.parse(promise.dueDate)
    return !Number.isNaN(time) && time >= start && time < end
  })
  const settled = promises.filter(promise => promise.status !== 'attendue')
  return {
    overdueEur: open.reduce((sum, invoice) => sum + invoice.amountEur, 0),
    overdueCount: open.length,
    debtorCount: new Set(open.map(invoice => invoice.debtor.company)).size,
    promisedThisWeekEur: thisWeek.reduce((sum, promise) => sum + promise.amountEur, 0),
    receivedThisWeekEur: thisWeek.filter(promise => promise.status === 'tenue').reduce((sum, promise) => sum + promise.amountEur, 0),
    collectedEur: invoices.filter(invoice => invoice.status === 'encaissee').reduce((sum, invoice) => sum + invoice.amountEur, 0),
    keptRate: settled.length === 0 ? undefined : settled.filter(promise => promise.status === 'tenue').length / settled.length,
    leaActions7d: invoices.flatMap(invoice => invoice.activities).filter(activity => (activity.actor === 'lea' || activity.actor === 'autopilote') && now - Date.parse(activity.at) < 7 * DAY_MS && Date.parse(activity.at) <= now).length,
    openDisputes: open.filter(invoice => invoice.status === 'litige').length,
    waitingOnYou: open.filter(invoice => invoice.status === 'a_vous').length,
  }
}

export interface WeekForecast {
  /** Monday of the week, ISO. */
  start: string
  promisedEur: number
  receivedEur: number
}

/** Promised and received amounts for `count` weeks, starting `before` weeks ago. */
export function weeklyForecast(invoices: readonly Invoice[], now: number, before = 2, count = 5): WeekForecast[] {
  const first = weekStart(now) - before * 7 * DAY_MS
  const weeks: WeekForecast[] = Array.from({ length: count }, (_, index) => ({ start: new Date(first + index * 7 * DAY_MS).toISOString(), promisedEur: 0, receivedEur: 0 }))
  for (const promise of invoices.flatMap(invoice => invoice.promises)) {
    const time = Date.parse(promise.dueDate)
    if (Number.isNaN(time)) continue
    const week = weeks[Math.floor((time - first) / (7 * DAY_MS))]
    if (week === undefined) continue
    week.promisedEur += promise.amountEur
    if (promise.status === 'tenue') week.receivedEur += promise.amountEur
  }
  return weeks
}

export interface PayerReliability {
  company: string
  kept: number
  settled: number
  overdueEur: number
  avgDaysLate: number
}

/** Least reliable payers first: share of kept promises among those that came due. */
export function payerReliability(invoices: readonly Invoice[], now: number): PayerReliability[] {
  const byCompany = new Map<string, Invoice[]>()
  for (const invoice of invoices) byCompany.set(invoice.debtor.company, [...(byCompany.get(invoice.debtor.company) ?? []), invoice])
  return [...byCompany.entries()]
    .map(([company, own]) => {
      const promises = own.flatMap(invoice => invoice.promises).filter(promise => promise.status !== 'attendue')
      const open = own.filter(invoice => invoice.status !== 'encaissee')
      return {
        company,
        kept: promises.filter(promise => promise.status === 'tenue').length,
        settled: promises.length,
        overdueEur: open.reduce((sum, invoice) => sum + invoice.amountEur, 0),
        avgDaysLate: open.length === 0 ? 0 : Math.round(open.reduce((sum, invoice) => sum + daysLate(invoice, now), 0) / open.length),
      }
    })
    .filter(row => row.settled > 0)
    .sort((a, b) => a.kept / a.settled - b.kept / b.settled || b.overdueEur - a.overdueEur)
}
