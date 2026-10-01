import { departementOf, getJson, longDay, type Draft, type WatchSource } from './common.ts'

/**
 * BODACC (free, no key): what the official gazette says about the agency itself (sales of the business,
 * conciliation, collective procedures, head-office transfers, late or missing accounts) and, as local context,
 * how the collective procedures of its client sectors move in its département.
 */

const RECORDS = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records'
const EXPORT = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/exports/json'
const DAY_MS = 86_400_000

interface Row {
  id?: string
  dateparution: string
  familleavis?: string
  familleavis_lib?: string
  typeavis_lib?: string
  commercant?: string
  depot?: string | { dateCloture?: string; typeDepot?: string } | null
  jugement?: string | { nature?: string; date?: string; complementJugement?: string } | null
  modificationsgenerales?: string | { descriptif?: string } | null
  acte?: string | { typeVente?: string; descriptif?: string } | null
  listepersonnes?: string | null
  url_complete?: string
}

function obj<T>(value: string | T | null | undefined): T | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as T
  } catch {
    // Some rows carry plain text where a JSON object is expected: nothing to read then.
    return undefined
  }
}

function announceUrl(row: Row): string {
  return row.url_complete ?? 'https://www.bodacc.fr/pages/annonces-commerciales/'
}

/** Announcements about one SIREN since `since` (YYYY-MM-DD), newest first. */
async function announcements(siren: string, since: string): Promise<Row[]> {
  const params = new URLSearchParams({ where: `registre="${siren}" and dateparution>="${since}"`, order_by: 'dateparution desc', limit: '50', select: 'id,dateparution,familleavis,familleavis_lib,typeavis_lib,commercant,depot,jugement,modificationsgenerales,acte,url_complete' })
  const data = await getJson<{ results?: Row[] }>(`${RECORDS}?${params}`)
  return data.results ?? []
}

/** Client sectors of a staffing agency whose failures hurt it: building, industry, logistics, transport. */
const CLIENT_SECTORS = /b[aâ]timent|construction|ma[cç]onnerie|travaux|gros [oœ]uvre|terrassement|charpente|couverture|plomberie|chauffage|[eé]lectricit|menuiserie|peinture|carrelage|industri|m[eé]canique|m[eé]tallurg|chaudronnerie|usinage|plasturgie|agroalimentaire|logisti|transport|messagerie|entrep[oô]t|manutention/u

