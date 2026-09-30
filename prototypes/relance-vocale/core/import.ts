import { z } from 'zod'
import { parseFrenchAmount, parseFrenchDate, toE164 } from './tabular.ts'

/** Fields an aged-balance export can carry, in the order the preview shows them. */
export const IMPORT_FIELDS = ['company', 'number', 'amount', 'dueDate', 'contactName', 'email', 'phone', 'mission'] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

export const IMPORT_FIELD_META: Record<ImportField, { label: string; required: boolean }> = {
  company: { label: 'Client', required: true },
  number: { label: 'N° de facture', required: true },
  amount: { label: 'Montant TTC', required: true },
  dueDate: { label: 'Échéance', required: true },
  contactName: { label: 'Contact', required: false },
  email: { label: 'Email', required: false },
  phone: { label: 'Téléphone', required: false },
  mission: { label: 'Objet', required: false },
}

/** Limits of one imported invoice, shared by the browser check (`readRows`) and the import route. */
export const IMPORT_LIMITS = { company: 200, number: 80, amountEur: 100_000_000, contactName: 120, email: 200, mission: 300 } as const

/** Most rows the import route accepts in one request; the browser sends bigger balances in several requests. */
export const IMPORT_BATCH_MAX = 2000

/** Server schema of one row. `readRows` only produces rows that pass it. */
export const IMPORT_ROW = z.object({
  company: z.string().trim().min(1).max(IMPORT_LIMITS.company),
  number: z.string().trim().min(1).max(IMPORT_LIMITS.number),
  amountEur: z.number().positive().max(IMPORT_LIMITS.amountEur),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contactName: z.string().trim().max(IMPORT_LIMITS.contactName).optional(),
  email: z.string().trim().email().max(IMPORT_LIMITS.email).optional(),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
  mission: z.string().trim().max(IMPORT_LIMITS.mission).optional(),
})

/**
 * Header patterns for each field, strongest first, as they appear in the exports of Sage, Pennylane, Cegid, EBP and
 * intérim software. A pattern matches when its words appear in the header in this order (« Nom du client » matches
 * « nom client »), or when the glued header equals the glued pattern (« NUMFACTURE »).
 */
const PATTERNS: Record<ImportField, [pattern: string, weight: number][]> = {
  company: [['raison sociale', 10], ['nom client', 9], ['libelle tiers', 9], ['client', 6], ['tiers', 6], ['societe', 6], ['debiteur', 6], ['customer', 6], ['entreprise', 6], ['denomination', 6]],
  number: [['numero facture', 10], ['n facture', 10], ['no facture', 10], ['num facture', 10], ['invoice number', 10], ['ref facture', 9], ['reference facture', 9], ['numero piece', 9], ['n piece', 9], ['no piece', 9], ['num piece', 9], ['facture', 6], ['invoice', 6], ['piece', 5], ['reference', 4], ['ref', 4], ['numero', 3], ['num', 3], ['n', 3], ['no', 3]],
  // What is still owed comes before the invoice total: a client who paid part of it is chased for the rest only.
  amount: [['reste du', 12], ['reste a payer', 12], ['restant du', 12], ['montant restant', 11], ['montant du', 11], ['solde du', 11], ['outstanding', 11], ['reste', 10], ['solde', 10], ['balance', 9], ['montant ttc', 8], ['total ttc', 8], ['ttc', 7], ['net a payer', 7], ['montant', 5], ['amount', 5], ['total', 4]],
  dueDate: [['date echeance', 10], ['due date', 10], ['date limite', 9], ['date ech', 9], ['date due', 9], ['echeance', 9], ['exigibilite', 7]],
  contactName: [['nom contact', 9], ['contact', 6], ['interlocuteur', 6], ['responsable', 5], ['destinataire', 5]],
  email: [['adresse mail', 9], ['email', 8], ['e mail', 8], ['mail', 8], ['courriel', 8]],
  phone: [['numero telephone', 9], ['telephone', 8], ['tel', 8], ['phone', 8], ['portable', 7], ['mobile', 7], ['gsm', 6]],
  mission: [['objet', 7], ['mission', 7], ['designation', 6], ['description', 6], ['prestation', 6], ['libelle', 5], ['commentaire', 3]],
}

