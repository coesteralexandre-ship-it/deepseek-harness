import { DAY_MS, parisDate, parisDayAt, parisDayDiff, parisParts, parisShiftDays, parisTime, parisWeekday } from './clock.ts'
import { dateFromTranscript, describeAnswer, emailFromTranscript, extractEmail, parseRelanceOutcome, parseSpokenAmount, quoteFromTranscript, settleAmounts } from './answer.ts'
import { draftEmail } from './emails.ts'
import { daysSince, formatDay, formatEur } from './format.ts'
import { newId } from './ids.ts'
import type { Tone } from './stages.ts'
import { resolveSpokenCallback, resolveSpokenDate } from './spoken-date.ts'
import type { Activity, CallMode, DebtorAnswer, EmailKind, Invoice, InvoiceStatus, PaymentPromise, PromiseStatus, RelanceCallRecord, RelanceOutcome, TranscriptTurn } from './types.ts'

export { parseRelanceOutcome }

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
  deja_regle: { label: 'Déjà réglé', tone: 'turquoise' },
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

/** Two amounts closer than this are the same amount: sums of cents in floating point drift by a fraction of a cent. */
export const AMOUNT_TOLERANCE = 0.011

/** 10:00 Paris time on the day `days` after `iso`. */
function dayAt(iso: string, days: number, hour = 10): string {
  return parisDayAt(iso, days, hour)
}

/** Same time on the next working day when `iso` falls on a Saturday or a Sunday in Paris: nobody is called at the weekend. */
function workingDay(iso: string): string {
  const day = parisWeekday(iso)
  if (day === 6) return new Date(parisShiftDays(iso, 2)).toISOString()
  if (day === 0) return new Date(parisShiftDays(iso, 1)).toISOString()
  return iso
}

/** When playbook step `index` of `invoice` comes due; undefined past the last step. */
function playbookStepAt(invoice: Invoice, index: number): string | undefined {
  const step = PLAYBOOK[index]
  return step === undefined ? undefined : workingDay(dayAt(invoice.sequenceAnchor ?? invoice.dueDate, step.day))
}

/** Amount still owed: the invoice minus the promises already kept, rounded to the cent. */
export function remainingEur(invoice: Invoice): number {
  const kept = invoice.promises.filter(promise => promise.status === 'tenue').reduce((sum, promise) => sum + promise.amountEur, 0)
  return Math.max(0, Math.round((invoice.amountEur - kept) * 100) / 100)
}

/** Amount a board column adds up for this invoice: the full amount once paid, what is still owed otherwise. */
export function boardAmountEur(invoice: Invoice): number {
  return invoice.status === 'encaissee' ? invoice.amountEur : remainingEur(invoice)
}

/** The pending promise due first: with a payment in two parts, the earlier part is checked first. */
export function openPromise(invoice: Invoice): PaymentPromise | undefined {
  return invoice.promises.filter(promise => promise.status === 'attendue').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
}

/** What the engine does next on this invoice, and when; none once it is paid, disputed or handed over. */
export function nextAction(invoice: Invoice): NextAction | undefined {
  if (invoice.status === 'encaissee' || invoice.status === 'litige' || invoice.status === 'a_vous') return undefined
  const promise = openPromise(invoice)
  if (invoice.status === 'promesse' && promise !== undefined && !Number.isNaN(Date.parse(promise.dueDate))) {
    const verification: NextAction = { kind: 'verification', at: workingDay(dayAt(promise.dueDate, 1, 9)), label: `Vérifier le virement de ${formatEur(promise.amountEur)}` }
    // A callback the debtor asked for while a promise is pending runs if it comes first.
    if (invoice.followUpAt !== undefined && Date.parse(workingDay(invoice.followUpAt)) < Date.parse(verification.at)) return { kind: 'appel', at: workingDay(invoice.followUpAt), label: 'Rappel convenu' }
    return verification
  }
  if (invoice.followUpAt !== undefined) return { kind: 'appel', at: workingDay(invoice.followUpAt), label: 'Rappel convenu' }
  const step = PLAYBOOK[invoice.playbookIndex]
  const at = playbookStepAt(invoice, invoice.playbookIndex)
  if (step === undefined || at === undefined) return undefined
  return { kind: step.kind, at, label: step.label, email: step.email, playbookIndex: invoice.playbookIndex }
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
  /** YYYY-MM-DD, or the debtor's words (« demain »), resolved against the call's start. */
  promiseDate?: string
  /** Second instalment when the debtor pays in two. */
  secondDate?: string
  secondAmountEur?: number
  disputeReason?: string
  missingDocument?: string
  rightContact?: string
  /** The debtor's own words; read from the transcript when absent. */
  quote?: string
  delayReason?: string
  /** ISO instant, or words (« demain 14 h »), of the callback the debtor asked for. */
  callbackAt?: string
  /** Where the answer comes from; `analyse` by default. */
  answerSource?: DebtorAnswer['source']
  transcript?: TranscriptTurn[]
  error?: string
}

