/**
 * Build the real prospect base of the prospecting pages from a signal run of Encaisse
 * (`chat/encaisse/signaux.py --niche interim`) and the public company directory.
 * One prospect per decision maker: companies sharing a representative are grouped under the best scored one.
 *
 *   node --experimental-strip-types scripts/import-signaux.ts <dossier du run> [--max 40]
 *
 * Reads `scores.csv` and `offres.csv` of the run, keeps the independent agencies (no national
 * network) scored 29 or more, best first, and looks each one up in the public directory for its
 * head office address and its legal representative; when that representative is a holding, the
 * holding's own representative is used. Writes `core/data/prospects-reels.json`.
 *
 * Everything written is public data: INPI ratios, HelloWork job ads, BODACC counts, the company
 * directory. No phone number or email is invented: the directory publishes neither.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseTable } from '../core/tabular.ts'
import type { Prospect, Signal, SignalSource } from '../core/types.ts'

const args = process.argv.slice(2)
const dir = args.find(arg => !arg.startsWith('--'))
if (dir === undefined) {
  console.error('Usage : scripts/import-signaux.ts <dossier du run> [--max 40]')
  process.exit(1)
}
const maxIndex = args.indexOf('--max')
const MAX = maxIndex >= 0 ? Number(args[maxIndex + 1]) : 40
const RECHERCHE = 'https://recherche-entreprises.api.gouv.fr/search'

type Row = Record<string, string>

function readCsv(path: string): Row[] {
  const [header, ...rows] = parseTable(readFileSync(path, 'utf8'))
  if (header === undefined) return []
  return rows.map(cells => Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ''])))
}

const resume = JSON.parse(readFileSync(join(dir, 'resume.json'), 'utf8')) as { date: string; mediane_dso: number; seuil_dso: number; n_societes: number; n_avec_dso: number }
const RUN_DATE = `${resume.date}T09:00:00.000Z`
const MEDIAN = Math.round(resume.mediane_dso)
const scores = readCsv(join(dir, 'scores.csv'))
const offers = readCsv(join(dir, 'offres.csv'))

const euro = (value: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(value))
const keur = (value: number) => (value >= 1_000_000 ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value / 1_000_000)} M€` : `${Math.round(value / 1000)} k€`)
const titleCase = (value: string) => value.toLowerCase().replace(/(^|[\s'(-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())

/** « R2t Valenciennes » → « R2T Valenciennes », « Artus Interim LA Ferte » → « Artus Interim La Ferte ». */
function cleanName(name: string): string {
  return name.split(' ').map(word => (/\d/u.test(word) ? word.toUpperCase() : /^(LA|LE|LES|ET|DE|DU|DES|SUR|EN)$/u.test(word) ? titleCase(word) : word)).join(' ')
}
const formatDate = (iso: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(`${iso}T12:00:00Z`))

/** Salaried staff from the INSEE size band (permanent staff, not temps). */
const BANDS: Record<string, string> = { '00': '0 salarié', '01': '1 à 2 salariés', '02': '3 à 5 salariés', '03': '6 à 9 salariés', '11': '10 à 19 salariés', '12': '20 à 49 salariés', '21': '50 à 99 salariés', '22': '100 à 199 salariés', '31': '200 à 249 salariés', '32': '250 à 499 salariés', '41': '500 à 999 salariés', '42': '1 000 à 1 999 salariés' }

interface Directory {
  address?: string
  band?: string
  establishments?: number
  person?: { firstName: string; lastName: string; role: string }
}