/** A header holding one of these words never maps to the field: « Date facture » is not a number, « Durée » not an amount. */
const VETO: Record<ImportField, string[]> = {
  company: ['date', 'echeance', 'montant', 'solde', 'total', 'ttc', 'mail', 'email', 'courriel', 'tel', 'telephone', 'phone', 'portable', 'mobile', 'contact', 'interlocuteur', 'adresse', 'ville', 'pays'],
  number: ['date', 'echeance', 'montant', 'solde', 'total', 'ttc', 'ht', 'tva', 'client', 'tiers', 'societe', 'tel', 'telephone', 'phone', 'mail', 'email', 'contact', 'siret', 'siren', 'compte'],
  amount: ['date', 'duree', 'echeance', 'jours', 'retard', 'n', 'no', 'num', 'numero', 'tva', 'taux', 'client', 'tiers'],
  dueDate: ['jours', 'retard', 'nombre', 'nb'],
  contactName: ['tel', 'telephone', 'phone', 'portable', 'mobile', 'fax', 'mail', 'email', 'courriel', 'adresse', 'code', 'id'],
  email: [],
  phone: ['fax'],
  mission: ['tiers', 'client'],
}

/** Words that make a client column an identifier (« Code client », « N° client »): kept only when no better column exists. */
const COMPANY_IDENTIFIER = new Set(['code', 'compte', 'id', 'identifiant', 'ref', 'reference', 'n', 'no', 'num', 'numero', 'siret', 'siren', 'tva'])

/** Plural « s » dropped so « Échéances » and « Échéance » compare equal. */
const singular = (word: string) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word)

/** Header split into lower-case, accent-free words: « Tél. contact » → [tel, contact], « MontantTTC » → [montant, ttc]. */
function headerWords(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(word => word !== '')
    .map(singular)
}

/** True when `pattern` appears in `words` in order, gaps allowed. */
function inOrder(words: readonly string[], pattern: readonly string[]): boolean {
  let at = 0
  for (const word of words) if (word === pattern[at]) at += 1
  return at === pattern.length
}

const VETO_WORDS = Object.fromEntries(IMPORT_FIELDS.map(field => [field, new Set(VETO[field].map(singular))])) as Record<ImportField, Set<string>>

/** Score of `header` for `field`: weight of the strongest matching pattern, a little more when it is the whole header, 0 when nothing matches. */
function scoreHeader(words: readonly string[], field: ImportField): number {
  if (words.length === 0 || words.some(word => VETO_WORDS[field].has(word))) return 0
  const glued = words.join('')
  let best = 0
  for (const [pattern, weight] of PATTERNS[field]) {
    const parts = pattern.split(' ').map(singular)
    const whole = glued === parts.join('')
    if (!whole && !inOrder(words, parts)) continue
    let score = weight + (whole ? 0.5 : 0)
    if (field === 'company' && words.some(word => COMPANY_IDENTIFIER.has(word))) score = Math.min(score, 2)
    best = Math.max(best, score)
  }
  return best
}

/**
 * Column index for each field guessed from the header row; -1 when no header matches.
 * Every (column, field) pair is scored, then the strongest pairs are kept first, so each column goes to the field it
 * describes best: « Tél. contact » is a phone, and « Code client » loses to « Client » or « Raison sociale ».
 */