/** The result a call closes with when the agent noted the debtor's answer live; the analysis only adds the summary and the transcript. */
export function resultFromAnswer(answer: DebtorAnswer, extra: Pick<RelanceResult, 'callId' | 'conversationId' | 'summary' | 'transcript'> = {}): RelanceResult {
  return {
    ...extra,
    outcome: answer.outcome,
    promiseDate: answer.promiseDate,
    promiseAmountEur: answer.promiseAmountEur,
    secondDate: answer.secondDate,
    secondAmountEur: answer.secondAmountEur,
    disputeReason: answer.disputeReason,
    missingDocument: answer.missingDocument,
    rightContact: answer.rightContact,
    quote: answer.quote,
    delayReason: answer.delayReason,
    callbackAt: answer.callbackAt,
    answerSource: answer.source,
  }
}

/** The answer a result carries, dates resolved against `reference` (the call's start); words that name no date are dropped. */
function answerOf(result: RelanceResult, reference: number, now: number): DebtorAnswer {
  const payment = result.outcome === 'promesse' || result.outcome === 'deja_regle'
  const answer: DebtorAnswer = { outcome: result.outcome, notedAt: new Date(now).toISOString(), source: result.answerSource ?? 'analyse' }
  const quote = result.quote ?? quoteFromTranscript(result.transcript)
  if (quote !== undefined) answer.quote = quote
  if (result.delayReason !== undefined) answer.delayReason = result.delayReason
  if (payment) {
    const direction = result.outcome === 'deja_regle' ? 'passe' : 'futur'
    // An answer someone already noted (Léa live, or a person) is not second-guessed from the transcript.
    const noted = result.answerSource === 'direct' || result.answerSource === 'vous'
    const date = resolveSpokenDate(result.promiseDate, reference, direction) ?? (noted ? undefined : dateFromTranscript(result.transcript, reference, direction))
    if (date !== undefined) answer.promiseDate = date
    if (result.promiseAmountEur !== undefined) answer.promiseAmountEur = result.promiseAmountEur
    const second = result.outcome === 'promesse' ? resolveSpokenDate(result.secondDate, reference) : undefined
    if (second !== undefined) {
      answer.secondDate = second
      if (result.secondAmountEur !== undefined) answer.secondAmountEur = result.secondAmountEur
    }
  }
  if (result.outcome === 'litige') {
    if (result.disputeReason !== undefined) answer.disputeReason = result.disputeReason
    if (result.missingDocument !== undefined) answer.missingDocument = result.missingDocument
  }
  if (result.rightContact !== undefined) answer.rightContact = result.rightContact
  if (result.outcome === 'rappel') {
    // Resolved against the call's start, then kept only if still ahead and within the callback window.
    const at = resolveSpokenCallback(result.callbackAt, reference)
    if (at !== undefined && Date.parse(at) > now) answer.callbackAt = at
  }
  return answer
}

/** When the call a result closes carries a live answer, that answer decides; the result only brings the summary and the transcript. */
export function preferLiveAnswer(invoice: Invoice, result: RelanceResult): RelanceResult {
  const call = invoice.calls.find(entry =>
    (result.callId !== undefined && entry.id === result.callId)
    || (result.conversationId !== undefined && entry.conversationId === result.conversationId))
  if (call?.answer === undefined || call.status !== 'en_cours') return result
  return resultFromAnswer(call.answer, { callId: call.id, conversationId: result.conversationId ?? call.conversationId, summary: result.summary, transcript: result.transcript })
}

