import type { ContactPoint, Enrichment, Prospect, TeamGroup, TeamMember } from './types.ts'

/**
 * Prospect enrichment from public sources: the company website (read directly, free), LinkedIn through
 * Exa (`category: people`, about 0,007 $ a search) and Google through Serper (1 credit a query, used only
 * when Exa and the website leave a gap). Server only: reads EXA_API_KEY and SERPER_API_KEY.
 *
 * Only business contact points are kept (switchboard, agency lines, generic addresses published by the
 * company). Personal mobiles are never looked up here: calling them with the voice agent would need consent.
 */

const EXA = 'https://api.exa.ai/search'
const SERPER = 'https://google.serper.dev'

/** Directories and job boards: never the company's own website. */
const NOT_A_SITE = ['linkedin.com', 'societe.com', 'pappers.fr', 'verif.com', 'indeed.com', 'hellowork.com', 'annuaire-entreprises.data.gouv.fr', 'infogreffe.fr', 'manageo.fr', 'pagesjaunes.fr', 'facebook.com', 'instagram.com', 'welcometothejungle.com', 'glassdoor.fr', 'corporama.com', 'kompass.com', 'lefigaro.fr', 'bodacc.fr', 'data.gouv.fr', 'exa.ai', 'youtube.com', 'x.com', 'twitter.com', 'mappy.com', 'yelp.fr', 'jobteaser.com', 'meteojob.com', 'apec.fr', 'francetravail.fr', 'cadremploi.fr', 'monster.fr', 'jobijoba.com', 'fr.trustpilot.com', 'societeinfo.com', 'entreprises.lefigaro.fr', 'score3.fr', 'dirigeants.bfmtv.com', 'rubypayeur.com', 'entreprise.pro', 'infonet.fr', 'bilansgratuits.fr', 'lagazettefrance.fr', 'fr.kompass.com', 'interim.fr', 'annuaire-interim.com', 'net-entreprises.fr', 'societe.ninja', 'pappers.com', 'app.dataprospects.fr', 'opencorporates.com']

export interface EnrichKeys {
  exa?: string
  serper?: string
}

export function enrichKeys(): EnrichKeys {
  const read = (name: string) => (process.env[name]?.trim() ? process.env[name]?.trim() : undefined)
  return { exa: read('EXA_API_KEY'), serper: read('SERPER_API_KEY') }
}

interface ExaResult {
  url: string
  title?: string | null
  text?: string | null
}

