import { STAGES, type Stage } from './types.ts'

/** Color of a pill: semantic tones, plus the three Pigment hues the reminder pipeline needs for its own columns. */
export type Tone = 'neutral' | 'action' | 'warn' | 'ok' | 'hot' | 'mute' | 'amethyst' | 'turquoise' | 'sienna'

export interface StageMeta {
  label: string
  tone: Tone
  hint: string
}

export const STAGE_META: Record<Stage, StageMeta> = {
  nouveau: { label: 'Nouveau', tone: 'neutral', hint: 'Signal qualifié, fiche à compléter' },
  a_appeler: { label: 'À appeler', tone: 'action', hint: 'Prêt pour l’agent vocal' },
  appel_en_cours: { label: 'Appel en cours', tone: 'hot', hint: 'L’agent est en ligne' },
  a_rappeler: { label: 'À rappeler', tone: 'warn', hint: 'Créneau demandé par le prospect' },
  rdv_pris: { label: 'RDV pris', tone: 'ok', hint: 'Démo humaine planifiée' },
  pas_interesse: { label: 'Pas intéressé', tone: 'mute', hint: 'Recyclé dans 90 jours' },
}

export function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value)
}
