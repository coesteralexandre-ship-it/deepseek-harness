import real from './data/prospects-reels.json' with { type: 'json' }
import type { Prospect, Signal } from './types.ts'

/** Snapshot the prospect base was built from (`scripts/import-signaux.ts`). */
export const REAL_BASE = {
  generatedAt: real.generatedAt,
  agencies: real.run.agencies,
  withAccounts: real.run.withAccounts,
  medianDays: real.run.medianDays,
  prospects: real.prospects.length,
}

/**
 * Real staffing agencies and their public signals: INPI ratios, HelloWork job ads, BODACC counts,
 * legal representatives from the public company directory. Built by `scripts/import-signaux.ts`
 * from an Encaisse signal run; no phone number or email is invented, so none is set.
 * Returns a fresh copy: the stores mutate what they load.
 */
export function seedData(): { prospects: Prospect[]; signals: Signal[] } {
  return structuredClone({ prospects: real.prospects, signals: real.signals }) as unknown as { prospects: Prospect[]; signals: Signal[] }
}
