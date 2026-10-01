/** Domain types shared by the store, the API routes and the UI. */

/** Pipeline stages in board-column order. */
export const STAGES = ['nouveau', 'a_appeler', 'appel_en_cours', 'a_rappeler', 'rdv_pris', 'pas_interesse'] as const
export type Stage = (typeof STAGES)[number]

/** Where a signal was detected. */
export const SIGNAL_SOURCES = ['linkedin', 'offre_emploi', 'pappers', 'bodacc', 'rne', 'sirene', 'garantie', 'marches', 'presse', 'avis', 'inbound', 'recommandation'] as const
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

/** A way to reach a company, with where it was read. */
export interface ContactPoint {
  value: string
  /** What it is: « Standard (site) », « Agence de Lyon (Google Maps) », « Contact (site) ». */
  label: string
  /** Page it was read on. */
  url?: string
}

/** Groups of the team map, in the order a reminder product cares about them. */
export type TeamGroup = 'finance' | 'direction' | 'agence' | 'rh' | 'autre'

/** One person of the company found on LinkedIn by the team map. */
export interface TeamMember {
  name: string
  /** Headline or current role as the profile states it. */
  title: string
  location?: string
  /** « Jan 2024 » when the profile dates the current role. */
  since?: string
  linkedin: string
  group: TeamGroup
  /** Based in the prospect's town: its own team rather than another branch of the network. */
  local?: boolean
}

/** What the enrichment found about a prospect from its website, LinkedIn (Exa) and Google (Serper). */
export interface Enrichment {
  website?: string
  /** Company switchboard and agency lines: published business numbers, never personal mobiles. */
  phones: ContactPoint[]
  emails: ContactPoint[]
  linkedinPerson?: { url: string; headline?: string; location?: string }
  linkedinCompany?: string
  team?: TeamMember[]
  teamMappedAt?: string
  enrichedAt: string
  /** Spent on paid APIs for this prospect, in dollars. */
  costUsd: number
  /** What could not be found, in French. */
  gaps: string[]
}

export type TaskKind = 'appel' | 'courrier' | 'email' | 'autre'

/** A dated thing to do on a prospect; shown on its fiche and on the « Aujourd’hui » page until ticked. */
export interface Task {
  id: string
  title: string
  kind: TaskKind
  /** ISO instant it is due. */
  dueAt: string
  createdAt: string
  doneAt?: string
  note?: string
  /** Created by the « À rappeler » stage: its date follows the stage's date. */
  fromStage?: boolean
}

/** One line of a prospect's history: stage changes, tasks, opposition, outreach. */
export interface ProspectEvent {
  id: string
  at: string
  title: string
  detail?: string
}

/** The record kept for each person contacted: where the data came from, what was told, what they refused. */
export interface ProspectRecord {
  /** Public sources the data was read from, in French. */
  source: string
  /** ISO date the data was collected. */
  collectedAt: string
  /** When the information notice (origin of the data, right to object) went out. */
  noticeSentAt?: string
  /** The person asked not to be contacted: blocks every channel. */
  optOut?: { at: string; reason: string }
}

/** A staffing agency in the pipeline. */
export interface Prospect {
  id: string
  /** Set for prospects found by the open-data radar; used to skip companies already in the pipeline. */
  siren?: string
  company: string
  city: string
  /** Head office postal address from the public company directory, for the letter. */
  address?: string
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
  /** Website, numbers, LinkedIn and team found by the enrichment. */
  enrichment?: Enrichment
  tasks?: Task[]
  history?: ProspectEvent[]
  record?: ProspectRecord
  /** Snapshots kept by the watch (veille) to detect what changed since its last run. */
  veille?: WatchSnapshot
  nextCallAt?: string
  calls: CallRecord[]
  createdAt: string
  updatedAt: string
}

/** What the watch saw last time: compared on the next run to signal a new representative, a move, an opening, a rating drop. */
export interface WatchSnapshot {
  directory?: { representatives: string[]; address: string; establishments: number; updatedRne?: string; at: string }
  /** Closing date of the last published accounts (YYYY-MM-DD). */
  fiscalYearEnd?: string
  rating?: { value: number; count: number; at: string }
  /** LinkedIn URLs of team members already seen. */
  teamSeen?: string[]
  teamAt?: string
  lastRunAt?: string
}

