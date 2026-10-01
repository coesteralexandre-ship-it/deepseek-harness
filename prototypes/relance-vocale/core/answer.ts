import { z } from 'zod'
import { BUSINESS_TZ } from './clock.ts'
import { formatDay, formatEur } from './format.ts'
import { resolveSpokenCallback, resolveSpokenDate, type DateDirection } from './spoken-date.ts'
import { parseFrenchAmount } from './tabular.ts'
import { RELANCE_OUTCOMES, type DebtorAnswer, type RelanceOutcome, type TranscriptTurn } from './types.ts'

/** Name of the client tool the reminder agent calls when the debtor's answer is clear. */
export const ANSWER_TOOL_NAME = 'noter_reponse'

/**
 * Parameters of the `noter_reponse` tool, as the agent sends them. Everything but `reponse` is optional
 * text: the agent may pass « demain » or « 9 800 euros », the server resolves them.
 */
export const answerToolParams = z.object({
  reponse: z.string().trim().min(1).max(40),
  citation: z.string().trim().max(400).optional(),
  cause_retard: z.string().trim().max(400).optional(),
  date_reglement: z.string().trim().max(80).optional(),
  montant: z.union([z.number().max(10_000_000), z.string().trim().max(40)]).optional(),
  date_second_reglement: z.string().trim().max(80).optional(),
  montant_second_reglement: z.union([z.number().max(10_000_000), z.string().trim().max(40)]).optional(),
  motif_litige: z.string().trim().max(400).optional(),
  piece_manquante: z.string().trim().max(200).optional(),
  bon_interlocuteur: z.string().trim().max(200).optional(),
  rappel_le: z.string().trim().max(80).optional(),
})

export type AnswerToolParams = z.infer<typeof answerToolParams>

/** Map free text (tool parameter, data-collection field) to a reminder outcome. */
export function parseRelanceOutcome(value: unknown): RelanceOutcome {
  if (typeof value !== 'string') return 'sans_suite'
  const text = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  if ((RELANCE_OUTCOMES as readonly string[]).includes(text)) return text as RelanceOutcome
  // A payment that already left, in the past tense; « pas encore payé », « impayé », « va payer » are not.
  const notYet = /pas encore|impaye|\b(pas|non) (paye|regle)|va (payer|regler)|vont payer|payera|paiera|reglera|paieront|(sera|seront) (payee?s?|reglee?s?)|refuse|ne (peut|veut) pas/.test(text)
  if (!notYet && /deja|already|deja_regle|virement (fait|parti|effectue)|\b(a|ont|avoir) (paye|regle|vire)\b|\b(payee?|reglee?)\b/.test(text)) return 'deja_regle'
  if (/litige|conteste|contestation|dispute|refuse/.test(text)) return 'litige'
  if (/renvoi|renvoyer|non recue|pas recue|jamais recue|resend/.test(text)) return 'renvoi'
  if (/promesse|promise/.test(text)) return 'promesse'
  if (/rappel|callback/.test(text)) return 'rappel'
  if (/paiement|payer|payera|paye|regle|virement/.test(text)) return 'promesse'
  return 'sans_suite'
}

/** "9 800", "9800,50 €", "9 800 euros", 9800 → 9800 or 9800.5; undefined when no positive number is found. */
export function parseSpokenAmount(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined
  if (typeof value !== 'string') return undefined
  const match = /\d[\d\s  .,]*/u.exec(value)
  if (match === null) return undefined
  const amount = parseFrenchAmount(match[0].trim().replace(/[.,]$/u, ''))
  return amount !== undefined && amount > 0 ? amount : undefined
}

function text(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value.trim()
}

/**
 * The answer the tool call describes, with dates resolved against `now` (Paris calendar).
 * A date the debtor said in words (« demain ») and the agent passed verbatim is resolved here; failing that, the quote is read.
 */
