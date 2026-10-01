import type { Store } from '../store.ts'
import type { Prospect, Signal, WatchRun } from '../types.ts'
import { annuaire } from './annuaire.ts'
import { avis } from './avis.ts'
import { bodacc } from './bodacc.ts'
import { toSignal, type WatchSource } from './common.ts'
import { emplois } from './emplois.ts'
import { equipe } from './equipe.ts'
import { inpi } from './inpi.ts'
import { presse } from './presse.ts'

/**
 * The watch (« veille »): every source runs on every prospect that still has a SIREN and is not lost, each
 * finding becomes a signal with a stable id (so a second run writes nothing new), and the snapshots the
 * sources need for the next diff are saved on the prospect. Ten signal families behind seven modules:
 * BODACC on the SIREN, new representative / head office (RNE), new establishment (Sirene), job ads, INPI
 * trend, Google reviews, new finance person (Exa), guarantee calendar, client failures of the département, press.
 */

export const SOURCES: readonly WatchSource[] = [bodacc, inpi, annuaire, emplois, presse, equipe, avis]

/** Sources whose key is listed; `undefined` means every source. Paid ones run only when `paid` is true. */
export function pickSources(keys: readonly string[] | undefined, paid: boolean): WatchSource[] {
  return SOURCES.filter(source => (keys === undefined || keys.includes(source.key)) && (paid || (source.key !== 'equipe' && source.key !== 'avis')))
}

export interface WatchOptions {
  sources?: readonly string[]
  /** Run the paid sources (Exa, SerpApi). */
  paid?: boolean
  /** Only these prospect ids. */
  prospectIds?: readonly string[]
  /** Stop spending once this many dollars went out in this run. */
  maxCostUsd?: number
  trigger: WatchRun['trigger']
  now?: number
  log?: (line: string) => void
}

export interface WatchReport extends WatchRun {
  created_signals: Signal[]
  skipped: string[]
}

/** Run the watch over the store's prospects and persist new signals and snapshots. */
export async function runWatch(store: Store, options: WatchOptions): Promise<WatchReport> {
  const now = options.now ?? Date.now()
  const log = options.log ?? (() => {})
  const sources = pickSources(options.sources, options.paid === true)
  const skipped = SOURCES.filter(source => !sources.includes(source)).map(source => `${source.label} : non lancée`)
  const usable = sources.filter(source => {
    const why = source.unavailable()
    if (why !== undefined) skipped.push(`${source.label} : ${why}`)
    return why === undefined
  })
  const prospects = (await store.listProspects()).filter(prospect => prospect.stage !== 'pas_interesse' && prospect.record?.optOut === undefined && (options.prospectIds === undefined || options.prospectIds.includes(prospect.id)))
  const existingAll = await store.listSignals()
  const report: WatchReport = { at: new Date(now).toISOString(), prospects: prospects.length, created: 0, bySource: {}, errors: [], costUsd: 0, trigger: options.trigger, created_signals: [], skipped }
  const maxCost = options.maxCostUsd ?? 2
  for (const prospect of prospects) {
    const existing = existingAll.filter(signal => signal.prospectId === prospect.id)
    const known = new Set(existing.map(signal => signal.id))
    let snapshot: Prospect['veille'] = { ...prospect.veille }
    for (const source of usable) {
      if (report.costUsd >= maxCost && (source.key === 'equipe' || source.key === 'avis')) continue
      try {
        const result = await source.detect({ prospect: { ...prospect, veille: snapshot }, existing, now, log: line => log(`${prospect.company} · ${line}`) })
        report.costUsd = Math.round((report.costUsd + (result.costUsd ?? 0)) * 1000) / 1000
        if (result.snapshot !== undefined) snapshot = { ...snapshot, ...result.snapshot }
        for (const draft of result.drafts) {
          const signal = toSignal(prospect.id, draft)
          if (known.has(signal.id)) continue
          known.add(signal.id)
          await store.saveSignal(signal)
          report.created_signals.push(signal)
          report.created += 1
          report.bySource[signal.source] = (report.bySource[signal.source] ?? 0) + 1
          log(`${prospect.company} · + ${signal.source} · ${signal.title}`)
        }
      } catch (error) {
        const message = `${prospect.company} · ${source.label} : ${error instanceof Error ? error.message : String(error)}`
        report.errors.push(message)
        log(message)
      }
    }
    snapshot = { ...snapshot, lastRunAt: new Date(now).toISOString() }
    const fresh = await store.getProspect(prospect.id)
    if (fresh !== undefined) await store.saveProspect({ ...fresh, veille: snapshot, updatedAt: new Date(now).toISOString() })
  }
  const settings = await store.getSettings()
  const { created_signals: _signals, skipped: _skipped, ...run } = report
  await store.saveSettings({ ...settings, veilleLastRun: { ...run, errors: run.errors.slice(0, 20) } })
  return report
}
