import { newId } from './ids.ts'
import type { CallMode, CallOutcome, CallRecord, Prospect, Stage, TranscriptTurn } from './types.ts'

export interface CallResult {
  /** Existing call record to close; a new record is appended when neither id matches. */
  callId?: string
  conversationId?: string
  mode?: CallMode
  outcome: CallOutcome
  summary?: string
  meetingSlot?: string
  callbackAt?: string
  transcript?: TranscriptTurn[]
  error?: string
}

const STAGE_AFTER_OUTCOME: Record<CallOutcome, Stage> = {
  rdv: 'rdv_pris',
  rappel: 'a_rappeler',
  refus: 'pas_interesse',
  inconnu: 'a_rappeler',
}

/** Close the matching call record and move the prospect to the stage its outcome implies. */
export function applyCallResult(prospect: Prospect, result: CallResult, now = new Date().toISOString()): Prospect {
  const existing = prospect.calls.find(call =>
    (result.callId !== undefined && call.id === result.callId)
    || (result.conversationId !== undefined && call.conversationId === result.conversationId))
  const closed: CallRecord = {
    id: existing?.id ?? newId('call'),
    mode: existing?.mode ?? result.mode ?? 'telephone',
    conversationId: result.conversationId ?? existing?.conversationId,
    startedAt: existing?.startedAt ?? now,
    endedAt: now,
    status: result.error === undefined ? 'termine' : 'echec',
    outcome: result.outcome,
    summary: result.summary ?? existing?.summary,
    meetingSlot: result.meetingSlot ?? existing?.meetingSlot,
    callbackAt: result.callbackAt ?? existing?.callbackAt,
    transcript: result.transcript ?? existing?.transcript,
    error: result.error,
  }
  const calls = existing === undefined
    ? [...prospect.calls, closed]
    : prospect.calls.map(call => (call.id === existing.id ? closed : call))
  return {
    ...prospect,
    calls,
    stage: result.error === undefined ? STAGE_AFTER_OUTCOME[result.outcome] : 'a_appeler',
    // `callbackAt` is the agent's free text ("demain 10 h"); only an ISO date set through PATCH lands in `nextCallAt`.
    nextCallAt: result.outcome === 'rappel' ? prospect.nextCallAt : undefined,
    updatedAt: now,
  }
}

/** Open a call record and mark the prospect as being called. */
export function openCall(prospect: Prospect, mode: CallMode, conversationId: string | undefined, now = new Date().toISOString()): { prospect: Prospect; call: CallRecord } {
  const call: CallRecord = { id: newId('call'), mode, conversationId, startedAt: now, status: 'en_cours' }
  return {
    call,
    prospect: { ...prospect, calls: [...prospect.calls, call], stage: 'appel_en_cours', updatedAt: now },
  }
}

/** Map free text from the agent's data collection to a pipeline outcome. */
export function parseOutcome(value: unknown): CallOutcome {
  if (typeof value !== 'string') return 'inconnu'
  const text = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/rdv|rendez|meeting|booked/.test(text)) return 'rdv'
  if (/rappel|callback|call back|plus tard/.test(text)) return 'rappel'
  if (/refus|pas interesse|not interested|non/.test(text)) return 'refus'
  return 'inconnu'
}