interface DirectoryResult {
  siren: string
  siege?: { adresse?: string | null }
  tranche_effectif_salarie?: string | null
  nombre_etablissements_ouverts?: number | null
  dirigeants?: { nom?: string | null; prenoms?: string | null; qualite?: string | null; type_dirigeant?: string | null; siren?: string | null; denomination?: string | null }[]
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** « de Groupe Adequat », « d’Artus France ». */
const of = (name: string) => (/^[aeiouyhàâéèêîôû]/iu.test(name) ? `d’${name}` : `de ${name}`)

async function lookup(siren: string): Promise<DirectoryResult | undefined> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${RECHERCHE}?q=${siren}&per_page=1`, { headers: { accept: 'application/json' } })
    if (response.status === 429) {
      await sleep(1500)
      continue
    }
    if (!response.ok) return undefined
    const data = await response.json() as { results?: DirectoryResult[] }
    await sleep(170) // the directory asks for at most 7 requests per second
    return data.results?.find(result => result.siren === siren)
  }
  return undefined
}

/** The first natural person among the legal representatives, auditors excluded. */
function personOf(result: DirectoryResult | undefined) {
  return (result?.dirigeants ?? []).find(person => person.type_dirigeant === 'personne physique' && !/commissaire|membre|censeur/iu.test(person.qualite ?? ''))
}

async function directory(siren: string): Promise<Directory> {
  const result = await lookup(siren)
  if (result === undefined) return {}
  const out: Directory = {
    address: result.siege?.adresse ?? undefined,
    band: BANDS[result.tranche_effectif_salarie ?? ''],
    establishments: result.nombre_etablissements_ouverts ?? undefined,
  }
  const direct = personOf(result)
  if (direct !== undefined) {
    out.person = { firstName: titleCase((direct.prenoms ?? '').split(' ')[0] ?? ''), lastName: titleCase(direct.nom ?? ''), role: (direct.qualite ?? 'Dirigeant').replace(/ de (SAS|SASU|SA|SARL|SCA)$/u, '') }
    return out
  }
  // A holding presides: its own natural-person representative runs the agency, up to two holdings up.
  let level = result
  for (let hop = 0; hop < 2; hop += 1) {
    const holding = (level.dirigeants ?? []).find(person => person.type_dirigeant === 'personne morale' && person.siren)
    if (!holding?.siren) break
    const parentResult = await lookup(holding.siren)
    if (parentResult === undefined) break
    const parent = personOf(parentResult)
    if (parent !== undefined) {
      out.person = {
        firstName: titleCase((parent.prenoms ?? '').split(' ')[0] ?? ''),
        lastName: titleCase(parent.nom ?? ''),
        role: `${(parent.qualite ?? 'Dirigeant').replace(/ de (SAS|SASU|SA|SARL|SCA)$/u, '')} ${of(titleCase(holding.denomination ?? 'la holding'))}, qui préside l’agence`,
      }
      break
    }
    level = parentResult
  }
  return out
}

/** The HelloWork ad a « recrute » segment names, matched on title and town. */
function offerLink(title: string, town: string): string | undefined {
  const norm = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase()
  return offers.find(offer => norm(offer.intitule ?? '') === norm(title) && norm(offer.ville ?? '').startsWith(norm(town)))?.lien
}

function daysBefore(iso: string, days: number): string {
  return new Date(Date.parse(iso) - days * 86_400_000).toISOString()
}

interface Draft {
  source: SignalSource
  title: string
  excerpt: string
  url?: string
  weight: Signal['weight']
  detectedAt: string
}

/** One signal per segment of the run's « signaux » column, each with its public source. */
function signalsOf(row: Row): Draft[] {
  const siren = row.siren as string
  const dso = Math.round(Number(row.dso))
  const previous = row.dso_prec !== '' ? Math.round(Number(row.dso_prec)) : undefined
  const revenue = Number(row.ca_inpi || row.ca)
  const exercice = row.exercice ?? ''
  const inpiUrl = `https://data.economie.gouv.fr/explore/dataset/ratios_inpi_bce/table/?q=${siren}`
  const drafts: Draft[] = []
  for (const segment of (row.signaux ?? '').split(' ; ').map(part => part.trim()).filter(Boolean)) {
    let match: RegExpExecArray | null
    if ((match = /^délai client (\d+) j/u.exec(segment)) !== null) {
      const receivables = revenue > 0 ? ` Créances clients d’environ ${keur((revenue * dso) / 365)} pour ${keur(revenue)} de chiffre d’affaires.` : ''
      const late = beyondLegal(row)
      drafts.push({ source: 'pappers', weight: dso >= 100 ? 4 : 3, detectedAt: RUN_DATE, url: inpiUrl, title: `Délai client de ${dso} jours (médiane des agences : ${MEDIAN} j)`, excerpt: `Ratios INPI, exercice clos le ${formatDate(exercice)}.${receivables}${late !== undefined ? ` Environ ${late} k€ au-delà du délai légal de 60 jours.` : ''}` })
    } else if ((match = /^délai en hausse de (\d+) j/u.exec(segment)) !== null) {
      const rise = Number(match[1])
      drafts.push({ source: 'pappers', weight: rise >= 30 ? 4 : 3, detectedAt: RUN_DATE, url: inpiUrl, title: `Délai client en hausse de ${rise} jours sur un an`, excerpt: previous !== undefined ? `${previous} j puis ${dso} j sur les deux derniers exercices publiés (ratios INPI).` : 'Comparaison des deux derniers exercices publiés (ratios INPI).' })
    } else if ((match = /^paie ses fournisseurs (\d+) j plus tard/u.exec(segment)) !== null) {
      drafts.push({ source: 'pappers', weight: 2, detectedAt: RUN_DATE, url: inpiUrl, title: `Paie ses fournisseurs ${match[1]} jours plus tard qu’un an plus tôt`, excerpt: `Délai fournisseurs de ${Math.round(Number(row.fournisseurs))} jours au dernier exercice : la trésorerie se tend (ratios INPI).` })
    } else if ((match = /^BFR (\d+) j et liquidité ([\d.,]+)/u.exec(segment)) !== null) {
      drafts.push({ source: 'pappers', weight: 2, detectedAt: RUN_DATE, url: inpiUrl, title: `Besoin en fonds de roulement de ${match[1]} jours de chiffre d’affaires`, excerpt: `Ratio de liquidité ${match[2]} au dernier exercice (ratios INPI).` })
    } else if ((match = /^recrute « (.+) » \((.+?) - (\w+), (\d+) j\)/u.exec(segment)) !== null) {
      const [, title, town, dept, age] = match as unknown as [string, string, string, string, string]
      drafts.push({ source: 'offre_emploi', weight: 5, detectedAt: daysBefore(RUN_DATE, Number(age)), url: offerLink(title, town), title, excerpt: `Offre HelloWork à ${town} (${dept}), en ligne depuis ${age} jour${Number(age) > 1 ? 's' : ''} au ${formatDate(resume.date)}.` })
    } else if ((match = /^défaillances de clients types (?:en hausse de |\+)(\d+) %(?: sur un an)? dans le (\w+)(?: \((\d+) en 90 j\))?/u.exec(segment)) !== null) {
      const [, rise, dept, count] = match as unknown as [string, string, string, string | undefined]
      drafts.push({ source: 'bodacc', weight: 2, detectedAt: RUN_DATE, url: 'https://www.bodacc.fr/pages/annonces-commerciales/', title: `Défaillances d’entreprises clientes de l’intérim : +${rise} % sur un an dans le ${dept}`, excerpt: `${count !== undefined ? `${count} procédures collectives en 90 jours` : 'Procédures collectives'} au BODACC dans le département, dans les secteurs qui emploient des intérimaires. Contexte local, pas un client nommé de l’agence.` })
    } else if (/march/iu.test(segment)) {
      drafts.push({ source: 'marches', weight: 2, detectedAt: RUN_DATE, url: 'https://www.boamp.fr/', title: segment.charAt(0).toUpperCase() + segment.slice(1), excerpt: 'Avis d’attribution du BOAMP sur douze mois : des payeurs publics à délais longs.' })
    } else {
      drafts.push({ source: 'pappers', weight: 1, detectedAt: RUN_DATE, title: segment.charAt(0).toUpperCase() + segment.slice(1), excerpt: 'Détecté par le run de signaux.' })
    }
  }
  return drafts
}

