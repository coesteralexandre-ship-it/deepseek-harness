import { newLandingToken } from './tokens.ts'
import { newId } from './ids.ts'
import type { Prospect, Signal } from './types.ts'

const RECHERCHE = 'https://recherche-entreprises.api.gouv.fr/search'
const RATIOS = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/ratios_inpi_bce/records'

/** Staffing agencies (NAF 78.20Z) of one département, with their latest published customer-credit days. */
export interface RadarCompany {
  siren: string
  name: string
  city: string
  departement: string
  revenueEur?: number
  director?: { firstName: string; lastName: string; role: string }
  /** Customer credit in days (« crédit clients ») of the latest published accounts. */
  dsoDays?: number
  /** Closing date of those accounts, YYYY-MM-DD. */
  fiscalYearEnd?: string
}

export interface RadarRequest {
  /** Two-digit département, or 2A / 2B / three digits overseas. */
  departement: string
  /** Keep agencies whose customer credit is at least this many days. */
  minDsoDays: number
  /** At most this many companies looked at (pages of 25). */
  maxCompanies: number
}

interface RechercheResult {
  siren: string
  nom_complet?: string
  nom_raison_sociale?: string
  categorie_entreprise?: string | null
  siege?: { code_postal?: string | null; libelle_commune?: string | null }
  finances?: Record<string, { ca?: number | null }> | null
  dirigeants?: { nom?: string | null; prenoms?: string | null; qualite?: string | null; type_dirigeant?: string | null }[]
}

/** A public source (company directory or INPI ratios) failed; the message is French and ready to show. */
export class RadarSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RadarSourceError'
  }
}

function sourceLabel(url: string): string {
  return url.startsWith(RECHERCHE) ? 'L’annuaire des entreprises' : 'La base des ratios INPI'
}

async function getJson(url: string): Promise<unknown> {
  const label = sourceLabel(url)
  let response: Response
  try {
    response = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new RadarSourceError(timedOut ? `${label} n’a pas répondu en 15 s, réessayez dans un instant.` : `${label} est injoignable, réessayez dans un instant.`)
  }
  if (!response.ok) {
    // The directory explains a rejected request in `erreur`; the ratios API uses `message`.
    const detail = await response.json().then((data: unknown) => {
      const record = (data ?? {}) as { erreur?: unknown; message?: unknown }
      return typeof record.erreur === 'string' ? record.erreur : typeof record.message === 'string' ? record.message : undefined
    }, () => undefined)
    if (response.status === 429) throw new RadarSourceError(`${label} limite le nombre de requêtes, réessayez dans une minute.`)
    if (response.status >= 500) throw new RadarSourceError(`${label} est indisponible (erreur ${response.status}), réessayez plus tard.`)
    throw new RadarSourceError(`${label} a refusé la recherche (erreur ${response.status})${detail !== undefined ? ` : ${detail}` : '.'}`)
  }
  return response.json()
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}

/** « PROMAN 116 (PROMAN) » → « Proman » ; « INTERIM DES VALLEES » → « Interim Des Vallees ». */
function shortName(name: string): string {
  const inBrackets = /\(([^)]+)\)/u.exec(name)
  const base = (inBrackets?.[1]?.split(',')[0] ?? name.split('(')[0] ?? name).replace(/\b(SAS|SASU|SARL|SA|EURL|SNC)\b/gu, '').trim()
  return titleCase(base)
}

function departementOf(postcode: string): string {
  if (postcode.startsWith('97')) return postcode.slice(0, 3)
  if (postcode.startsWith('20')) return ['200', '201'].includes(postcode.slice(0, 3)) ? '2A' : '2B'
  return postcode.slice(0, 2)
}

