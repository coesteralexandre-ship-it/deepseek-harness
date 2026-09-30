import { formatEur } from './format.ts'
import { newId } from './ids.ts'
import { keepPromise, logActivity, markPaid } from './receivables.ts'
import { normalizeKey, parseFrenchAmount, parseFrenchDate } from './tabular.ts'
import type { Invoice, PaymentPromise } from './types.ts'

/** One credit on the bank statement. */
export interface BankCredit {
  /** Position in the pasted statement, stable across analyze and apply. */
  id: number
  /** YYYY-MM-DD when readable. */
  date?: string
  label: string
  amountEur: number
  /** Date, amount and label of the credit, plus its rank among identical lines: the same transfer pasted twice keeps it. */
  fingerprint: string
  /** Set when this credit was already applied to an invoice by an earlier reconciliation. */
  alreadyApplied?: { invoiceId: string; company: string; number: string }
}

/** Fingerprint of a credit without its rank: date, amount in cents and label normalized. */
export function creditFingerprint(credit: Pick<BankCredit, 'date' | 'label' | 'amountEur'>): string {
  return `${credit.date ?? ''}|${credit.amountEur.toFixed(2)}|${normalizeKey(credit.label)}`
}

/** A fingerprint sent back by the client is kept only when it describes that same credit. */
export function checkedFingerprint(credit: Pick<BankCredit, 'date' | 'label' | 'amountEur'> & { fingerprint?: string }): string {
  const base = creditFingerprint(credit)
  const sent = credit.fingerprint
  if (sent === undefined || !sent.startsWith(base)) return base
  return sent === base || /^#\d+$/u.test(sent.slice(base.length)) ? sent : base
}

const HEADER_WORDS = ['date', 'libelle', 'description', 'detail', 'label', 'intitule', 'operation', 'nature', 'type', 'reference', 'montant', 'amount', 'somme', 'credit', 'debit', 'valeur', 'devise', 'solde']

const isDate = (cell: string) => parseFrenchDate(cell) !== undefined
const isAmount = (cell: string) => parseFrenchAmount(cell) !== undefined

/** A header row holds no date and no amount, and one of its cells is or starts with a known column name. */
function isHeaderRow(row: readonly string[]): boolean {
  const cells = row.filter(cell => cell.trim() !== '')
  if (cells.length === 0 || cells.some(cell => isDate(cell) || isAmount(cell))) return false
  return cells.some(cell => {
    const key = normalizeKey(cell)
    return HEADER_WORDS.some(word => key === word || key.startsWith(word))
  })
}

/** First free column named after one of the words, by word priority: exact names first, then names containing the word. */
function pickColumn(keys: readonly string[], words: readonly string[], taken: ReadonlySet<number>, accept: (key: string) => boolean = () => true): number {
  const free = (key: string, index: number) => !taken.has(index) && accept(key)
  for (const word of words) {
    const index = keys.findIndex((key, i) => key === word && free(key, i))
    if (index >= 0) return index
  }
  for (const word of words) {
    const index = keys.findIndex((key, i) => key.includes(word) && free(key, i))
    if (index >= 0) return index
  }
  return -1
}

interface Layout {
  dateCol: number
  labelCol: number
  /** Column read as credits only (Débit/Crédit layout), or -1. */
  creditCol: number
  /** Signed amount column, used when there is no credit column, or -1. */
  amountCol: number
}

function headerLayout(header: readonly string[]): Layout {
  const keys = header.map(normalizeKey)
  const dateCol = pickColumn(keys, ['dateoperation', 'datedoperation', 'datecomptable', 'date', 'datedevaleur', 'datevaleur', 'transactiondate', 'bookingdate', 'postingdate'], new Set(), key => key.startsWith('date') || key.endsWith('date'))
  const labelCol = pickColumn(keys, ['libelle', 'description', 'detail', 'label', 'intitule', 'operation', 'nature'], new Set([dateCol]), key => !key.startsWith('date') && !key.endsWith('date'))
  const taken = new Set([dateCol, labelCol])
  const creditCol = pickColumn(keys, ['credit'], taken)
  const amountCol = creditCol >= 0 ? -1 : pickColumn(keys, ['montant', 'amount', 'somme'], taken)
  return { dateCol, labelCol, creditCol, amountCol }
}

/** Without a header, columns are told apart by their content. Two amount columns never filled on the same row are Débit then Crédit. */
function inferredLayout(rows: readonly string[][]): Layout {
  const width = Math.max(...rows.map(row => row.length))
  const values = (col: number) => rows.map(row => (row[col] ?? '').trim()).filter(value => value !== '')
  const columns = Array.from({ length: width }, (_, col) => col)
  const dateLike = (col: number) => values(col).length > 0 && values(col).every(isDate)
  const dateCol = columns.find(dateLike) ?? -1
  const amountLike = (col: number) => col !== dateCol && !dateLike(col) && values(col).every(isAmount)
  const labelCol = columns.find(col => col !== dateCol && values(col).length > 0 && !amountLike(col)) ?? -1
  const amounts = columns.filter(col => col !== labelCol && amountLike(col))
  const filled = (row: readonly string[], col: number) => (row[col] ?? '').trim() !== ''
  const [first, second] = amounts
  if (first !== undefined && second !== undefined && !rows.some(row => filled(row, first) && filled(row, second))) return { dateCol, labelCol, creditCol: second, amountCol: -1 }
  return { dateCol, labelCol, creditCol: -1, amountCol: first ?? -1 }
}