/** Receivables beyond 60 days in k€: revenue × (customer credit − 60) / 365; undefined when the agency is within the legal ceiling. */
function beyondLegal(row: Row): number | undefined {
  const revenue = Number(row.ca_inpi || row.ca)
  const dso = Number(row.dso)
  if (!(revenue > 0) || !(dso > 60)) return undefined
  return Math.round((revenue * (dso - 60)) / 365 / 1000)
}

/** The opening line, taken from the strongest fact; never more than the data says. */
function angleOf(row: Row, drafts: readonly Draft[]): string {
  const offer = drafts.find(draft => draft.source === 'offre_emploi')
  if (offer !== undefined) return `Vous recrutez « ${offer.title} » : avant d’ajouter une personne à la relance, Léa peut prendre les appels de J+3 à J+20 et vous laisser les litiges.`
  const dso = Math.round(Number(row.dso))
  const revenue = Number(row.ca_inpi || row.ca)
  const year = (row.exercice ?? '').slice(0, 4)
  const perDay = revenue > 0 ? ` : chaque jour gagné libère environ ${euro(revenue / 365)} de trésorerie` : ''
  return `Vos comptes ${year} affichent ${dso} jours de délai client, contre ${MEDIAN} en médiane pour les agences d’intérim${perDay}.`
}

