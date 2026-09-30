import { scoreSignals, sortSignals, temperatureOf } from './signals.ts'
import type { Prospect, ProspectView, Signal } from './types.ts'

export function toView(prospect: Prospect, signals: readonly Signal[], now = Date.now()): ProspectView {
  const own = sortSignals(signals.filter(signal => signal.prospectId === prospect.id))
  const score = scoreSignals(own, now)
  return { ...prospect, signals: own, score, temperature: temperatureOf(score) }
}

/** Hottest first, then most recently updated. */
export function toViews(prospects: readonly Prospect[], signals: readonly Signal[], now = Date.now()): ProspectView[] {
  return prospects
    .map(prospect => toView(prospect, signals, now))
    .sort((a, b) => b.score - a.score || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}
