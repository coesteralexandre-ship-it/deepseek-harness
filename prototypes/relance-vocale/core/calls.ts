import { z } from 'zod'
import { getConversationAnalysis } from './elevenlabs.ts'
import { elevenLabsEnv } from './env.ts'
import { applyCallResult, openCall, parseOutcome } from './outcome.ts'
import type { Store } from './store.ts'
import type { CallRecord, Prospect } from './types.ts'

/** Body of the browser call journal of the internal pages. */
export const callsAction = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('open'),
    mode: z.enum(['navigateur', 'telephone', 'simulation']),
    conversationId: z.string().optional(),
  }),
  z.object({
    action: z.literal('close'),
    callId: z.string().optional(),
    conversationId: z.string().optional(),
    outcome: z.enum(['rdv', 'rappel', 'refus', 'inconnu']),
    summary: z.string().max(4000).optional(),
    meetingSlot: z.string().max(200).optional(),
    callbackAt: z.string().max(200).optional(),
    transcript: z.array(z.object({ role: z.enum(['agent', 'user']), text: z.string().max(4000) })).max(500).optional(),
    error: z.string().max(1000).optional(),
  }),
  z.object({
    action: z.literal('analyze'),
    callId: z.string().optional(),
    conversationId: z.string(),
  }),
])

export type CallsAction = z.infer<typeof callsAction>

const conversationIdField = z.string().trim().min(1).max(200)

/**
 * Body of the public call journal. A visitor may open a browser call on the link's prospect
 * and ask for its analysis; the outcome always comes from ElevenLabs. `close` behaves like
 * `analyze`, and fields such as `outcome` or `transcript` are dropped by the parser.
 */
export const publicCallsAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), mode: z.literal('navigateur'), conversationId: conversationIdField }),
  z.object({ action: z.literal('close'), conversationId: conversationIdField }),
  z.object({ action: z.literal('analyze'), conversationId: conversationIdField }),
])

export type PublicCallsAction = z.infer<typeof publicCallsAction>

/** A request the call journal refuses, with the HTTP status to answer. */
export class CallJournalError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'CallJournalError'
  }
}

export interface CallsResult {
  prospect: Prospect
  call?: CallRecord
  /** ElevenLabs has not finished its analysis yet. */
  pending?: boolean
}

/** Open, close or analyze a call record from the internal pages and persist the prospect. */
export async function applyCallsAction(store: Store, prospect: Prospect, action: CallsAction): Promise<CallsResult> {
  if (action.action === 'open') {
    const opened = openCall(prospect, action.mode, action.conversationId)
    await store.saveProspect(opened.prospect)
    return opened
  }
  if (action.action === 'analyze') return analyzeCall(store, prospect, action.conversationId, false)
  const { action: _action, ...result } = action
  const updated = applyCallResult(prospect, result)
  await store.saveProspect(updated)
  return { prospect: updated }
}

/** Open a browser call from the public page, or close it with the agent's own analysis. */
export async function applyPublicCallsAction(store: Store, prospect: Prospect, action: PublicCallsAction): Promise<CallsResult> {
  if (action.action === 'open') {
    // A conversation id already on file would let this link route another conversation's result.
    const known = (await store.listProspects()).some(candidate => candidate.calls.some(call => call.conversationId === action.conversationId))
    if (known) throw new CallJournalError('Cette conversation est déjà enregistrée.', 409)
    const opened = openCall(prospect, 'navigateur', action.conversationId)
    await store.saveProspect(opened.prospect)
    return opened
  }
  return analyzeCall(store, prospect, action.conversationId, true)
}

/**
 * Close the call record the server opened for `conversationId` with the analysis ElevenLabs
 * holds for it. `fromPublicPage` accepts only a call still in progress, from the prospecting agent.
 */
async function analyzeCall(store: Store, prospect: Prospect, conversationId: string, fromPublicPage: boolean): Promise<CallsResult> {
  const call = prospect.calls.find(candidate => candidate.conversationId === conversationId)
  if (call === undefined) throw new CallJournalError('Aucun appel ouvert pour cette conversation.', 404)
  if (fromPublicPage && call.status !== 'en_cours') throw new CallJournalError('Cet appel est déjà clos.', 409)
  const analysis = await getConversationAnalysis(conversationId)
  const { agentId } = elevenLabsEnv()
  const foreign = agentId !== undefined && (analysis.agentId !== undefined ? analysis.agentId !== agentId : fromPublicPage)
  if (foreign) throw new CallJournalError('Cette conversation ne vient pas de l’agent de prospection.', 403)
  if (!analysis.done) return { prospect, call, pending: true }
  const outcome = analysis.collected.outcome !== undefined ? parseOutcome(analysis.collected.outcome) : analysis.passed.includes('booked_meeting') ? 'rdv' : 'inconnu'
  // The record found above is the only one updated, whatever call id the client sent.
  const analyzed = applyCallResult(prospect, {
    callId: call.id,
    conversationId,
    outcome,
    summary: analysis.collected.resume ?? analysis.summary,
    meetingSlot: analysis.collected.meeting_slot,
    callbackAt: analysis.collected.callback_time,
    transcript: analysis.transcript.length > 0 ? analysis.transcript : undefined,
  })
  await store.saveProspect(analyzed)
  return { prospect: analyzed, call: analyzed.calls.find(candidate => candidate.id === call.id) }
}
