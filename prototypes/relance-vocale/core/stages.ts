import { STAGES, type Stage } from './types.ts'

export type Tone = 'ink' | 'red' | 'amber' | 'green' | 'muted'

export interface StageMeta {
  label: string
  tone: Tone
  hint: string
}

export const STAGE_META: Record<Stage, StageMeta> = {
  nouveau: { label: 'Nouveau', tone: 'ink', hint: 'Signal qualifié, fiche à compléter' },
  a_appeler: { label: 'À appeler', tone: 'red', hint: 'Prêt pour l’agent vocal' },
  appel_en_cours: { label: 'Appel en cours', tone: 'amber', hint: 'L’agent est en ligne' },
  a_rappeler: { label: 'À rappeler', tone: 'amber', hint: 'Créneau demandé par le prospect' },
  rdv_pris: { label: 'RDV pris', tone: 'green', hint: 'Démo humaine planifiée' },
  pas_interesse: { label: 'Pas intéressé', tone: 'muted', hint: 'Recyclé dans 90 jours' },
}

export function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value)
}
