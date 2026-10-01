import { ambiguousBrand, brandWords, departementOf, fold, getJson, getText, mentions, searchName, sleep, type Draft, type WatchSource } from './common.ts'

/**
 * Job ads for collections and finance roles posted by the agency itself: HelloWork (free, public HTML) and
 * France Travail (free API, needs `FRANCE_TRAVAIL_CLIENT_ID` / `FRANCE_TRAVAIL_CLIENT_SECRET`). Hiring a
 * « chargé de recouvrement » or a DAF means the reminders overflow or the finance function is being rebuilt.
 */

const DAY_MS = 86_400_000
const FINANCE = /recouvrement|credit manag|comptable? clients?|comptabilit[eé] clients?|facturation|daf\b|directeur (administratif|financier)|responsable (administratif|financier|comptable)|raf\b|tr[eé]sorerie|contr[oô]leur de gestion|gestionnaire (adv|administration des ventes)/iu

interface Ad {
  title: string
  company: string
  url: string
  date?: string
  place?: string
}

const decode = (value: string) => value.replace(/&#x([0-9a-f]+);/giu, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16))).replace(/&#(\d+);/gu, (_, dec: string) => String.fromCodePoint(Number(dec))).replace(/&amp;/gu, '&').replace(/&quot;/gu, '"').replace(/&apos;|&#39;/gu, '’').replace(/\s+/gu, ' ').trim()

/** HelloWork results for « <brand> recouvrement », « <brand> comptable », « <brand> financier »: each card is a `div[data-cy=serpCard]`. */
async function helloWork(company: string): Promise<Ad[]> {
  const ads: Ad[] = []
  const cards: string[] = []
  for (const keyword of ['recouvrement', 'comptable', 'financier']) {
    const html = await getText(`https://www.hellowork.com/fr-fr/emploi/recherche.html?k=${encodeURIComponent(`${searchName(company)} ${keyword}`)}&d=all`)
    cards.push(...html.split('data-cy="serpCard"').slice(1))
    await sleep(250)
  }
  for (const card of cards) {
    const link = /<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*data-cy="offerTitle"/u.exec(card)
    if (link === null) continue
    const title = decode(link[2] as string)
    const [role, firm] = title.split(/ - (?=[^-]+$)/u)
    const place = decode(/data-cy="localisationCard"[^>]*>([^<]+)</u.exec(card)?.[1] ?? '')
    ads.push({ title: role ?? title, company: firm ?? '', url: new URL(link[1] as string, 'https://www.hellowork.com').toString(), place })
  }
  return ads
}

interface FtToken { access_token: string }
interface FtOffer { id: string; intitule: string; dateCreation: string; entreprise?: { nom?: string }; lieuTravail?: { libelle?: string }; origineOffre?: { urlOrigine?: string } }

let ftToken: { value: string; until: number } | undefined

async function franceTravailToken(id: string, secret: string): Promise<string> {
  if (ftToken !== undefined && ftToken.until > Date.now()) return ftToken.value
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret, scope: 'api_offresdemploiv2 o2dsoffre' })
  const data = await getJson<FtToken>('https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
  ftToken = { value: data.access_token, until: Date.now() + 20 * 60_000 }
  return data.access_token
}