/**
 * Credits of a bank statement pasted as a table. Finds the date, label and amount columns from the header
 * (« Date », « Libellé », « Montant » or « Crédit »/« Débit »), or from the content when there is none, and keeps positive amounts only.
 */
export function readStatement(rows: readonly string[][]): BankCredit[] {
  if (rows.length === 0) return []
  const hasHeader = isHeaderRow(rows[0] ?? [])
  const body = hasHeader ? rows.slice(1) : rows
  if (body.length === 0) return []
  const { dateCol, labelCol, creditCol, amountCol } = hasHeader ? headerLayout(rows[0] ?? []) : inferredLayout(body)
  const credits: BankCredit[] = []
  const seen = new Map<string, number>()
  body.forEach((row, index) => {
    const raw = creditCol >= 0 ? row[creditCol] ?? '' : amountCol >= 0 ? row[amountCol] ?? '' : ''
    const amount = parseFrenchAmount(raw)
    if (amount === undefined || amount <= 0) return
    const credit = { date: dateCol >= 0 ? parseFrenchDate(row[dateCol] ?? '') : undefined, label: labelCol >= 0 ? row[labelCol] ?? '' : row.join(' '), amountEur: Math.round(amount * 100) / 100 }
    const base = creditFingerprint(credit)
    const rank = (seen.get(base) ?? 0) + 1
    seen.set(base, rank)
    credits.push({ id: index, ...credit, fingerprint: rank > 1 ? `${base}#${rank}` : base })
  })
  return credits
}

/** Invoice each recorded credit fingerprint was applied to. */
function appliedFingerprints(invoices: readonly Invoice[]): Map<string, Invoice> {
  const applied = new Map<string, Invoice>()
  for (const invoice of invoices) for (const fingerprint of invoice.reconciledCredits ?? []) applied.set(fingerprint, invoice)
  return applied
}

/** Flag the credits an earlier reconciliation already applied, with the invoice they went to. */
export function markAppliedCredits(credits: readonly BankCredit[], invoices: readonly Invoice[]): BankCredit[] {
  const applied = appliedFingerprints(invoices)
  return credits.map(credit => {
    const invoice = applied.get(credit.fingerprint)
    return invoice === undefined ? credit : { ...credit, alreadyApplied: { invoiceId: invoice.id, company: invoice.debtor.company, number: invoice.number } }
  })
}

export type MatchConfidence = 'sure' | 'probable' | 'faible'

export interface Match {
  creditId: number
  invoiceId: string
  company: string
  number: string
  score: number
  confidence: MatchConfidence
  /** What the credit settles: the whole invoice, or one promise. */
  settles: 'facture' | 'promesse'
  /** The credit covers only part of what is still owed: recorded as an instalment. */
  partial: boolean
  reasons: string[]
}

/** Words of a company name long enough to identify it in a bank label (« Bâti Rhône SAS » → bati, rhone). */
function nameTokens(company: string): string[] {
  const stop = new Set(['sas', 'sarl', 'sasu', 'eurl', 'france', 'groupe', 'societe', 'des', 'les', 'du', 'de', 'la', 'le', 'et'])
  return company.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().split(/[^a-z0-9]+/u).filter(word => word.length >= 3 && !stop.has(word))
}

/** Label with separators inside references dropped (« F-2026-0958 » → « f20260958 ») and every other gap kept as a space. */
function referenceText(label: string): string {
  return label.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().replace(/[-/._]/gu, '').replace(/[^a-z0-9]+/gu, ' ')
}

/** The reference appears in the text as a whole number: no digit right before or after it (F-2026-09 is not in F-2026-0958). */
function hasReference(text: string, reference: string): boolean {
  const whole = new RegExp(`(?<![0-9])${reference}(?![0-9])`, 'u')
  // Also try the label with its spaces removed, for « VIR F 2026 0958 »; the digit boundaries still apply.
  return whole.test(text) || whole.test(text.replace(/\s+/gu, ''))
}