/**
 * Note the debtor's answer on the call in progress, while the conversation goes on: the CRM line and the journal change now,
 * the column when the call closes. A second note in the same call replaces the first (the debtor corrected a date).
 * Returns undefined when no call of this invoice is in progress under these ids.
 */
export function noteLiveAnswer(invoice: Invoice, ref: { callId?: string; conversationId?: string }, answer: DebtorAnswer, now: number): Invoice | undefined {
  const call = invoice.calls.find(entry => entry.status === 'en_cours'
    && ((ref.callId !== undefined && entry.id === ref.callId) || (ref.conversationId !== undefined && entry.conversationId === ref.conversationId)))
  if (call === undefined) return undefined
  const corrected = call.answer !== undefined
  // The tool omits the amount when the debtor pays the whole invoice; nothing may exceed the balance.
  answer = settleAmounts(answer, remainingEur(invoice), parisDate(now))
  const calls = invoice.calls.map(entry => (entry.id === call.id ? { ...entry, answer } : entry))
  const line = describeAnswer(answer)
  // A paid or handed-over invoice keeps its line, and so does a note that carries no answer (« sans suite », a callback
  // without a time) while a promise is pending; the answer is still on the call.
  const keepsLine = invoice.status === 'encaissee' || invoice.status === 'a_vous' || answer.outcome === 'sans_suite' || (answer.outcome === 'rappel' && answer.callbackAt === undefined && openPromise(invoice) !== undefined)
  const knows = keepsLine ? invoice.knows : line
  return logActivity({ ...invoice, calls, ...(answer.outcome !== 'sans_suite' ? { answer } : {}), knows }, {
    kind: 'client',
    actor: 'lea',
    title: `${corrected ? 'Réponse corrigée' : 'Réponse notée'} en direct : ${line}`,
    detail: answer.quote !== undefined ? `« ${answer.quote} »${answer.delayReason !== undefined ? ` · Cause du retard : ${answer.delayReason}` : ''}` : answer.delayReason,
  }, now)
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

/** Why a call result must leave the invoice where it is: paid, handed over, or disputed while the call does not confirm the dispute. */
function frozenBy(invoice: Invoice, outcome: RelanceOutcome): string | undefined {
  if (invoice.status === 'encaissee') return 'Facture déjà encaissée : statut inchangé.'
  if (invoice.status === 'a_vous') return 'Votre équipe a repris la main : statut inchangé.'
  if (invoice.status === 'litige' && outcome !== 'litige') return 'Facture en litige : statut inchangé.'
  return undefined
}

/** Whether the pending promise's date has passed, in Paris; a date the agent could not parse never counts as passed. */
function promiseOverdue(promise: PaymentPromise, now: number): boolean {
  return !Number.isNaN(Date.parse(promise.dueDate)) && parisDayDiff(now, promise.dueDate) > 0
}

/**
 * Close the matching call, log what it produced, draft the follow-up email, and move the invoice.
 * The same result applied twice (webhook retry, in-app analysis) changes nothing the second time.
 * A finished call consumes the playbook's pending call step when that step is due; the autopilot,
 * which already consumed the step it runs, passes `consumeDueCallStep = false`.
 */
export function applyRelanceResult(invoice: Invoice, result: RelanceResult, now: number, consumeDueCallStep = true): Invoice {
  const iso = new Date(now).toISOString()
  const existing = invoice.calls.find(call =>
    (result.callId !== undefined && call.id === result.callId)
    || (result.conversationId !== undefined && call.conversationId === result.conversationId))
  if (existing !== undefined && (existing.status === 'termine' || (existing.status === 'echec' && result.error !== undefined))) {
    // Already applied: only fill in a transcript or a summary that arrived late.
    const summary = existing.summary ?? result.summary
    const transcript = existing.transcript ?? result.transcript
    if (summary === existing.summary && transcript === existing.transcript) return invoice
    return { ...invoice, calls: invoice.calls.map(call => (call.id === existing.id ? { ...existing, summary, transcript } : call)) }
  }
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
    answer: existing?.answer,
    transcript: result.transcript ?? existing?.transcript,
    error: result.error,
  }
  if (result.error !== undefined) {
    const calls = existing === undefined ? [...invoice.calls, closed] : invoice.calls.map(call => (call.id === existing.id ? closed : call))
    return logActivity({ ...invoice, calls }, { kind: 'appel', actor: 'lea', title: 'Appel échoué', detail: result.error }, now)
  }
  const reference = Date.parse(closed.startedAt)
  const answer = settleAmounts(answerOf(result, Number.isNaN(reference) ? now : reference, now), remainingEur(invoice), parisDate(now))
  closed.answer = answer
  // The settled answer may correct the label (a « déjà réglé » dated ahead is a promise).
  closed.outcome = answer.outcome
  const calls = existing === undefined ? [...invoice.calls, closed] : invoice.calls.map(call => (call.id === existing.id ? closed : call))
  // A call with no answer keeps the debtor's last real answer as the CRM's « Réponse du client ».
  let next: Invoice = { ...invoice, calls, answer: answer.outcome === 'sans_suite' ? invoice.answer : answer }
  const meta = RELANCE_OUTCOME_META[answer.outcome]
  const title = `Appel : ${meta.label.toLowerCase()}`
  // A late result (webhook after the invoice was paid, handed over or disputed) is logged, nothing more.
  const frozen = frozenBy(invoice, answer.outcome)
  if (frozen !== undefined) return logActivity(next, { kind: 'appel', actor: 'lea', title, detail: result.summary !== undefined ? `${result.summary} ${frozen}` : frozen }, now)
  const dueAt = playbookStepAt(next, next.playbookIndex)
  if (consumeDueCallStep && PLAYBOOK[next.playbookIndex]?.kind === 'appel' && dueAt !== undefined && Date.parse(dueAt) <= now) {
    next = { ...next, playbookIndex: next.playbookIndex + 1 }
  }
  next = logActivity(next, { kind: 'appel', actor: 'lea', title, detail: result.summary }, now)
  // A live note already logged the debtor's words; an answer read after the call logs them now.
  if (existing?.answer === undefined && (answer.quote !== undefined || answer.delayReason !== undefined)) {
    next = logActivity(next, {
      kind: 'client',
      actor: 'client',
      title: 'Réponse du client',
      detail: [answer.quote !== undefined ? `« ${answer.quote} »` : undefined, answer.delayReason !== undefined ? `Cause du retard : ${answer.delayReason}` : undefined].filter(Boolean).join(' · '),
    }, now)
  }

  switch (answer.outcome) {
    case 'promesse':
    case 'deja_regle': {
      const claimed = answer.outcome === 'deja_regle'
      const date = answer.promiseDate ?? (claimed ? parisDate(now) : parisDate(dayAt(iso, 5)))
      const owed = remainingEur(next)
      const second = answer.secondDate !== undefined && answer.secondAmountEur !== undefined ? { dueDate: answer.secondDate, amountEur: answer.secondAmountEur } : undefined
      const fresh: PaymentPromise[] = [
        // A payment said to have left already is checked from tomorrow on, whatever its date: the transfer may still be in flight.
        { id: newId('pr'), amountEur: answer.promiseAmountEur ?? owed, dueDate: claimed ? parisDate(now) : date, status: 'attendue', ...(claimed ? { claimed: true } : {}) },
        ...(second !== undefined ? [{ id: newId('pr'), amountEur: second.amountEur, dueDate: second.dueDate, status: 'attendue' as const }] : []),
      ]
      // The new date replaces the pending one: broken if its date already passed, dropped otherwise.
      const promises = next.promises
        .filter(entry => entry.status !== 'attendue' || promiseOverdue(entry, now))
        .map(entry => (entry.status === 'attendue' ? { ...entry, status: 'rompue' as const } : entry))
      // A payment said to be made without a date stays without one in the CRM line, rather than reading as paid today.
      const line = describeAnswer({ ...answer, promiseDate: claimed ? answer.promiseDate : date, promiseAmountEur: fresh[0]?.amountEur })
      next = { ...next, status: 'promesse', followUpAt: undefined, promises: [...promises, ...fresh], knows: line }
      next = logActivity(next, { kind: 'promesse', actor: 'lea', title: claimed ? `Déclaré réglé${answer.promiseDate !== undefined ? ` le ${formatDay(answer.promiseDate)}` : ''} : ${formatEur(fresh[0]?.amountEur ?? owed)} à vérifier` : `Promesse : ${fresh.map(entry => `${formatEur(entry.amountEur)} le ${formatDay(entry.dueDate)}`).join(', puis ')}` }, now)
      return addDraft(next, claimed ? 'avis_virement' : 'recap_promesse', now)
    }
    case 'litige': {
      // A disputed invoice will not be paid on the promised date: the pending promise no longer holds.
      const reason = [answer.disputeReason, answer.missingDocument !== undefined ? `Pièce attendue : ${answer.missingDocument}` : undefined]
        .filter((part): part is string => part !== undefined && part.trim() !== '')
        .map(part => part.trim().replace(/[.\s]+$/u, ''))
        .join('. ')
      const disputeReason = reason !== '' ? reason : next.disputeReason
      next = { ...next, status: 'litige', followUpAt: undefined, promises: next.promises.filter(entry => entry.status !== 'attendue'), disputeReason, knows: disputeReason ?? 'Litige exprimé, motif à préciser' }
      next = logActivity(next, { kind: 'litige', actor: 'lea', title: 'Litige qualifié', detail: next.disputeReason }, now)
      return addDraft(next, 'litige', now)
    }
    case 'renvoi': {
      // An invoice the debtor never received cannot be paid on the promised date either.
      const contact = answer.rightContact ?? emailFromTranscript(result.transcript)
      if (contact !== undefined && answer.rightContact === undefined) next = { ...next, answer: { ...answer, rightContact: contact } }
      next = { ...next, status: 'a_relancer', followUpAt: dayAt(iso, 3), promises: next.promises.filter(entry => entry.status !== 'attendue'), knows: contact !== undefined ? `Facture à renvoyer à ${contact}` : 'Facture jamais reçue, à renvoyer' }
      const drafted = addDraft(next, 'renvoi', now)
      // The resend goes to the address the debtor gave, when it is one.
      const address = extractEmail(answer.rightContact) ?? emailFromTranscript(result.transcript)
      if (address === undefined) return drafted
      return { ...drafted, emails: drafted.emails.map((email, index) => (index === drafted.emails.length - 1 ? { ...email, to: address } : email)) }
    }
    default: {
      // No answer or a callback request does not cancel a promise still pending: its verification stays scheduled,
      // and a callback the debtor asked for is kept alongside it (the earlier of the two runs first).
      const pending = openPromise(next)
      if (pending !== undefined) {
        const callback = answer.outcome === 'rappel' ? answer.callbackAt : undefined
        const promiseLine = `${formatEur(pending.amountEur)} attendus le ${formatDay(pending.dueDate)}`
        return { ...next, status: 'promesse', followUpAt: callback, knows: callback !== undefined ? `${describeAnswer(answer)} · ${promiseLine}` : `Promesse en cours : ${promiseLine}` }
      }
      const streak = unansweredStreak(next.calls)
      if (streak >= 3) {
        next = { ...next, status: 'a_vous', followUpAt: undefined, knows: `${streak} appels sans date obtenue` }
        return logActivity(next, { kind: 'etape', actor: 'autopilote', title: 'Passage à votre équipe', detail: 'Trois appels sans date : Léa passe la main.' }, now)
      }
      const callback = answer.outcome === 'rappel' ? answer.callbackAt ?? dayAt(iso, 1) : undefined
      return {
        ...next,
        status: 'appel',
        followUpAt: callback,
        knows: callback !== undefined ? describeAnswer({ ...answer, callbackAt: callback }) : `${streak} appel${streak > 1 ? 's' : ''} sans réponse`,
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
  // A payment the debtor said was already made and that the statement does not show is a missing transfer, not a late promise.
  const title = promise.claimed === true ? `Virement déclaré introuvable : ${formatEur(promise.amountEur)}` : `Promesse non tenue : ${formatEur(promise.amountEur)} du ${formatDay(promise.dueDate)}`
  let next = logActivity({ ...invoice, promises }, { kind: 'promesse', actor, title }, now)
  if (broken >= 2) {
    next = { ...next, status: 'a_vous', followUpAt: undefined, knows: `${broken} promesses non tenues` }
    return logActivity(next, { kind: 'etape', actor: 'autopilote', title: 'Passage à votre équipe', detail: 'Deux promesses non tenues : demander un acompte ou plafonner l’encours.' }, now)
  }
  next = { ...next, status: 'appel', followUpAt: dayAt(new Date(now).toISOString(), 1, 9), knows: promise.claimed === true ? 'Virement déclaré introuvable, rappel demain' : 'Promesse non tenue, rappel demain' }
  return addDraft(next, 'promesse_rompue', now)
}

/**
 * Record a promise as kept. The invoice is paid once the kept promises cover it to the cent; a partial
 * payment with no other promise pending leaves the Promesse column and Léa calls back for the balance.
 */
export function keepPromise(invoice: Invoice, promiseId: string, now: number, actor: Activity['actor']): Invoice {
  const promise = invoice.promises.find(entry => entry.id === promiseId)
  if (promise === undefined) return invoice
  const promises = invoice.promises.map(entry => (entry.id === promiseId ? { ...entry, status: 'tenue' as const } : entry))
  const next = logActivity({ ...invoice, promises }, { kind: 'promesse', actor, title: `Promesse tenue : ${formatEur(promise.amountEur)}` }, now)
  const owed = remainingEur(next)
  if (owed < AMOUNT_TOLERANCE) return markPaid(next, now, actor)
  const rest = promises.find(entry => entry.status === 'attendue')
  if (rest !== undefined) return { ...next, knows: `Solde de ${formatEur(rest.amountEur)} attendu le ${formatDay(rest.dueDate)}` }
  const knows = `Acompte reçu, solde de ${formatEur(owed, true)} à obtenir`
  if (next.status !== 'promesse') return { ...next, knows }
  return { ...next, status: 'appel', followUpAt: dayAt(new Date(now).toISOString(), 1, 9), knows }
}

/** "9 800", "9800,50 €", "9 800 euros" → 9800 or 9800.5; undefined when no number is found. */
export const parseAmount = parseSpokenAmount

export function daysLate(invoice: Invoice, now: number): number {
  return daysSince(invoice.dueDate, now)
}

/** Monday 00:00 of the week containing `time`, Paris time. */
export function weekStart(time: number): number {
  const p = parisParts(time)
  return parisTime(p.year, p.month, p.day - ((p.weekday + 6) % 7))
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
  const end = parisShiftDays(start, 7)
  const promises = invoices.flatMap(invoice => invoice.promises)
  const thisWeek = promises.filter(promise => {
    const time = Date.parse(promise.dueDate)
    return !Number.isNaN(time) && time >= start && time < end
  })
  const settled = promises.filter(promise => promise.status !== 'attendue')
  return {
    overdueEur: open.reduce((sum, invoice) => sum + remainingEur(invoice), 0),
    overdueCount: open.length,
    debtorCount: new Set(open.map(invoice => invoice.debtor.company)).size,
    promisedThisWeekEur: thisWeek.reduce((sum, promise) => sum + promise.amountEur, 0),
    receivedThisWeekEur: thisWeek.filter(promise => promise.status === 'tenue').reduce((sum, promise) => sum + promise.amountEur, 0),
    collectedEur: invoices.reduce((sum, invoice) => sum + (invoice.status === 'encaissee' ? invoice.amountEur : invoice.amountEur - remainingEur(invoice)), 0),
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
  const first = parisShiftDays(weekStart(now), -7 * before)
  const weeks: WeekForecast[] = Array.from({ length: count }, (_, index) => ({ start: new Date(parisShiftDays(first, 7 * index)).toISOString(), promisedEur: 0, receivedEur: 0 }))
  for (const promise of invoices.flatMap(invoice => invoice.promises)) {
    const time = Date.parse(promise.dueDate)
    if (Number.isNaN(time)) continue
    const week = weeks[Math.floor(parisDayDiff(time, first) / 7)]
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
        overdueEur: open.reduce((sum, invoice) => sum + remainingEur(invoice), 0),
        avgDaysLate: open.length === 0 ? 0 : Math.round(open.reduce((sum, invoice) => sum + daysLate(invoice, now), 0) / open.length),
      }
    })
    .filter(row => row.settled > 0)
    .sort((a, b) => a.kept / a.settled - b.kept / b.settled || b.overdueEur - a.overdueEur)
}