/** One Exa search; returns the results and its cost in dollars. Throws on a refused key or exhausted credits. */
async function exa(key: string, body: Record<string, unknown>): Promise<{ results: ExaResult[]; cost: number }> {
  const response = await fetch(EXA, { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
  if (response.status === 402) throw new Error('Crédits Exa épuisés : recharger sur dashboard.exa.ai.')
  if (!response.ok) throw new Error(`Exa a refusé la recherche (erreur ${response.status}).`)
  const data = await response.json() as { results?: ExaResult[]; costDollars?: { total?: number } }
  return { results: data.results ?? [], cost: data.costDollars?.total ?? 0 }
}

async function serper(key: string, path: 'search' | 'places', q: string): Promise<Record<string, unknown> | undefined> {
  const response = await fetch(`${SERPER}/${path}`, { method: 'POST', headers: { 'X-API-KEY': key, 'content-type': 'application/json' }, body: JSON.stringify({ q, gl: 'fr', hl: 'fr' }), signal: AbortSignal.timeout(20_000) })
  if (!response.ok) return undefined
  return response.json() as Promise<Record<string, unknown>>
}

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase()

/** Distinctive words of a company name (« Connectt Grand Est » → connectt), used to check a result is about it. */
function brandWords(company: string): string[] {
  const generic = new Set(['interim', 'travail', 'temporaire', 'emploi', 'agence', 'groupe', 'france', 'recrutement', 'services', 'grand', 'est', 'ouest', 'sud', 'nord', 'paris', 'lyon', 'les', 'des', 'and', 'et', 'rh', 'sas', 'sarl'])
  const words = fold(company).split(/[^a-z0-9]+/u).filter(word => word.length >= 3 && !generic.has(word) && !/^\d+$/u.test(word))
  return words.length > 0 ? words : fold(company).split(/[^a-z0-9]+/u).filter(word => word.length >= 3).slice(0, 1)
}

/** Only the distinctive words: none for « PI Interim », whose brand lives in the whole name. */
function distinctiveWords(company: string): string[] {
  const generic = new Set(['interim', 'travail', 'temporaire', 'emploi', 'agence', 'groupe', 'france', 'recrutement', 'services', 'grand', 'est', 'ouest', 'sud', 'nord', 'paris', 'lyon', 'les', 'des', 'and', 'et', 'rh', 'sas', 'sarl'])
  return fold(company).split(/[^a-z0-9]+/u).filter(word => word.length >= 3 && !generic.has(word) && !/^\d+$/u.test(word))
}

/** Whether a page may give the agency's number: its own site or a telephone directory. */
export function phoneSourceOk(url: string | undefined, company: string): boolean {
  return url !== undefined && (isOwnSite(url, company) || PHONE_DIRECTORIES.some(domain => hostOf(url).endsWith(domain)))
}

/** Telephone directories: a number they list under the agency's name and town is its published line. */
const PHONE_DIRECTORIES = ['pagesjaunes.fr', '118000.fr', '118712.fr', 'mappy.com', 'justacote.com', 'cylex-france.fr', 'infobel.com', 'hoodspot.fr']

const mentions = (text: string, words: readonly string[]) => words.some(word => fold(text).includes(word))

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, '')
  } catch {
    // Not a URL: no host to compare.
    return ''
  }
}

/** French business numbers in a text, normalised to « 01 23 45 67 89 »; premium-rate and fax-looking numbers dropped. */
export function phonesIn(text: string): string[] {
  const out = new Set<string>()
  for (const match of text.matchAll(/(?:\+33\s?\(?0?\)?\s?|\b0)([1-9])(?:[\s.-]?\d{2}){4}\b/gu)) {
    const digits = match[0].replace(/\D/gu, '').replace(/^330?/u, '0')
    if (digits.length !== 10 || /^08(9|99)/u.test(digits)) continue
    out.add(digits.replace(/(\d{2})(?=\d)/gu, '$1 '))
  }
  return [...out]
}

/** Email addresses on the company's own domain (or a generic contact@ on any domain the page names). */
export function emailsIn(text: string, domain: string): string[] {
  const out = new Set<string>()
  for (const match of text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu)) {
    const email = match[0].toLowerCase().replace(/\.$/u, '')
    if (/\.(png|jpe?g|gif|webp|svg)$/u.test(email) || /sentry|wixpress|example|domain\.com/u.test(email)) continue
    if (domain !== '' && !email.endsWith(domain) && !/^(contact|info|accueil|agence|interim|recrutement|compta)/u.test(email)) continue
    out.add(email)
  }
  return [...out]
}

/** Read a page as text, following redirects; undefined when it does not answer. */
async function page(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(12_000) })
    if (!response.ok) return undefined
    return (await response.text()).slice(0, 600_000)
  } catch {
    // Unreachable or too slow: the website simply adds nothing.
    return undefined
  }
}