/** Number of collective-procedure announcements in client sectors of a département over a window. */
async function clientFailures(departement: string, from: string, to: string): Promise<number> {
  const params = new URLSearchParams({ where: `familleavis="collective" and numerodepartement="${departement}" and dateparution>="${from}" and dateparution<"${to}"`, select: 'listepersonnes', limit: '-1' })
  const rows = await getJson<Row[]>(`${EXPORT}?${params}`, {}, 40_000)
  return rows.filter(row => CLIENT_SECTORS.test((row.listepersonnes ?? '').toLowerCase())).length
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const bodacc: WatchSource = {
  key: 'bodacc',
  label: 'BODACC',
  unavailable: () => undefined,
  async detect({ prospect, now, log }) {
    const drafts: Draft[] = []
    if (prospect.siren === undefined) return { drafts }
    const rows = await announcements(prospect.siren, iso(now - 400 * DAY_MS))
    let latestClosing: string | undefined
    for (const row of rows) {
      const family = `${row.familleavis ?? ''} ${row.familleavis_lib ?? ''}`.toLowerCase()
      const when = `${row.dateparution}T09:00:00.000Z`
      if (/collective/u.test(family)) {
        const judgement = obj<{ nature?: string; date?: string; complementJugement?: string }>(row.jugement)
        const stop = /cessation des paiements[^.]*?(\d{1,2}\s+\w+\s+\d{4}|\d{2}\/\d{2}\/\d{4})/iu.exec(judgement?.complementJugement ?? '')?.[1]
        drafts.push({ source: 'bodacc', weight: 5, detectedAt: when, url: announceUrl(row), title: `Procédure collective : ${judgement?.nature ?? row.typeavis_lib ?? 'jugement'}`, excerpt: `Publié au BODACC le ${longDay(row.dateparution)}.${stop !== undefined ? ` Cessation des paiements au ${stop}.` : ''} ${(judgement?.complementJugement ?? '').slice(0, 220)}`.trim() })
      } else if (/conciliation/u.test(family)) {
        drafts.push({ source: 'bodacc', weight: 5, detectedAt: when, url: announceUrl(row), title: 'Procédure de conciliation : la trésorerie est en tension', excerpt: `Publié au BODACC le ${longDay(row.dateparution)}. Une conciliation homologuée précède souvent une restructuration de la dette.` })
      } else if (/vente|cession/u.test(family)) {
        const act = obj<{ typeVente?: string; descriptif?: string }>(row.acte)
        drafts.push({ source: 'bodacc', weight: 4, detectedAt: when, url: announceUrl(row), title: `Vente ou cession de fonds${act?.typeVente !== undefined ? ` : ${act.typeVente}` : ''}`, excerpt: `Publié au BODACC le ${longDay(row.dateparution)}. ${(act?.descriptif ?? '').slice(0, 220)}`.trim() })
      } else if (/modification/u.test(family)) {
        const change = obj<{ descriptif?: string }>(row.modificationsgenerales)
        const text = change?.descriptif ?? ''
        if (/si[eè]ge/iu.test(text)) drafts.push({ source: 'bodacc', weight: 2, detectedAt: when, url: announceUrl(row), title: 'Transfert de siège social', excerpt: `Publié au BODACC le ${longDay(row.dateparution)}. ${text.slice(0, 200)}`.trim() })
        else if (/dirigeant|g[eé]rant|pr[eé]sident|directeur/iu.test(text)) drafts.push({ source: 'rne', weight: 4, detectedAt: when, url: announceUrl(row), title: 'Changement de dirigeant publié', excerpt: `Publié au BODACC le ${longDay(row.dateparution)}. ${text.slice(0, 200)}`.trim() })
      } else if (/d[eé]p[oô]t/u.test(family)) {
        const filing = obj<{ dateCloture?: string }>(row.depot)
        if (filing?.dateCloture !== undefined && (latestClosing === undefined || filing.dateCloture > latestClosing)) latestClosing = filing.dateCloture
      }
    }
    // Accounts must be filed within seven months of the closing: a year with none past that is a sign of disorder.
    const yearEnd = prospect.veille?.fiscalYearEnd
    if (yearEnd !== undefined) {
      const last = latestClosing ?? yearEnd
      const expectedClosing = new Date(last)
      expectedClosing.setUTCFullYear(expectedClosing.getUTCFullYear() + 1)
      const deadline = expectedClosing.getTime() + 213 * DAY_MS
      if (now > deadline + 30 * DAY_MS) {
        drafts.push({ source: 'bodacc', weight: 3, detectedAt: iso(now) + 'T09:00:00.000Z', url: 'https://www.bodacc.fr/pages/annonces-commerciales/', title: `Comptes ${expectedClosing.getUTCFullYear()} non déposés`, excerpt: `Dernier dépôt connu pour l’exercice clos le ${longDay(last)} ; le suivant était attendu avant le ${longDay(new Date(deadline).toISOString())}.` })
      }
    }
    // Local context: failures of client sectors over 90 days against the same window a year earlier.
    const departement = departementOf(prospect)
    if (departement !== undefined) {
      const [recent, before] = await Promise.all([
        clientFailures(departement, iso(now - 90 * DAY_MS), iso(now)),
        clientFailures(departement, iso(now - 455 * DAY_MS), iso(now - 365 * DAY_MS)),
      ])
      log(`BODACC ${departement} : ${recent} défaillances clientes en 90 j, ${before} un an plus tôt`)
      if (before >= 5 && recent >= before * 1.3) {
        const rise = Math.round(((recent - before) / before) * 100)
        drafts.push({ source: 'bodacc', weight: 2, detectedAt: iso(now) + 'T09:00:00.000Z', url: 'https://www.bodacc.fr/pages/annonces-commerciales/', title: `Défaillances d’entreprises clientes de l’intérim : +${rise} % sur un an dans le ${departement}`, excerpt: `${recent} procédures collectives en 90 jours dans le bâtiment, l’industrie, la logistique et le transport du département, contre ${before} un an plus tôt. Contexte local, pas un client nommé de l’agence.` })
      }
    }
    return { drafts }
  },
}