/** Active small and mid-sized agencies (PME) of the département from the public company directory, head office in the département. */
async function agencies(request: RadarRequest): Promise<RadarCompany[]> {
  const found = new Map<string, RadarCompany>()
  // About half the PME returned have their head office elsewhere, so read up to three times the pages the target needs.
  for (let page = 1; found.size < request.maxCompanies && page <= Math.ceil(request.maxCompanies / 25) * 3; page += 1) {
    const params = new URLSearchParams({ activite_principale: '78.20Z', etat_administratif: 'A', categorie_entreprise: 'PME', departement: request.departement, per_page: '25', page: String(page) })
    const data = await getJson(`${RECHERCHE}?${params}`) as { results?: RechercheResult[]; total_pages?: number }
    for (const result of data.results ?? []) {
      const postcode = result.siege?.code_postal ?? ''
      // The département filter matches any establishment; the head office must be local, and national groups are not the target.
      if (departementOf(postcode) !== request.departement || result.categorie_entreprise === 'GE') continue
      const years = Object.keys(result.finances ?? {}).sort().reverse()
      const revenue = years[0] !== undefined ? result.finances?.[years[0]]?.ca ?? undefined : undefined
      const director = (result.dirigeants ?? []).find(person => person.type_dirigeant === 'personne physique' && !/commissaire|membre/iu.test(person.qualite ?? ''))
      found.set(result.siren, {
        siren: result.siren,
        name: shortName(result.nom_complet ?? result.nom_raison_sociale ?? result.siren),
        city: titleCase(result.siege?.libelle_commune ?? ''),
        departement: request.departement,
        revenueEur: revenue ?? undefined,
        director: director === undefined ? undefined : { firstName: titleCase((director.prenoms ?? '').split(' ')[0] ?? ''), lastName: titleCase(director.nom ?? ''), role: director.qualite ?? 'Dirigeant' },
      })
      if (found.size >= request.maxCompanies) break
    }
    if (page >= (data.total_pages ?? 1)) break
    await sleep(160) // the directory asks for at most 7 requests per second
  }
  return [...found.values()]
}

/** Customer-credit days of each SIREN's newest filing from the public INPI ratios, 40 SIREN per request; dropped when older than `minYear` or implausible. */
async function customerCredit(sirens: readonly string[], minYear: number): Promise<Map<string, { days: number; yearEnd: string }>> {
  const out = new Map<string, { days: number; yearEnd: string }>()
  const seen = new Set<string>()
  for (let i = 0; i < sirens.length; i += 40) {
    const batch = sirens.slice(i, i + 40)
    const params = new URLSearchParams({
      where: `siren in (${batch.map(siren => `"${siren}"`).join(',')})`,
      select: 'siren,date_cloture_exercice,credit_clients_jours',
      order_by: 'date_cloture_exercice desc',
      limit: '100',
    })
    const data = await getJson(`${RATIOS}?${params}`) as { results?: { siren: string; date_cloture_exercice?: string; credit_clients_jours?: number | null }[] }
    for (const row of data.results ?? []) {
      const days = row.credit_clients_jours
      // Rows come newest first. Only the newest filing counts, and only if it is recent and plausible: older accounts or
      // values past 200 days (holding structures, typing errors in the filing) would make a false opening line.
      if (out.has(row.siren) || seen.has(row.siren)) continue
      seen.add(row.siren)
      const year = Number((row.date_cloture_exercice ?? '').slice(0, 4))
      if (typeof days !== 'number' || days < 10 || days > 200 || !(year >= minYear)) continue
      out.set(row.siren, { days: Math.round(days), yearEnd: row.date_cloture_exercice ?? '' })
    }
    await sleep(200)
  }
  return out
}

export interface RadarResult {
  scanned: number
  withAccounts: number
  /** Median customer credit of the agencies with published accounts. */
  medianDays?: number
  kept: RadarCompany[]
  /** Brands with several companies above the threshold; only the first of each is kept. */
  networks: { brand: string; count: number }[]
}

/** First significant word of a company name, used to spot the companies of one franchise network. */
function brandOf(name: string): string {
  const words = name.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().split(/[^a-z0-9]+/u).filter(word => word.length >= 3 && !['interim', 'travail', 'temporaire', 'emploi', 'agence', 'groupe', 'les', 'des'].includes(word))
  return words[0] ?? name.toLowerCase()
}