/** Amount still owed: the invoice minus the promises already kept. */
export function remainingEur(invoice: Invoice): number {
  const kept = invoice.promises.filter(promise => promise.status === 'tenue').reduce((sum, promise) => sum + promise.amountEur, 0)
  return Math.round((invoice.amountEur - kept) * 100) / 100
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.011

/** The open promise of exactly this amount, if any. */
function promiseFor(invoice: Invoice, amountEur: number): PaymentPromise | undefined {
  return invoice.promises.find(promise => promise.status === 'attendue' && same(promise.amountEur, amountEur))
}

/**
 * Best open invoice for each credit. Score: invoice number in the label 60, company name 30,
 * exact amount of an open promise 45, of the amount still owed 40. « sure » needs 90, a matching amount and a clear lead over the runner-up.
 * An invoice is proposed for one credit at most; a credit already applied by an earlier reconciliation is never proposed again.
 */
export function matchCredits(credits: readonly BankCredit[], invoices: readonly Invoice[]): Match[] {
  const applied = appliedFingerprints(invoices)
  const open = invoices.filter(invoice => invoice.status !== 'encaissee')
  const scored = credits.filter(credit => !applied.has(credit.fingerprint)).map(credit => {
    const reference = referenceText(credit.label)
    const words = credit.label.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase()
    const candidates = open.map(invoice => {
      const reasons: string[] = []
      let score = 0
      const number = normalizeKey(invoice.number)
      const shortNumber = number.replace(/^[a-z]+/u, '')
      if (number.length >= 4 && (hasReference(reference, number) || (shortNumber.length >= 6 && hasReference(reference, shortNumber)))) {
        score += 60
        reasons.push(`numéro ${invoice.number} dans le libellé`)
      }
      const tokens = nameTokens(invoice.debtor.company)
      if (tokens.length > 0 && tokens.filter(token => words.includes(token)).length >= Math.min(2, tokens.length)) {
        score += 30
        reasons.push(`nom « ${invoice.debtor.company} » dans le libellé`)
      }
      const promise = promiseFor(invoice, credit.amountEur)
      let settles: Match['settles'] = 'facture'
      let amountMatch = false
      if (promise !== undefined && !same(promise.amountEur, remainingEur(invoice))) {
        score += 45
        settles = 'promesse'
        amountMatch = true
        reasons.push(`montant de la promesse (${formatEur(promise.amountEur, true)})`)
      } else if (same(remainingEur(invoice), credit.amountEur)) {
        score += 40
        amountMatch = true
        reasons.push(`montant dû (${formatEur(remainingEur(invoice), true)})`)
      }
      return { invoice, score, reasons, settles, amountMatch, partial: settles === 'facture' && credit.amountEur + 0.011 < remainingEur(invoice) }
    }).filter(candidate => candidate.score >= 40).sort((a, b) => b.score - a.score)
    return { credit, candidates }
  })
  // Highest scores claim their invoice first, so one transfer cannot settle two invoices and vice versa.
  const flat = scored.flatMap(({ credit, candidates }) => candidates.map((candidate, rank) => ({ credit, candidate, lead: candidate.score - (candidates[rank + 1]?.score ?? 0) })))
  flat.sort((a, b) => b.candidate.score - a.candidate.score || b.lead - a.lead)
  const usedCredits = new Set<number>()
  const usedInvoices = new Set<string>()
  const matches: Match[] = []
  for (const { credit, candidate, lead } of flat) {
    if (usedCredits.has(credit.id) || usedInvoices.has(candidate.invoice.id)) continue
    usedCredits.add(credit.id)
    usedInvoices.add(candidate.invoice.id)
    const confidence: MatchConfidence = candidate.score >= 90 && lead >= 30 && candidate.amountMatch ? 'sure' : candidate.score >= 70 ? 'probable' : 'faible'
    matches.push({ creditId: credit.id, invoiceId: candidate.invoice.id, company: candidate.invoice.debtor.company, number: candidate.invoice.number, score: candidate.score, confidence, settles: candidate.settles, partial: candidate.partial, reasons: candidate.reasons })
  }
  return matches.sort((a, b) => a.creditId - b.creditId)
}

/**
 * Apply one validated credit: keep the open promise of the same amount, or close the invoice, or record an instalment.
 * The credit's fingerprint is stored on the invoice; a credit already recorded there leaves the invoice unchanged.
 */
export function applyCredit(invoice: Invoice, credit: BankCredit, now: number): Invoice {
  const recorded = invoice.reconciledCredits ?? []
  if (recorded.includes(credit.fingerprint)) return invoice
  const logged = logActivity({ ...invoice, reconciledCredits: [...recorded, credit.fingerprint] }, { kind: 'paiement', actor: 'vous', title: `Virement rapproché : ${formatEur(credit.amountEur, true)}`, detail: `${credit.date ?? ''} ${credit.label}`.trim() }, now)
  const promise = promiseFor(logged, credit.amountEur)
  if (promise !== undefined) return keepPromise(logged, promise.id, now, 'vous')
  if (credit.amountEur + 0.011 >= remainingEur(logged)) return markPaid(logged, now, 'vous')
  // A partial transfer with no promise to match: kept as a settled instalment so the amount still owed goes down.
  const instalment = { id: newId('pr'), amountEur: credit.amountEur, dueDate: credit.date ?? new Date(now).toISOString().slice(0, 10), status: 'tenue' as const, confirmedAt: new Date(now).toISOString() }
  const owed = remainingEur({ ...logged, promises: [...logged.promises, instalment] })
  // An open promise larger than what is still owed now covers only the balance.
  const promises = logged.promises.map(entry => (entry.status === 'attendue' && entry.amountEur > owed ? { ...entry, amountEur: owed } : entry))
  const withInstalment = { ...logged, promises: [...promises, instalment] }
  return { ...withInstalment, knows: `Acompte reçu : ${formatEur(credit.amountEur)}, reste ${formatEur(remainingEur(withInstalment))}` }
}