/** France Travail offers whose company name matches, created in the last 60 days. */
async function franceTravail(company: string, id: string, secret: string, now: number): Promise<Ad[]> {
  const token = await franceTravailToken(id, secret)
  const since = new Date(now - 60 * DAY_MS).toISOString().replace(/\.\d{3}Z$/u, 'Z')
  const params = new URLSearchParams({ motsCles: searchName(company), minCreationDate: since, maxCreationDate: new Date(now).toISOString().replace(/\.\d{3}Z$/u, 'Z'), range: '0-49' })
  const response = await fetch(`https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  if (response.status === 204) return []
  if (!response.ok) throw new Error(`France Travail a répondu ${response.status}`)
  const data = (await response.json()) as { resultats?: FtOffer[] }
  return (data.resultats ?? []).map(offer => ({ title: offer.intitule, company: offer.entreprise?.nom ?? '', url: offer.origineOffre?.urlOrigine ?? `https://candidat.francetravail.fr/offres/recherche/detail/${offer.id}`, date: offer.dateCreation, place: offer.lieuTravail?.libelle }))
}

/** Whether the ad is for the agency's own team (`interne`), for one of its clients (`client`), or does not say. */
async function adAudience(url: string, log: (line: string) => void): Promise<'interne' | 'client' | 'inconnu'> {
  try {
    await sleep(200)
    const text = fold((await getText(url)).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gu, ' ').replace(/<[^>]+>/gu, ' '))
    if (/pour (notre|un|l.un de nos|le compte d.un|son) clients?|chez (notre|un|l.un de nos) clients?|notre client|entreprise cliente|pour le compte de/u.test(text)) return 'client'
    if (/notre si[e]ge|au sein de (notre|son) (siege|agence|groupe|service|equipe|direction)|rejoindre (notre|nos) (equipe|agence|siege)|en interne|pour (notre|son) propre|renforcer (notre|son) (equipe|service|pole)|nous recrutons pour (notre|nos)/u.test(text)) return 'interne'
    return 'inconnu'
  } catch (error) {
    log(`annonce illisible : ${error instanceof Error ? error.message : String(error)}`)
    return 'inconnu'
  }
}

export const emplois: WatchSource = {
  key: 'emplois',
  label: 'Offres d’emploi (HelloWork, France Travail)',
  unavailable: () => undefined,
  async detect({ prospect, now, log }) {
    const drafts: Draft[] = []
    const words = brandWords(prospect.company)
    const ads: Ad[] = []
    try {
      ads.push(...(await helloWork(prospect.company)))
    } catch (error) {
      log(`HelloWork : ${error instanceof Error ? error.message : String(error)}`)
    }
    const id = process.env.FRANCE_TRAVAIL_CLIENT_ID?.trim()
    const secret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET?.trim()
    if (id && secret) {
      try {
        await sleep(120)
        ads.push(...(await franceTravail(prospect.company, id, secret, now)))
      } catch (error) {
        log(`France Travail : ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    const seen = new Set<string>()
    let read = 0
    for (const ad of ads) {
      // The ad must be posted by the agency (its name in the recruiter field) and be a finance or collections role.
      if (words.length === 0 || !mentions(ad.company, words) || !FINANCE.test(fold(ad.title)) || seen.has(fold(ad.title))) continue
      // A common one-word name (« Alliance ») also names other companies: keep the ad only in the prospect's département.
      if (ambiguousBrand(prospect.company) && /- (\d{2,3})$/u.exec(ad.place ?? '')?.[1] !== departementOf(prospect)) continue
      seen.add(fold(ad.title))
      // An agency's ads are mostly for its clients: read the ad to keep only the ones for its own team.
      if (read >= 5) break
      read += 1
      const where = await adAudience(ad.url, log)
      if (where === 'client') continue
      const senior = /daf\b|directeur|responsable|credit manag/iu.test(ad.title)
      const weight: Draft['weight'] = where === 'interne' ? (senior ? 4 : 3) : 2
      drafts.push({ source: 'offre_emploi', weight, detectedAt: ad.date !== undefined ? new Date(ad.date).toISOString() : new Date(now).toISOString(), url: ad.url, title: `Recrute « ${ad.title} »${ad.place ? ` à ${ad.place}` : ''}`, excerpt: `${senior ? 'Un poste de direction financière ouvert : la fonction se réorganise, c’est le moment de parler outils.' : 'Un poste de relance ou de facturation ouvert : la relance déborde, une personne de plus ne suffira pas longtemps.'}${where === 'interne' ? ' L’annonce parle de son propre siège ou de sa propre agence.' : ' L’annonce ne dit pas si le poste est en interne ou chez un client : à vérifier.'}` })
      if (drafts.length >= 3) break
    }
    return { drafts }
  },
}