export function guessMapping(header: readonly string[]): Record<ImportField, number> {
  const words = header.map(headerWords)
  const pairs: { field: ImportField; column: number; score: number; order: number }[] = []
  IMPORT_FIELDS.forEach((field, order) => {
    words.forEach((columnWords, column) => {
      const score = scoreHeader(columnWords, field)
      if (score > 0) pairs.push({ field, column, score, order })
    })
  })
  pairs.sort((a, b) => b.score - a.score || a.order - b.order || a.column - b.column)
  const mapping = Object.fromEntries(IMPORT_FIELDS.map(field => [field, -1])) as Record<ImportField, number>
  const taken = new Set<number>()
  for (const { field, column } of pairs) {
    if (mapping[field] !== -1 || taken.has(column)) continue
    mapping[field] = column
    taken.add(column)
  }
  return mapping
}

/** One invoice ready to import, with every field normalized. */
export interface ImportRow {
  company: string
  number: string
  amountEur: number
  /** YYYY-MM-DD. */
  dueDate: string
  contactName?: string
  email?: string
  phone?: string
  mission?: string
}

export interface ImportCheck {
  rows: ImportRow[]
  /** Source line (1-based, header excluded) and the reason it was skipped. */
  rejected: { line: number; reason: string }[]
}

/**
 * Turn table rows into invoices using `mapping`. A row without a client, a number, a positive amount or a valid date,
 * or beyond the server limits, is rejected with the reason; an invalid email is dropped and a long label shortened.
 * Every returned row passes `IMPORT_ROW`, so one bad cell never makes the server refuse the whole batch.
 */
export function readRows(rows: readonly string[][], mapping: Record<ImportField, number>): ImportCheck {
  const out: ImportRow[] = []
  const rejected: { line: number; reason: string }[] = []
  const cell = (row: readonly string[], field: ImportField) => (mapping[field] >= 0 ? (row[mapping[field]] ?? '').trim() : '')
  rows.forEach((row, index) => {
    const line = index + 1
    const company = cell(row, 'company')
    const number = cell(row, 'number')
    const amount = parseFrenchAmount(cell(row, 'amount'))
    const cents = amount === undefined ? undefined : Math.round(amount * 100)
    const dueDate = parseFrenchDate(cell(row, 'dueDate'))
    if (company === '') return void rejected.push({ line, reason: 'client manquant' })
    if (company.length > IMPORT_LIMITS.company) return void rejected.push({ line, reason: `nom du client trop long (plus de ${IMPORT_LIMITS.company} caractères)` })
    if (number === '') return void rejected.push({ line, reason: 'numéro de facture manquant' })
    if (number.length > IMPORT_LIMITS.number) return void rejected.push({ line, reason: `numéro de facture trop long (plus de ${IMPORT_LIMITS.number} caractères)` })
    if (cents === undefined || cents <= 0) return void rejected.push({ line, reason: 'montant absent, nul ou négatif (avoir)' })
    if (cents / 100 > IMPORT_LIMITS.amountEur) return void rejected.push({ line, reason: 'montant trop élevé' })
    if (dueDate === undefined) return void rejected.push({ line, reason: `échéance illisible « ${cell(row, 'dueDate')} »` })
    const email = cell(row, 'email')
    const contactName = cell(row, 'contactName')
    const mission = cell(row, 'mission')
    const candidate: ImportRow = {
      company,
      number,
      amountEur: cents / 100,
      dueDate,
      contactName: contactName === '' ? undefined : contactName.slice(0, IMPORT_LIMITS.contactName).trim(),
      email: email !== '' && IMPORT_ROW.shape.email.safeParse(email).success ? email : undefined,
      phone: toE164(cell(row, 'phone')),
      mission: mission === '' ? undefined : mission.slice(0, IMPORT_LIMITS.mission).trim(),
    }
    const checked = IMPORT_ROW.safeParse(candidate)
    if (!checked.success) return void rejected.push({ line, reason: `valeur refusée (${checked.error.issues[0]?.path.join('.') ?? 'inconnue'})` })
    out.push(candidate)
  })
  return { rows: out, rejected }
}