/** Summary of the last watch run, shown in Réglages. */
export interface WatchRun {
  at: string
  prospects: number
  created: number
  bySource: Record<string, number>
  errors: string[]
  costUsd: number
  /** `cron` for the daily run, `manuel` for the button. */
  trigger: 'cron' | 'manuel'
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
export type RelanceOutcome = 'promesse' | 'deja_regle' | 'litige' | 'renvoi' | 'rappel' | 'sans_suite'

/** Every reminder outcome, in the order the UI lists them. */
export const RELANCE_OUTCOMES = ['promesse', 'deja_regle', 'litige', 'renvoi', 'rappel', 'sans_suite'] as const satisfies readonly RelanceOutcome[]

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
  /** The debtor says this payment already left: the bank statement settles it. */
  claimed?: boolean
}

/**
 * What the debtor answered, as the agent noted it during the call (or the debtor on the answer page).
 * Dates are resolved to the Paris calendar; `quote` keeps the debtor's own words.
 */
export interface DebtorAnswer {
  outcome: RelanceOutcome
  /** The debtor's own words, one short sentence. */
  quote?: string
  /** Why the invoice is not paid yet, in the debtor's terms (validation, own client late, cash, missing document). */
  delayReason?: string
  /** YYYY-MM-DD of the promised (or claimed) payment. */
  promiseDate?: string
  promiseAmountEur?: number
  /** Second instalment when the debtor pays in two. */
  secondDate?: string
  secondAmountEur?: number
  disputeReason?: string
  /** Document the debtor waits for before paying. */
  missingDocument?: string
  /** Person to deal with instead: name, role, email or phone. */
  rightContact?: string
  /** ISO instant the debtor asked to be called back. */
  callbackAt?: string
  /** ISO instant the answer was noted. */
  notedAt: string
  /** Noted live by the agent, or read from the post-call analysis. */
  source: 'direct' | 'analyse' | 'page' | 'vous'
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
  /** Answer the agent noted during the call; it decides the outcome when the call closes. */
  answer?: DebtorAnswer
  transcript?: TranscriptTurn[]
  error?: string
}

export type EmailKind = 'rappel' | 'date' | 'recap_promesse' | 'avis_virement' | 'promesse_rompue' | 'recap_appel' | 'litige' | 'renvoi'
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

/** The agency that issued the invoice and in whose name the agent speaks. */
export interface Creditor {
  company: string
  city: string
  /** Signature of the emails, e.g. « Service comptabilité clients ». */
  team: string
}

/** The client agency using the workspace. */
export interface Agency extends Creditor {
  /** Payroll paid every Friday: the line the promises are measured against. */
  weeklyPayrollEur: number
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
  creditor: Creditor
  debtor: Debtor
  /** What was billed, in the agency's words. */
  mission: string
  amountEur: number
  /** ISO timestamp the invoice fell due. */
  dueDate: string
  /** Start of the reminder sequence when it is not the due date (an invoice imported already late starts the day before import). */
  sequenceAnchor?: string
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
  /** Latest answer of the debtor, whatever the channel: what the CRM shows as « Réponse du client ». */
  answer?: DebtorAnswer
  /** A dated follow-up that overrides the playbook (callback requested, broken promise). */
  followUpAt?: string
  paidAt?: string
  /** Fingerprints of the bank credits already applied to this invoice, so a statement pasted twice is not counted twice. */
  reconciledCredits?: string[]
  updatedAt: string
}

/** Workspace-wide settings of the reminder engine. */
export interface Settings {
  /** Days the demo clock runs ahead of real time. */
  clockOffsetDays: number
  /** `demo` runs every step itself; `reel` prepares emails and calls for a person to approve. */
  autopilot: 'demo' | 'reel'
  agency: Agency
  veilleLastRun?: WatchRun
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