/** Numbers, emails and the LinkedIn company page from the homepage and its contact page. */
async function fromWebsite(site: string): Promise<{ phones: ContactPoint[]; emails: ContactPoint[]; linkedinCompany?: string }> {
  const domain = hostOf(site)
  const phones: ContactPoint[] = []
  const emails: ContactPoint[] = []
  let linkedinCompany: string | undefined
  const home = await page(site)
  const pages: [string, string][] = home !== undefined ? [[site, home]] : []
  if (home !== undefined) {
    const contact = /href="([^"]*(?:contact|nous-trouver|agences?)[^"]*)"/iu.exec(home)?.[1]
    if (contact !== undefined) {
      const url = new URL(contact, site).toString()
      if (hostOf(url) === domain) {
        const html = await page(url)
        if (html !== undefined) pages.push([url, html])
      }
    }
  }
  for (const [url, html] of pages) {
    const tels = [...html.matchAll(/href="tel:([^"]+)"/giu)].map(match => decodeURIComponent(match[1] as string)).join(' ')
    const text = `${tels} ${html.replace(/<script[\s\S]*?<\/script>/giu, ' ').replace(/<[^>]+>/gu, ' ')}`
    for (const value of phonesIn(text)) if (!phones.some(entry => entry.value === value)) phones.push({ value, label: url === site ? 'Standard (site)' : 'Contact (site)', url })
    for (const value of emailsIn(text, domain)) if (!emails.some(entry => entry.value === value)) emails.push({ value, label: 'Email publié (site)', url })
    linkedinCompany ??= /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[\w%-]+/iu.exec(html)?.[0]
  }
  return { phones: phones.slice(0, 4), emails: emails.slice(0, 3), linkedinCompany }
}

/** Parse an Exa people result: headline, location, and the current role's start date when the profile gives it. */
function personOf(result: ExaResult): { headline?: string; location?: string; since?: string } {
  const lines = (result.text ?? '').split('\n').map(line => line.trim()).filter(Boolean)
  // A search-engine snippet (« … Missing: … ») is not a headline: cut it at the first separator.
  const headline = lines.find(line => !line.startsWith('#') && !/connections|followers/u.test(line))?.split(/ · | Missing: /u)[0]?.trim()
  const location = lines.find(line => /\((FR|BE|CH|LU)\)$|France$/u.test(line))
  const since = /([A-Z][a-z]{2} \d{4}) - Present/u.exec(result.text ?? '')?.[1]
  return { headline, location, since }
}

