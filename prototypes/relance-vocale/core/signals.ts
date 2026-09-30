import type { Signal, SignalSource, Temperature } from './types.ts'

export interface SourceMeta {
  label: string
  /** Short glyph printed in the source chip. */
  glyph: string
  /** How the product detects it in production. */
  how: string
}

export const SOURCE_META: Record<SignalSource, SourceMeta> = {
  linkedin: { label: 'LinkedIn', glyph: 'in', how: 'Posts et commentaires du dirigeant ou du DAF (mots-clés : impayés, BFR, retard de paiement, affacturage)' },
  offre_emploi: { label: 'Offre d’emploi', glyph: 'job', how: 'Annonces « chargé de recouvrement », « credit manager », « comptable clients » (Indeed, WTTJ, APEC)' },
  pappers: { label: 'Pappers', glyph: '€', how: 'Comptes annuels : créances clients en hausse, DSO estimé au-dessus du secteur' },
  bodacc: { label: 'BODACC', glyph: 'jo', how: 'Un client de l’agence entre en sauvegarde ou redressement : ses factures deviennent douteuses' },
  presse: { label: 'Presse', glyph: 'news', how: 'Ouverture d’agences, levée, croissance rapide : le BFR se tend avec le volume' },
  avis: { label: 'Avis', glyph: '★', how: 'Avis Google / Indeed d’intérimaires citant des paies en retard : symptôme de trésorerie' },
  inbound: { label: 'Inbound', glyph: '↓', how: 'Téléchargement d’un guide, inscription webinaire, visite de la page tarifs' },
  recommandation: { label: 'Recommandation', glyph: '♥', how: 'Un client existant cite un confrère' },
}

const DAY_MS = 86_400_000

/** 1 for a signal under a week old, decaying to 0.4 after a month. */
export function recencyFactor(detectedAt: string, now = Date.now()): number {
  const ageDays = (now - Date.parse(detectedAt)) / DAY_MS
  if (ageDays < 7) return 1
  if (ageDays < 30) return 0.7
  return 0.4
}

/** 0–100 heat score from the non-ignored signals of one prospect. */
export function scoreSignals(signals: readonly Signal[], now = Date.now()): number {
  const raw = signals
    .filter(signal => signal.status !== 'ignore')
    .reduce((sum, signal) => sum + signal.weight * 20 * recencyFactor(signal.detectedAt, now), 0)
  return Math.min(100, Math.round(raw))
}

export function temperatureOf(score: number): Temperature {
  if (score >= 70) return 'chaud'
  if (score >= 40) return 'tiede'
  return 'froid'
}

/** Strongest signal first, then most recent. */
export function sortSignals(signals: readonly Signal[]): Signal[] {
  return [...signals].sort((a, b) => b.weight - a.weight || Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
}

/** One-line summary handed to the agent as the `signal_summary` dynamic variable. */
export function summarizeSignals(signals: readonly Signal[]): string {
  const kept = sortSignals(signals.filter(signal => signal.status !== 'ignore')).slice(0, 3)
  if (kept.length === 0) return 'Aucun signal précis : appel de découverte.'
  return kept.map(signal => `${SOURCE_META[signal.source].label} : ${signal.title}`).join(' · ')
}
