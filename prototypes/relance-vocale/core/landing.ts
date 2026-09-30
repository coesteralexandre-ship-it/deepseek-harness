import { newId } from './ids.ts'
import type { Store } from './store.ts'
import type { Prospect, Signal } from './types.ts'

const DAY_MS = 86_400_000

export const LANDING_VISIT_TITLE = 'A ouvert le lien de la lettre (QR code)'
export const CALLBACK_REQUEST_TITLE = 'A demandé à être rappelé depuis la page publique'

/**
 * Record one inbound signal for a landing-page event, at most once per day per
 * title, and make a new or dropped prospect callable again.
 */
export async function recordLandingSignal(store: Store, prospect: Prospect, signals: readonly Signal[], title: string, excerpt: string): Promise<Prospect> {
  const now = Date.now()
  const recent = signals.some(signal =>
    signal.prospectId === prospect.id && signal.title === title && now - Date.parse(signal.detectedAt) < DAY_MS)
  if (recent) return prospect
  await store.saveSignal({
    id: newId('s'),
    prospectId: prospect.id,
    source: 'inbound',
    title,
    excerpt,
    detectedAt: new Date(now).toISOString(),
    weight: 5,
    status: 'qualifie',
  })
  if (prospect.stage !== 'nouveau' && prospect.stage !== 'pas_interesse') return prospect
  const updated: Prospect = { ...prospect, stage: 'a_appeler', updatedAt: new Date(now).toISOString() }
  await store.saveProspect(updated)
  return updated
}
