import { createHash } from 'node:crypto'
import type { Prospect, Signal, SignalSource } from '../types.ts'

/**
 * Shared pieces of the watch (« veille ») sources: a signal draft, a stable id so the same finding is never
 * written twice, small HTTP helpers, and the context a source receives.
 */

export interface Draft {
  source: SignalSource
  title: string
  excerpt: string
  url?: string
  weight: Signal['weight']
  /** ISO instant of the fact; the run date when the source gives none. */
  detectedAt: string
}

/** What a source may read and update on the prospect. */
export interface WatchContext {
  prospect: Prospect
  /** Signals already on the prospect, to compare against. */
  existing: readonly Signal[]
  now: number
  log: (line: string) => void
}

export interface SourceResult {
  drafts: Draft[]
  /** Fields to merge into `prospect.veille` (snapshots for the next diff). */
  snapshot?: Partial<NonNullable<Prospect['veille']>>
  /** Dollars spent on paid APIs. */
  costUsd?: number
}

export interface WatchSource {
  key: string
  label: string
  /** Why the source cannot run (missing key…); undefined when it can. */
  unavailable: () => string | undefined
  detect: (ctx: WatchContext) => Promise<SourceResult>
}

/** Stable signal id for one finding on one prospect: writing it twice changes nothing. */
export function signalId(prospectId: string, source: SignalSource, title: string): string {
  return `s-v-${createHash('sha1').update(`${prospectId}|${source}|${title}`).digest('hex').slice(0, 12)}`
}

export function toSignal(prospectId: string, draft: Draft): Signal {
  return { id: signalId(prospectId, draft.source, draft.title), prospectId, status: 'nouveau', ...draft }
}

export const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase()

/** JSON GET with a timeout; throws a French message on failure. */
export async function getJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const response = await fetch(url, { ...init, headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; Echeance-veille/1.0)', ...init.headers }, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`${new URL(url).hostname} a répondu ${response.status}`)
  return response.json() as Promise<T>
}

export async function getText(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<string> {
  const response = await fetch(url, { ...init, headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36', ...init.headers }, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`${new URL(url).hostname} a répondu ${response.status}`)
  return response.text()
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** « 12 septembre 2026 » in Paris time from an ISO date or instant. */
export function longDay(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso))
}

/** Word stems that name the trade, not the agency. */
const GENERIC = /^(interim|travail|temporaire|emplois?|agences?|groupe?|group|france|recrut\w*|services?|grand|est|ouest|sud|nord|paris|lyon|les|des|and|et|rh|sas|sarl|staffing|societe|cie|company|holding|conseils?|consulting|solutions?|partners?|jobs?|experts?|dev|team|ressources|humaines|placement|personnel|missions?|talents?)$/u

/** Single words so common in company names that a press hit on them alone is probably another company. */
const AMBIGUOUS = new Set(['alliance', 'value', 'keys', 'best', 'globe', 'neo', 'concept', 'performance', 'select', 'premium', 'access', 'direct', 'action', 'dynamic', 'flex', 'pro', 'plus', 'top', 'start', 'link', 'connect', 'united', 'synergie', 'optimum', 'horizon', 'avenir', 'progress', 'evolution', 'excellence', 'elite', 'prestige', 'vision', 'impact', 'ideal', 'atout', 'essentiel', 'ellipse', 'alpha', 'omega', 'delta', 'first', 'one', 'new', 'next', 'smart', 'open', 'prime', 'proxi', 'axe', 'axis', 'cap', 'point', 'pole', 'reseau', 'union', 'national', 'regional', 'europe', 'international', 'batiment', 'industrie', 'ingenierie', 'logistique', 'transport', 'medical', 'sante', 'tertiaire'])

/** Distinctive words of a company name, to check a page or an ad is about it; empty when the name has none. */
export function brandWords(company: string): string[] {
  return fold(company).split(/[^a-z0-9]+/u).filter(word => word.length >= 3 && !GENERIC.test(word) && !/^\d+$/u.test(word))
}

/** True when the name is too common to search the press with (one word that many companies carry). */
export function ambiguousBrand(company: string): boolean {
  const words = brandWords(company)
  return words.length === 0 || (words.length === 1 && AMBIGUOUS.has(words[0] as string))
}

/** True when the text names the brand: short words must stand alone (« sup » must not match « support »). */
export const mentions = (text: string, words: readonly string[]) => {
  const haystack = fold(text)
  return words.some(word => (word.length >= 6 ? haystack.includes(word) : new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`, 'u').test(haystack)))
}

/** Short name to search the web with: the brand words of a long legal name, the name itself otherwise. */
export function searchName(company: string): string {
  const words = brandWords(company)
  return company.trim().split(/\s+/u).length > 2 && words.length > 0 ? words.slice(0, 2).join(' ') : company.trim()
}

/** Postal département of the prospect, from its head office address or its town's postcode. */
export function departementOf(prospect: Prospect): string | undefined {
  const postcode = /\b(\d{5})\b/u.exec(prospect.address ?? '')?.[1]
  if (postcode === undefined) return undefined
  if (postcode.startsWith('97')) return postcode.slice(0, 3)
  if (postcode.startsWith('20')) return Number(postcode) < 20200 ? '2A' : '2B'
  return postcode.slice(0, 2)
}