/** Median of ascending `sorted` values, the two middle ones averaged and rounded for an even count; undefined when empty. */
export function median(sorted: readonly number[]): number | undefined {
  const n = sorted.length
  if (n === 0) return undefined
  const mid = Math.floor(n / 2)
  return n % 2 === 1 ? sorted[mid] : Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2)
}

/** Scan a département and keep the agencies whose published customer credit is at or above the threshold, longest first. */
export async function scanDepartement(request: RadarRequest): Promise<RadarResult> {
  const companies = await agencies(request)
  // Accounts closed within the last three calendar years.
  const credit = await customerCredit(companies.map(company => company.siren), new Date().getFullYear() - 3)
  const withAccounts = companies.filter(company => credit.has(company.siren)).map(company => ({ ...company, dsoDays: credit.get(company.siren)?.days, fiscalYearEnd: credit.get(company.siren)?.yearEnd }))
  const sorted = withAccounts.map(company => company.dsoDays as number).sort((a, b) => a - b)
  const medianDays = median(sorted)
  // Franchise networks register one company per territory (« Domino Occitanie », « Domino Care »…): keep the longest delay per brand.
  const brands = new Map<string, number>()
  const kept: RadarCompany[] = []
  for (const company of withAccounts.filter(entry => (entry.dsoDays ?? 0) >= request.minDsoDays).sort((a, b) => (b.dsoDays ?? 0) - (a.dsoDays ?? 0))) {
    const brand = brandOf(company.name)
    brands.set(brand, (brands.get(brand) ?? 0) + 1)
    if (brands.get(brand) === 1) kept.push(company)
  }
  return { scanned: companies.length, withAccounts: withAccounts.length, medianDays, kept, networks: [...brands.entries()].filter(([, count]) => count > 1).map(([brand, count]) => ({ brand, count })) }
}

/** A new prospect and its signal for one radar hit. The phone stays empty: the directory does not publish it. */
export function prospectFromRadar(company: RadarCompany, medianDays: number | undefined, sampleSize: number, now: number): { prospect: Prospect; signal: Signal } {
  const iso = new Date(now).toISOString()
  const year = company.fiscalYearEnd?.slice(0, 4) ?? ''
  const id = newId('p')
  const comparison = medianDays !== undefined ? `, contre ${medianDays} en médiane pour les ${sampleSize} agences du ${company.departement} aux comptes publiés` : ''
  return {
    prospect: {
      id,
      siren: company.siren,
      landingToken: newLandingToken(),
      company: company.name,
      city: company.city,
      headcount: company.revenueEur !== undefined ? `CA ${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(company.revenueEur / 1_000_000)} M€` : 'CA non publié',
      contact: { firstName: company.director?.firstName ?? '', lastName: company.director?.lastName ?? '', role: company.director?.role ?? 'Dirigeant', phone: '' },
      stage: 'nouveau',
      angle: `Vos comptes ${year} indiquent ${company.dsoDays} jours de délai client${comparison}. Chaque jour gagné libère de la trésorerie avant la paie.`,
      calls: [],
      createdAt: iso,
      updatedAt: iso,
    },
    signal: {
      id: newId('s'),
      prospectId: id,
      source: 'pappers',
      title: `Délai client de ${company.dsoDays} jours (comptes ${year})`,
      excerpt: `Ratios INPI publics${medianDays !== undefined ? `. Médiane de l’échantillon : ${medianDays} jours sur ${sampleSize} agences` : ''}. SIREN ${company.siren}.`,
      url: `https://annuaire-entreprises.data.gouv.fr/entreprise/${company.siren}`,
      detectedAt: iso,
      weight: (company.dsoDays ?? 0) >= 80 ? 5 : 4,
      status: 'nouveau',
    },
  }
}
