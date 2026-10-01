import { getJson, longDay, sleep, type Draft, type WatchSource } from './common.ts'

/**
 * Public company directory (free, no key): a snapshot of the legal representatives, head office and open
 * establishments is kept on the prospect; the next run compares and signals a new representative, a moved
 * head office or a new establishment (an agency opening means payroll advanced before invoicing).
 * With `INSEE_API_KEY`, Sirene gives the exact creation date of each establishment instead of a diff.
 */

const RECHERCHE = 'https://recherche-entreprises.api.gouv.fr/search'
const SIRENE = 'https://api.insee.fr/api-sirene/3.11/siret'
const DAY_MS = 86_400_000

interface DirectoryResult {
  siren: string
  nombre_etablissements_ouverts?: number | null
  date_mise_a_jour_rne?: string | null
  siege?: { adresse?: string | null }
  dirigeants?: { nom?: string | null; prenoms?: string | null; qualite?: string | null; type_dirigeant?: string | null; denomination?: string | null }[]
}

const titleCase = (value: string) => value.toLowerCase().replace(/(^|[\s'(-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())

function representatives(result: DirectoryResult): string[] {
  return (result.dirigeants ?? [])
    .filter(person => !/commissaire|membre|censeur/iu.test(person.qualite ?? ''))
    .map(person => person.type_dirigeant === 'personne morale' ? titleCase(person.denomination ?? '') : `${titleCase((person.prenoms ?? '').split(' ')[0] ?? '')} ${titleCase(person.nom ?? '')}`.trim())
    .filter(Boolean)
    .sort()
}

interface SireneUnit {
  siret: string
  dateCreationEtablissement?: string
  etablissementSiege?: boolean
  adresseEtablissement?: { libelleCommuneEtablissement?: string; codePostalEtablissement?: string }
  periodesEtablissement?: { etatAdministratifEtablissement?: string }[]
}

/** Establishments opened in the last `days` days, from Sirene (needs the INSEE key). */
async function sireneOpenings(siren: string, key: string, days: number, now: number): Promise<SireneUnit[]> {
  const since = new Date(now - days * DAY_MS).toISOString().slice(0, 10)
  const params = new URLSearchParams({ q: `siren:${siren} AND dateCreationEtablissement:[${since} TO *]`, nombre: '50' })
  const data = await getJson<{ etablissements?: SireneUnit[] }>(`${SIRENE}?${params}`, { headers: { 'X-INSEE-Api-Key-Integration': key } })
  return (data.etablissements ?? []).filter(unit => unit.periodesEtablissement?.[0]?.etatAdministratifEtablissement !== 'F')
}

export const annuaire: WatchSource = {
  key: 'annuaire',
  label: 'Annuaire des entreprises et Sirene',
  unavailable: () => undefined,
  async detect({ prospect, now, log }) {
    const drafts: Draft[] = []
    if (prospect.siren === undefined) return { drafts }
    const data = await getJson<{ results?: DirectoryResult[] }>(`${RECHERCHE}?q=${prospect.siren}&per_page=1`)
    await sleep(160)
    const result = data.results?.find(entry => entry.siren === prospect.siren)
    if (result === undefined) return { drafts }
    const current = { representatives: representatives(result), address: titleCase(result.siege?.adresse ?? ''), establishments: result.nombre_etablissements_ouverts ?? 0, updatedRne: result.date_mise_a_jour_rne ?? undefined }
    const previous = prospect.veille?.directory
    const annuaireUrl = `https://annuaire-entreprises.data.gouv.fr/entreprise/${prospect.siren}`
    const when = current.updatedRne !== undefined ? new Date(current.updatedRne).toISOString() : new Date(now).toISOString()
    if (previous !== undefined) {
      const added = current.representatives.filter(name => !previous.representatives.includes(name))
      const gone = previous.representatives.filter(name => !current.representatives.includes(name))
      if (added.length > 0) {
        drafts.push({ source: 'rne', weight: 4, detectedAt: when, url: annuaireUrl, title: `Nouveau représentant légal : ${added.join(', ')}`, excerpt: `${gone.length > 0 ? `Remplace ${gone.join(', ')}. ` : ''}Registre national des entreprises, mis à jour le ${longDay(when)}. Un nouveau dirigeant revoit les outils de l’agence.` })
      }
      if (previous.address !== '' && current.address !== '' && previous.address !== current.address) {
        drafts.push({ source: 'rne', weight: 2, detectedAt: when, url: annuaireUrl, title: 'Siège social transféré', excerpt: `De ${previous.address} à ${current.address} (registre mis à jour le ${longDay(when)}).` })
      }
      if (current.establishments > previous.establishments) {
        const more = current.establishments - previous.establishments
        drafts.push({ source: 'sirene', weight: 3, detectedAt: when, url: annuaireUrl, title: `${more} établissement${more > 1 ? 's' : ''} de plus : ${current.establishments} ouvert${current.establishments > 1 ? 's' : ''}`, excerpt: 'Une agence de plus, ce sont des paies avancées avant d’être facturées : le besoin de trésorerie monte avec le volume.' })
      }
    }
    const key = process.env.INSEE_API_KEY?.trim()
    if (key !== undefined && key !== '') {
      try {
        for (const unit of await sireneOpenings(prospect.siren, key, 120, now)) {
          if (unit.etablissementSiege) continue
          const town = unit.adresseEtablissement?.libelleCommuneEtablissement ?? ''
          drafts.push({ source: 'sirene', weight: 3, detectedAt: `${unit.dateCreationEtablissement ?? new Date(now).toISOString().slice(0, 10)}T09:00:00.000Z`, url: annuaireUrl, title: `Nouvelle agence${town !== '' ? ` à ${titleCase(town)}` : ''} (ouverte le ${longDay(unit.dateCreationEtablissement ?? new Date(now).toISOString())})`, excerpt: 'Établissement créé selon Sirene (INSEE). Une ouverture tend le BFR : paies avancées avant la première facture.' })
        }
      } catch (error) {
        log(`Sirene indisponible : ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return { drafts, snapshot: { directory: { ...current, at: new Date(now).toISOString() } } }
  },
}
