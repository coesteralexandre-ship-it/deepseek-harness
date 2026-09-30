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
  /** Opaque token of the public page behind the letter's QR code and the voice note. */
  landingToken: string
  /** Letter text saved from the letter builder; the template is rebuilt from signals when absent. */
  letter?: string
  /** Voice-note script saved from the outreach panel; rebuilt from signals when absent. */
  voiceScript?: string
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

/** Columns of the reminder pipeline, in board order. */
export const INVOICE_STAGES = ['a_relancer', 'email_envoye', 'appel', 'promesse', 'litige', 'a_vous', 'encaissee'] as const
export type InvoiceStatus = (typeof INVOICE_STAGES)[number]

export type PromiseStatus = 'attendue' | 'tenue' | 'rompue'
export type RelanceOutcome = 'promesse' | 'litige' | 'renvoi' | 'rappel' | 'sans_suite'

/** How a debtor behaves; drives the demo autopilot, never real calls. */
export type PayerProfile = 'fiable' | 'lent' | 'mauvais' | 'litige' | 'absent' | 'renvoi'

/** A payment date and amount the debtor committed to. */
export interface PaymentPromise {
  id: string
  amountEur: number
  /** ISO date (YYYY-MM-DD) when the agent could parse one, the debtor's words otherwise. */
  dueDate: string
  status: PromiseStatus
  /** Set when the debtor confirmed the written recap. */
  confirmedAt?: string
}

/** One reminder conversation about an invoice. */
export interface RelanceCallRecord {
  id: string
  mode: CallMode
  conversationId?: string
  startedAt: string
  endedAt?: string
  status: CallStatus
  outcome?: RelanceOutcome
  summary?: string
  disputeReason?: string
  /** Person to call instead, when the debtor redirected the agent. */
  rightContact?: string
  transcript?: TranscriptTurn[]
  error?: string
}

export type EmailKind = 'rappel' | 'date' | 'recap_promesse' | 'promesse_rompue' | 'recap_appel' | 'litige' | 'renvoi'
export type EmailStatus = 'brouillon' | 'envoye'

/** An email prepared for the debtor; it leaves only when a person sends it. */
export interface EmailDraft {
  id: string
  kind: EmailKind
  to: string
  subject: string
  body: string
  status: EmailStatus
  createdAt: string
  sentAt?: string
  /** Marked sent by the demo autopilot; nothing left the app. */
  simulated?: boolean
}

/** Who did something on an invoice. */
export type Actor = 'lea' | 'autopilote' | 'vous' | 'client'

export type ActivityKind = 'email' | 'appel' | 'promesse' | 'litige' | 'paiement' | 'etape' | 'client' | 'note'

/** One line of an invoice's journal. */
export interface Activity {
  id: string
  at: string
  kind: ActivityKind
  actor: Actor
  title: string
  detail?: string
}

/** The client's customer who owes the invoice. */
export interface Debtor {
  company: string
  contactName: string
  contactRole: string
  /** E.164. */
  phone: string
  email: string
}

/** An overdue invoice of the client agency, followed until it is paid or handed to a human. */
export interface Invoice {
  id: string
  /** Opaque token of the debtor's public answer page. */
  token: string
  number: string
  debtor: Debtor
  /** What was billed, in the agency's words. */
  mission: string
  amountEur: number
  /** ISO timestamp the invoice fell due. */
  dueDate: string
  status: InvoiceStatus
  /** Index in the reminder playbook of the next step to run. */
  playbookIndex: number
  /** One line: what the agent learned so far. */
  knows: string
  profile: PayerProfile
  disputeReason?: string
  promises: PaymentPromise[]
  calls: RelanceCallRecord[]
  emails: EmailDraft[]
  activities: Activity[]
  /** A dated follow-up that overrides the playbook (callback requested, broken promise). */
  followUpAt?: string
  paidAt?: string
  updatedAt: string
}

/** Workspace-wide settings of the reminder engine. */
export interface Settings {
  /** Days the demo clock runs ahead of real time. */
  clockOffsetDays: number
  /** `demo` runs every step itself; `reel` prepares emails and calls for a person to approve. */
  autopilot: 'demo' | 'reel'
}

export type AudioFormat = 'mp3' | 'ogg'

/** Generated voice note, cached per prospect and format. */
export interface StoredAudio {
  format: AudioFormat
  contentType: string
  base64: string
  script: string
  generatedAt: string
}