const pool = scores
  .filter(row => row.reseau === 'False' && Number(row.score) >= 29)
  .sort((a, b) => Number(b.score) - Number(a.score) || Number(b.dso) - Number(a.dso))

// One prospect per decision maker: the companies of one group share their representative, and one letter reaches them all.
const groups = new Map<string, { row: Row; info: Directory; person?: Directory['person']; siblings: string[] }>()
for (const row of pool) {
  const info = await directory(row.siren as string)
  const person = info.person ?? (row.dirigeant_nom ? { firstName: titleCase((row.dirigeant_prenom ?? '').split(' ')[0] ?? ''), lastName: titleCase(row.dirigeant_nom), role: row.dirigeant_qualite || 'Dirigeant' } : undefined)
  const name = cleanName(row.nom_court || titleCase(row.nom ?? ''))
  const key = person !== undefined ? `${person.firstName} ${person.lastName}`.toLowerCase() : `marque:${name.split(' ')[0]?.toLowerCase()}`
  const group = groups.get(key)
  if (group === undefined) groups.set(key, { row, info, person, siblings: [] })
  else group.siblings.push(name)
}
const kept = [...groups.values()].slice(0, MAX)

const prospects: Prospect[] = []
const signals: Signal[] = []
for (const [index, { row, info, person, siblings }] of kept.entries()) {
  const siren = row.siren as string
  const drafts = signalsOf(row)
  const id = `p-${siren}`
  const size = [info.band, info.establishments !== undefined ? `${info.establishments} établissement${info.establishments > 1 ? 's' : ''}` : undefined, Number(row.ca) > 0 ? `CA ${keur(Number(row.ca))}` : undefined].filter(Boolean).join(' · ')
  prospects.push({
    id,
    siren,
    company: cleanName(row.nom_court || titleCase(row.nom ?? siren)),
    city: row.ville ?? '',
    address: info.address !== undefined ? titleCase(info.address) : undefined,
    headcount: size || 'Taille non publiée',
    // Receivables past the 60-day legal ceiling (art. L441-10 Code de commerce), from published revenue and customer credit.
    ...(beyondLegal(row) !== undefined ? { estimatedUnpaidKeur: beyondLegal(row) } : {}),
    contact: { firstName: person?.firstName ?? '', lastName: person?.lastName ?? '', role: person?.role ?? 'Dirigeant à identifier', phone: '' },
    stage: 'nouveau',
    angle: angleOf(row, drafts),
    // Unguessable: the page behind the letter's QR code must not be reachable from the SIREN alone.
    landingToken: `lettre-${randomBytes(9).toString('base64url')}`,
    notes: [
      `Score du run de signaux : ${row.score} / 73 (${resume.date}).`,
      siblings.length > 0 ? `Même dirigeant pour ${siblings.length} autre${siblings.length > 1 ? 's' : ''} société${siblings.length > 1 ? 's' : ''} du vivier : ${siblings.slice(0, 6).join(', ')}${siblings.length > 6 ? '…' : ''}.` : undefined,
      `Annuaire : https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}`,
    ].filter(Boolean).join(' '),
    calls: [],
    createdAt: RUN_DATE,
    updatedAt: RUN_DATE,
  })
  drafts.forEach((draft, n) => signals.push({ id: `s-${siren}-${n + 1}`, prospectId: id, status: 'nouveau', ...draft }))
  console.log(`${index + 1}/${kept.length} ${cleanName(row.nom_court ?? '')} · ${person !== undefined ? `${person.firstName} ${person.lastName}` : 'dirigeant non publié'} · ${drafts.length} signaux${siblings.length > 0 ? ` · +${siblings.length} société(s) sœur(s)` : ''}`)
}

mkdirSync(join(import.meta.dirname, '..', 'core', 'data'), { recursive: true })
const out = join(import.meta.dirname, '..', 'core', 'data', 'prospects-reels.json')
writeFileSync(out, `${JSON.stringify({ generatedAt: resume.date, run: { agencies: resume.n_societes, withAccounts: resume.n_avec_dso, medianDays: MEDIAN }, prospects, signals }, null, 1)}\n`)
console.log(`${prospects.length} prospects, ${signals.length} signaux → ${out}`)
