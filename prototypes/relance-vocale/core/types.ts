/** Domain types shared by the store, the API routes and the UI. */

/** Pipeline stages in board-column order. */
export const STAGES = ['nouveau', 'a_appeler', 'appel_en_cours', 'a_rappeler', 'rdv_pris', 'pas_interesse'] as const
export type Stage = (typeof STAGES)[number]

/** Where a signal was detected. */
export const SIGNAL_SOURCES = ['linkedin', 'offre_emploi', 'pappers', 'bodacc', 'presse', 'avis', 'inbound', 'recommandation'] as const
export type SignalSource = (typeof SIGNAL_SOURCES)[number]

export type SignalStatus = 'nouveau' | 'qualifie' | 'ignore'

/** One observed fact about a prospect that suggests cash-collection pain. */
export interface Signal {
  id: string
  prospectId: string
  source: SignalSource
  title: string
  excerpt: string
  url?: string
  /** ISO timestamp of detection. */
  detectedAt: string
  /** 1 (weak hint) to 5 (explicit pain, first-hand). */
  weight: 1 | 2 | 3 | 4 | 5
  status: SignalStatus
}

export type CallMode = 'navigateur' | 'telephone' | 'simulation'
export type CallStatus = 'en_cours' | 'termine' | 'echec'
export type CallOutcome = 'rdv' | 'rappel' | 'refus' | 'inconnu'

export interface TranscriptTurn {
  role: 'agent' | 'user'
  text: string
}

/** One conversation between the voice agent and the prospect. */
export interface CallRecord {
  id: string
  mode: CallMode
  /** ElevenLabs conversation id, once known. */
  conversationId?: string
  startedAt: string
  endedAt?: string
  status: CallStatus
  outcome?: CallOutcome
  summary?: string
  meetingSlot?: string
  callbackAt?: string
  transcript?: TranscriptTurn[]
  error?: string
}

export interface Contact {
  firstName: string
  lastName: string
  role: string
  /** E.164 number the outbound call dials. */
  phone: string
  email?: string
}

/** A staffing agency in the pipeline. */
export interface Prospect {
  id: string
  company: string
  city: string
  /** Free-text size line shown on cards. */
  headcount: string
  contact: Contact
  /** Overdue receivables in k€ when a signal states a figure. */
  estimatedUnpaidKeur?: number
  stage: Stage
  /** Opening line the agent leads with, derived from the strongest signal. */
  angle: string
  notes?: string
  nextCallAt?: string
  calls: CallRecord[]
  createdAt: string
  updatedAt: string
}

/** Everything the board needs for one prospect. */
export interface ProspectView extends Prospect {
  signals: Signal[]
  score: number
  temperature: Temperature
}

export type Temperature = 'chaud' | 'tiede' | 'froid'