const GROUPS: [TeamGroup, RegExp][] = [
  ['finance', /financ|daf\b|comptab|recouvr|credit|crédit|factur|tresor|trésor|paie|gestionnaire administrati|contrôle de gestion|controle de gestion/iu],
  ['direction', /président|president|directeur général|directrice générale|\bdg\b|ceo|fondat|founder|gérant|gerante|associé|associe|managing director|directeur|directrice/iu],
  ['agence', /agence|chargé d'affaires|charge d'affaires|chargée d'affaires|commercial|business|développeur|developpeur|recrut|consultant|branch|account|gestionnaire de comptes|mission/iu],
  ['rh', /\brh\b|ressources humaines|talent|human resources|people/iu],
]

/** Group of a role, read on the role only (« Responsable organisation chez La Financière X » is not finance). */
function groupOf(title: string): TeamGroup {
  const role = title.split(/ chez | at | @ | \| /iu)[0] ?? title
  return GROUPS.find(([, pattern]) => pattern.test(role))?.[0] ?? 'autre'
}

/** LinkedIn profile of the named representative, when Exa finds one that names the company or its holding. */
async function findPerson(key: string, prospect: Prospect): Promise<{ person?: Enrichment['linkedinPerson']; cost: number }> {
  const { firstName, lastName } = prospect.contact
  if (`${firstName}${lastName}`.trim() === '') return { cost: 0 }
  const words = brandWords(prospect.company)
  const { results, cost } = await exa(key, { query: `${firstName} ${lastName}, dirigeant de ${prospect.company}, agence d'intérim à ${prospect.city}`, category: 'people', numResults: 5, contents: { text: { maxCharacters: 1500 } } })
  const last = fold(lastName).split(' ').pop() ?? ''
  const matching = results.filter(result => /linkedin\.com\/in\//u.test(result.url) && fold(result.title ?? '').includes(last) && (mentions(result.text ?? '', words) || mentions(result.text ?? '', brandWords(prospect.contact.role))))
  // A full profile (connections, about) beats a page Exa only knows from a search snippet.
  const hit = matching.find(result => /connections|## About/u.test(result.text ?? '')) ?? matching[0]
  if (hit === undefined) return { cost }
  const info = personOf(hit)
  return { person: { url: hit.url.replace(/^https?:\/\/[a-z]{2}\./u, 'https://www.'), headline: info.headline, location: info.location }, cost }
}

/**
 * A website is the company's own when its host carries the brand: the whole name run together (« pi-interim.fr »,
 * « supinterim.fr »), a host label equal to a distinctive word (« keys-rh.com »), or a long distinctive word inside a label
 * (« lejobadequat.com »). « qualibeaute.fr » is not Quali Interim's.
 */
export function isOwnSite(url: string, company: string): boolean {
  const host = fold(hostOf(url))
  if (host === '' || NOT_A_SITE.some(domain => host.endsWith(domain))) return false
  const compactHost = host.replace(/[^a-z0-9]/gu, '')
  // Digits are territory numbers (« Sup Interim 62 », « Adequat 600 »): the site carries the brand alone.
  const compactName = fold(company).replace(/[^a-z]/gu, '')
  if (compactName.length >= 5 && compactHost.includes(compactName)) return true
  const labels = host.split(/[.-]/u)
  return distinctiveWords(company).some(word => labels.includes(word) || (word.length >= 6 && labels.some(label => label.includes(word))))
}

/** Landline prefix of each French region (01 Île-de-France … 05 Sud-Ouest), by département of the head office. */
const REGION_PREFIX: Record<string, string> = Object.fromEntries([
  ['01', '75 77 78 91 92 93 94 95'],
  ['02', '14 18 22 27 28 29 35 36 37 41 44 45 49 50 53 56 61 72 76 85'],
  ['03', '02 08 10 21 25 39 51 52 54 55 57 58 59 60 62 67 68 70 71 80 88 89 90'],
  ['04', '01 03 04 05 06 07 11 13 15 26 30 34 38 42 43 48 63 66 69 73 74 83 84 2A 2B'],
  ['05', '09 12 16 17 19 23 24 31 32 33 40 46 47 64 65 79 81 82 86 87'],
].flatMap(([prefix, depts]) => (depts as string).split(' ').map(dept => [dept, prefix as string])))

/** Pages that list numbers of many companies or of public services: a number read there is not the agency's. */
const NOT_A_PHONE_SOURCE = ['exa.ai', 'insee.fr', 'rubypayeur.com', 'gowork.fr', 'francetravail.fr', 'societe.com', 'pappers.fr', 'reseau-aprime.fr']

/**
 * Whether a number read on a third-party page can be the agency's line: a landline of the head office's region,
 * or a 09 line; never a mobile (06, 07), never from a page listing other companies' numbers.
 */
export function phoneFits(value: string, address: string | undefined, sourceUrl: string | undefined): boolean {
  if (sourceUrl !== undefined && NOT_A_PHONE_SOURCE.some(domain => hostOf(sourceUrl).endsWith(domain))) return false
  const prefix = value.slice(0, 2)
  if (prefix === '06' || prefix === '07') return false
  if (prefix === '09') return true
  const postcode = /\b(\d{5})\b/u.exec(address ?? '')?.[1]
  if (postcode === undefined) return true
  const dept = postcode.startsWith('20') ? (Number(postcode) < 20200 ? '2A' : '2B') : postcode.slice(0, 2)
  const expected = REGION_PREFIX[dept]
  return expected === undefined || expected === prefix
}

/** The company's own website: Exa first, Serper when Exa finds none. */
async function findWebsite(keys: EnrichKeys, prospect: Prospect): Promise<{ site?: string; cost: number; credits: number }> {
  const words = brandWords(prospect.company)
  let cost = 0
  if (keys.exa !== undefined) {
    const found = await exa(keys.exa, { query: `${prospect.company}, agence d'intérim à ${prospect.city} : site officiel`, numResults: 6, excludeDomains: NOT_A_SITE })
    cost += found.cost
    const hit = found.results.find(result => isOwnSite(result.url, prospect.company))
    if (hit !== undefined) return { site: `https://${hostOf(hit.url)}/`, cost, credits: 0 }
  }
  if (keys.serper !== undefined) {
    const data = await serper(keys.serper, 'search', `${prospect.company} intérim ${prospect.city}`)
    const organic = (data?.organic as { link: string; title?: string }[] | undefined) ?? []
    const hit = organic.find(result => isOwnSite(result.link, prospect.company))
    return { site: hit !== undefined ? `https://${hostOf(hit.link)}/` : undefined, cost, credits: 1 }
  }
  return { cost, credits: 0 }
}

/** Google Maps listing of the agency (Serper places): its phone and website, when the website gave no number. */
async function fromMaps(key: string, prospect: Prospect): Promise<{ phone?: ContactPoint; site?: string }> {
  const data = await serper(key, 'places', `${prospect.company} ${prospect.city}`)
  const words = brandWords(prospect.company)
  const place = ((data?.places as { title?: string; phoneNumber?: string; website?: string; address?: string }[] | undefined) ?? []).find(entry => mentions(entry.title ?? '', words))
  if (place === undefined) return {}
  const phone = place.phoneNumber !== undefined ? phonesIn(place.phoneNumber)[0] : undefined
  return { phone: phone !== undefined ? { value: phone, label: `Fiche Google Maps${place.address !== undefined ? ` · ${place.address}` : ''}` } : undefined, site: place.website !== undefined && isOwnSite(place.website, prospect.company) ? place.website : undefined }
}

/** Published numbers of the agency read on web pages that name it and its town (business directories, agency pages). */
async function phonesFromWeb(key: string, prospect: Prospect): Promise<{ phones: ContactPoint[]; cost: number }> {
  const words = brandWords(prospect.company)
  const town = fold(prospect.city).split(/[\s-]/u)[0] ?? ''
  const { results, cost } = await exa(key, { query: `${prospect.company}, agence d'intérim à ${prospect.city} : adresse et téléphone`, numResults: 6, excludeDomains: ['linkedin.com', 'indeed.com', 'hellowork.com'], contents: { text: { maxCharacters: 4000 } } })
  const phones: ContactPoint[] = []
  for (const result of results) {
    const text = result.text ?? ''
    if (!mentions(`${result.title ?? ''} ${text}`, words) || !fold(text).includes(town)) continue
    // Only the agency's own site or a telephone directory: other pages list numbers of other companies.
    if (!isOwnSite(result.url, prospect.company) && !PHONE_DIRECTORIES.some(domain => hostOf(result.url).endsWith(domain))) continue
    for (const value of phonesIn(text)) {
      if (phones.length >= 2) break
      if (!phoneFits(value, prospect.address, result.url)) continue
      if (!phones.some(entry => entry.value === value)) phones.push({ value, label: `Publié sur ${hostOf(result.url)}`, url: result.url })
    }
    if (phones.length >= 2) break
  }
  return { phones, cost }
}

/**
 * Website, business numbers and emails, the representative's LinkedIn profile and the company's LinkedIn page.
 * `useSerper` spends Serper credits on the gaps (website not found by Exa, no number on the website).
 */
export async function enrichContacts(prospect: Prospect, keys: EnrichKeys, options: { useSerper: boolean } = { useSerper: true }): Promise<Enrichment> {
  const gaps: string[] = []
  let cost = 0
  const serperKey = options.useSerper ? keys.serper : undefined
  const web = await findWebsite({ exa: keys.exa, serper: serperKey }, prospect)
  cost += web.cost + web.credits * 0.001
  let site = web.site
  const contacts = site !== undefined ? await fromWebsite(site) : { phones: [], emails: [] }
  const phones = [...contacts.phones]
  if (phones.length === 0 && serperKey !== undefined) {
    const maps = await fromMaps(serperKey, prospect)
    cost += 0.001
    if (maps.phone !== undefined) phones.push(maps.phone)
    site ??= maps.site
  }
  if (phones.length === 0 && keys.exa !== undefined) {
    const web = await phonesFromWeb(keys.exa, prospect)
    cost += web.cost
    phones.push(...web.phones)
  }
  let person: Enrichment['linkedinPerson']
  if (keys.exa !== undefined) {
    const found = await findPerson(keys.exa, prospect)
    cost += found.cost
    person = found.person ?? prospect.enrichment?.linkedinPerson
  }
  if (site === undefined) gaps.push('Site introuvable')
  if (phones.length === 0) gaps.push('Aucun numéro publié trouvé')
  if (person === undefined && `${prospect.contact.firstName}${prospect.contact.lastName}`.trim() !== '') gaps.push('Profil LinkedIn du dirigeant introuvable')
  return {
    ...prospect.enrichment,
    website: site,
    phones,
    emails: contacts.emails,
    linkedinPerson: person,
    linkedinCompany: contacts.linkedinCompany ?? prospect.enrichment?.linkedinCompany,
    enrichedAt: new Date().toISOString(),
    costUsd: Math.round(((prospect.enrichment?.costUsd ?? 0) + cost) * 1000) / 1000,
    gaps,
  }
}

/**
 * Team map: people who state a current role at the company on LinkedIn (Exa `category: people`),
 * finance and management first. Two searches, one wide and one aimed at finance roles.
 */
export async function mapTeam(prospect: Prospect, keys: EnrichKeys): Promise<{ team: TeamMember[]; cost: number }> {
  if (keys.exa === undefined) throw new Error('EXA_API_KEY manquante : la carto d’équipe passe par Exa.')
  const words = brandWords(prospect.company)
  const queries = [
    `People who currently work at ${prospect.company}, staffing agency (agence d'intérim) in ${prospect.city}, France`,
    `${prospect.company} intérim : directeur, responsable d'agence, comptable, chargé de recouvrement, assistante facturation, DAF`,
  ]
  const members = new Map<string, TeamMember>()
  let cost = 0
  for (const query of queries) {
    const { results, cost: spent } = await exa(keys.exa, { query, category: 'people', numResults: 25, contents: { text: { maxCharacters: 1200 } } })
    cost += spent
    for (const result of results) {
      if (!/linkedin\.com\/in\//u.test(result.url)) continue
      const text = result.text ?? ''
      // The company must appear in the headline or in a current role, not only in a past one.
      const info = personOf(result)
      const current = /###\s*([^\n]+)\n[^#]*?Present/u.exec(text)?.[1] ?? ''
      if (!mentions(`${info.headline ?? ''} ${current}`, words)) continue
      const url = result.url.replace(/^https?:\/\/[a-z]{2}\./u, 'https://www.')
      const name = (result.title ?? '').split(/[|–-]/u)[0]?.trim() ?? ''
      if (name === '' || members.has(url)) continue
      const title = info.headline ?? current
      const local = info.location !== undefined && fold(info.location).replace(/[^a-z]/gu, '').includes(fold(prospect.city).replace(/[^a-z]/gu, ''))
      members.set(url, { name, title, location: info.location, since: info.since, linkedin: url, group: groupOf(title !== '' ? title : current), ...(local ? { local: true } : {}) })
    }
  }
  const order: TeamGroup[] = ['finance', 'direction', 'agence', 'rh', 'autre']
  // Local people first, then by group: the agency's own staff before the rest of its network.
  return { team: [...members.values()].sort((a, b) => Number(b.local === true) - Number(a.local === true) || order.indexOf(a.group) - order.indexOf(b.group)), cost }
}
