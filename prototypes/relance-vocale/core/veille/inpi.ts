import { getJson, longDay, type Draft, type WatchSource } from './common.ts'

/**
 * INPI ratios (free, no key): the customer-credit trend over the last three published years, the balance
 * sheet tension, and the calendar of the financial guarantee every staffing agency must renew (certified
 * revenue within six months of the closing, art. L1251-49 of the Code du travail).
 */

const RATIOS = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/ratios_inpi_bce/records'
const DAY_MS = 86_400_000

interface Row {
  siren: string
  date_cloture_exercice?: string
  credit_clients_jours?: number | null
  credit_fournisseurs_jours?: number | null
  chiffre_d_affaires?: number | null
  ratio_de_liquidite?: number | null
  poids_bfr_exploitation_sur_ca_jours?: number | null
  type_bilan?: string | null
}

const keur = (value: number) => (value >= 1_000_000 ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value / 1_000_000)} M€` : `${Math.round(value / 1000)} k€`)

/** Published years of a SIREN, newest first, impossible dates and empty years dropped. */
async function years(siren: string, now: number): Promise<Row[]> {
  const params = new URLSearchParams({ where: `siren="${siren}"`, order_by: 'date_cloture_exercice desc', limit: '8', select: 'siren,date_cloture_exercice,credit_clients_jours,credit_fournisseurs_jours,chiffre_d_affaires,ratio_de_liquidite,poids_bfr_exploitation_sur_ca_jours,type_bilan' })
  const data = await getJson<{ results?: Row[] }>(`${RATIOS}?${params}`)
  const today = new Date(now).toISOString().slice(0, 10)
  const seen = new Set<string>()
  return (data.results ?? []).filter(row => {
    const closing = row.date_cloture_exercice ?? ''
    // Future closings and years without revenue are filing errors, not accounts.
    if (closing === '' || closing > today || !(Number(row.chiffre_d_affaires) > 0) || seen.has(closing)) return false
    seen.add(closing)
    return true
  })
}

export const inpi: WatchSource = {
  key: 'inpi',
  label: 'Ratios INPI',
  unavailable: () => undefined,
  async detect({ prospect, now }) {
    const drafts: Draft[] = []
    if (prospect.siren === undefined) return { drafts }
    const rows = await years(prospect.siren, now)
    const last = rows[0]
    if (last === undefined) return { drafts }
    const closing = last.date_cloture_exercice as string
    const credits = rows.map(row => row.credit_clients_jours).filter((value): value is number => typeof value === 'number' && value >= 10 && value <= 300).slice(0, 3)
    const when = `${closing}T09:00:00.000Z`
    const url = `https://data.economie.gouv.fr/explore/dataset/ratios_inpi_bce/table/?q=${prospect.siren}`
    if (credits.length >= 3) {
      const [c0, c1, c2] = credits as [number, number, number]
      if (c0 > c1 && c1 > c2 && c0 - c2 >= 15) {
        drafts.push({ source: 'pappers', weight: 4, detectedAt: when, url, title: `Délai client en hausse trois exercices de suite : ${Math.round(c2)} → ${Math.round(c1)} → ${Math.round(c0)} jours`, excerpt: `Exercices clos jusqu’au ${longDay(closing)} (ratios INPI). Une dérive qui dure, pas un accident.` })
      }
    }
    if (credits.length >= 2) {
      const [c0, c1] = credits as [number, number]
      const revenue = Number(last.chiffre_d_affaires)
      if (c0 - c1 >= 20) {
        drafts.push({ source: 'pappers', weight: 3, detectedAt: when, url, title: `Délai client en hausse de ${Math.round(c0 - c1)} jours sur le dernier exercice`, excerpt: `${Math.round(c1)} j puis ${Math.round(c0)} j (ratios INPI, exercice clos le ${longDay(closing)}).${revenue > 0 ? ` Soit environ ${keur((revenue * (c0 - c1)) / 365)} de trésorerie immobilisée en plus.` : ''}` })
      }
    }
    const liquidity = last.ratio_de_liquidite
    if (typeof liquidity === 'number' && liquidity > 0 && liquidity < 100) {
      drafts.push({ source: 'pappers', weight: 3, detectedAt: when, url, title: `Liquidité sous 1 : ${(liquidity / 100).toFixed(2)} au dernier exercice`, excerpt: `Les dettes à court terme dépassent l’actif circulant (ratios INPI, exercice clos le ${longDay(closing)}).` })
    }
    const suppliers = rows.map(row => row.credit_fournisseurs_jours).filter((value): value is number => typeof value === 'number' && value > 0 && value <= 200).slice(0, 2)
    if (suppliers.length === 2 && (suppliers[0] as number) - (suppliers[1] as number) >= 15) {
      drafts.push({ source: 'pappers', weight: 2, detectedAt: when, url, title: `Paie ses fournisseurs ${Math.round((suppliers[0] as number) - (suppliers[1] as number))} jours plus tard qu’un an plus tôt`, excerpt: `Délai fournisseurs de ${Math.round(suppliers[0] as number)} jours au dernier exercice (ratios INPI).` })
    }
    // Financial guarantee: revenue certified within six months of the closing; the guarantor reviews the ceiling then.
    const closingThisYear = new Date(closing)
    closingThisYear.setUTCFullYear(new Date(now).getUTCFullYear())
    if (closingThisYear.getTime() > now) closingThisYear.setUTCFullYear(closingThisYear.getUTCFullYear() - 1)
    const certification = closingThisYear.getTime() + 182 * DAY_MS
    const daysLeft = Math.round((certification - now) / DAY_MS)
    if (daysLeft >= 0 && daysLeft <= 45) {
      drafts.push({ source: 'garantie', weight: 2, detectedAt: new Date(now).toISOString(), title: `Certification du chiffre d’affaires pour la garantie financière avant le ${longDay(new Date(certification).toISOString())}`, excerpt: `L’exercice clôture le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(closingThisYear)} ; le garant revoit le plafond (151 445 € minimum en 2026, 8 % du chiffre d’affaires) : c’est le moment où la trésorerie est regardée de près.` })
    }
    return { drafts, snapshot: { fiscalYearEnd: closing } }
  },
}