export function answerFromTool(params: AnswerToolParams, now: number, source: DebtorAnswer['source'] = 'direct'): DebtorAnswer {
  const outcome = parseRelanceOutcome(params.reponse)
  const quote = text(params.citation)
  const payment = outcome === 'promesse' || outcome === 'deja_regle'
  const answer: DebtorAnswer = { outcome, notedAt: new Date(now).toISOString(), source }
  if (quote !== undefined) answer.quote = quote
  if (text(params.cause_retard) !== undefined) answer.delayReason = text(params.cause_retard)
  if (payment) {
    // A payment already made is behind us: « lundi » then means last Monday.
    const direction = outcome === 'deja_regle' ? 'passe' : 'futur'
    const date = resolveSpokenDate(params.date_reglement, now, direction) ?? resolveSpokenDate(quote, now, direction)
    if (date !== undefined) answer.promiseDate = date
    const amount = parseSpokenAmount(params.montant)
    if (amount !== undefined) answer.promiseAmountEur = amount
    // A second date without an amount is « le reste » : the engine computes it from what is owed.
    const second = outcome === 'promesse' ? resolveSpokenDate(params.date_second_reglement, now) : undefined
    if (second !== undefined) {
      answer.secondDate = second
      const secondAmount = parseSpokenAmount(params.montant_second_reglement)
      if (secondAmount !== undefined) answer.secondAmountEur = secondAmount
    }
  }
  if (outcome === 'litige') {
    if (text(params.motif_litige) !== undefined) answer.disputeReason = text(params.motif_litige)
    if (text(params.piece_manquante) !== undefined) answer.missingDocument = text(params.piece_manquante)
  }
  if (text(params.bon_interlocuteur) !== undefined) answer.rightContact = text(params.bon_interlocuteur)
  if (outcome === 'rappel') {
    const at = resolveSpokenCallback(params.rappel_le, now) ?? resolveSpokenCallback(quote, now)
    if (at !== undefined) answer.callbackAt = at
  }
  return answer
}

const CALLBACK = new Intl.DateTimeFormat('fr-FR', { timeZone: BUSINESS_TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** « jeu. 1 oct. à 14 h 30 », Paris time. */
export function formatCallback(iso: string): string {
  const parts = Object.fromEntries(CALLBACK.formatToParts(new Date(iso)).map(part => [part.type, part.value]))
  return `${parts.weekday} ${parts.day} ${parts.month} à ${Number(parts.hour)} h${parts.minute === '00' ? '' : ` ${parts.minute}`}`
}

/** One line for the CRM: what the debtor committed to, in plain French. */
export function describeAnswer(answer: DebtorAnswer): string {
  switch (answer.outcome) {
    case 'promesse': {
      const when = answer.promiseDate !== undefined ? `le ${formatDay(answer.promiseDate)}` : 'à une date à préciser'
      const first = answer.promiseAmountEur !== undefined ? `${formatEur(answer.promiseAmountEur)} ${when}` : when
      if (answer.secondDate !== undefined) return `En deux fois : ${first}, puis ${answer.secondAmountEur !== undefined ? formatEur(answer.secondAmountEur) : 'le solde'} le ${formatDay(answer.secondDate)}`
      return answer.promiseAmountEur !== undefined ? `Règlement promis : ${first}` : `Règlement promis ${first}`
    }
    case 'deja_regle':
      return `Dit avoir réglé${answer.promiseDate !== undefined ? ` le ${formatDay(answer.promiseDate)}` : ''} : virement à vérifier`
    case 'litige':
      return `Litige : ${answer.disputeReason ?? answer.missingDocument ?? 'motif à préciser'}`
    case 'renvoi':
      return answer.rightContact !== undefined ? `Facture à renvoyer à ${answer.rightContact}` : 'Facture non reçue, à renvoyer'
    case 'rappel':
      return answer.callbackAt !== undefined ? `Rappel demandé le ${formatCallback(answer.callbackAt)}` : 'Rappel demandé'
    default:
      return 'Pas de réponse exploitable'
  }
}

/** Date of payment the debtor said in the call, read from their own turns; the last one wins. */
export function dateFromTranscript(transcript: readonly TranscriptTurn[] | undefined, now: number, direction: DateDirection = 'futur'): string | undefined {
  let found: string | undefined
  for (const turn of transcript ?? []) {
    if (turn.role !== 'user') continue
    // Only sentences about paying: « on l’a reçue lundi » names the day it arrived, not a payment date.
    if (!/vir|pai|pay|regl|regl|verse|cheque|reste|solde/iu.test(turn.text.normalize('NFD').replace(/[̀-ͯ]/gu, ''))) continue
    const date = resolveSpokenDate(turn.text, now, direction)
    if (date !== undefined) found = date
  }
  return found
}

/** The debtor's last turn that mentions paying, as a quote for the CRM when the agent did not note one. */
export function quoteFromTranscript(transcript: readonly TranscriptTurn[] | undefined): string | undefined {
  const turns = (transcript ?? []).filter(turn => turn.role === 'user' && turn.text.trim().length > 8)
  const paying = [...turns].reverse().find(turn => /vir|pai|pay|regl|regl|factur|demain|semaine|mois|relev|contrat|compta|rappel/iu.test(turn.text.normalize('NFD').replace(/[̀-ͯ]/gu, '')))
  const quote = (paying ?? turns[turns.length - 1])?.text.trim()
  return quote === undefined ? undefined : quote.length > 220 ? `${quote.slice(0, 217)}…` : quote
}

/**
 * The answer with its amounts made consistent with what is still owed: the first payment defaults to the whole balance,
 * a second date without an amount takes the rest, nothing exceeds the balance, and a payment said to be already made
 * is never dated after today.
 */
export function settleAmounts(answer: DebtorAnswer, owedEur: number, today: string): DebtorAnswer {
  if (answer.outcome !== 'promesse' && answer.outcome !== 'deja_regle') return answer
  const owed = Math.round(owedEur * 100) / 100
  const cents = (value: number) => Math.round(value * 100) / 100
  const settled: DebtorAnswer = { ...answer }
  // « Le virement part demain » is a promise, whatever label it came with: a payment already made is never dated ahead.
  if (answer.outcome === 'deja_regle' && settled.promiseDate !== undefined && settled.promiseDate > today) settled.outcome = 'promesse'
  // A promise is never due in the past (« on l’a reçue hier, on va la payer »): the default date applies instead.
  if (settled.outcome === 'promesse' && settled.promiseDate !== undefined && settled.promiseDate < today) delete settled.promiseDate
  // A second payment needs a first date before it; without one, the plan is a single payment of the balance at the default date.
  if (settled.secondDate !== undefined && (settled.secondDate < today || settled.promiseDate === undefined || settled.secondDate <= settled.promiseDate)) {
    if (settled.promiseDate === undefined) delete settled.promiseAmountEur
    delete settled.secondDate
    delete settled.secondAmountEur
  }
  let first = settled.promiseAmountEur !== undefined ? Math.min(settled.promiseAmountEur, owed) : undefined
  let second = settled.secondDate !== undefined ? settled.secondAmountEur : undefined
  if (settled.secondDate !== undefined) {
    // Two dates and no amount: half each, to be confirmed by the written recap.
    if (first === undefined && second === undefined) {
      first = cents(owed / 2)
      second = cents(owed - first)
    }
    else if (first !== undefined && second === undefined) second = cents(owed - first)
    else if (first === undefined && second !== undefined) {
      second = Math.min(second, owed)
      first = cents(owed - second)
    } else if (first !== undefined && second !== undefined) second = Math.min(second, cents(owed - first))
  }
  settled.promiseAmountEur = first !== undefined && first > 0 ? first : owed
  if (second !== undefined && second > 0.01 && settled.promiseAmountEur < owed) settled.secondAmountEur = cents(second)
  else {
    delete settled.secondDate
    delete settled.secondAmountEur
  }
  return settled
}

/** Whole email addresses in `text`, accented letters included (« hélène.durand@… »), never a piece of a longer word. */
const EMAIL = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}_%+-][\p{L}\p{N}._%+-]*@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu

/** The last email address in `text`, trailing dot removed; undefined when there is none. */
export function extractEmail(text: string | undefined): string | undefined {
  let found: string | undefined
  for (const match of (text ?? '').matchAll(EMAIL)) found = match[0].replace(/\.$/u, '')
  return found
}

/** The last email address the debtor spelled out in the call, for a resend when the agent did not note it. */
export function emailFromTranscript(transcript: readonly TranscriptTurn[] | undefined): string | undefined {
  let found: string | undefined
  for (const turn of transcript ?? []) {
    if (turn.role !== 'user') continue
    found = extractEmail(turn.text) ?? found
  }
  return found
}
