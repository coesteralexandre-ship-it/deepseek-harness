import { z } from 'zod'
import { getConversationAnalysis } from './elevenlabs.ts'
import { applyCallResult, openCall, parseOutcome } from './outcome.ts'
import type { Store } from './store.ts'
import type { CallRecord, Prospect } from './types.ts'

/** Body of the browser call journal, shared by the internal and the public routes. */
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

/** Open, close or analyze a call record and persist the prospect. `pending` means ElevenLabs has not finished its analysis yet. */
export async function applyCallsAction(store: Store, prospect: Prospect, action: CallsAction): Promise<{ prospect: Prospect; call?: CallRecord; pending?: boolean }> {
  if (action.action === 'open') {
    const opened = openCall(prospect, action.mode, action.conversationId)
    await store.saveProspect(opened.prospect)
    return opened
  }
  if (action.action === 'analyze') {
    // Reads the agent's own analysis back, so a browser or local call needs no webhook.
    const analysis = await getConversationAnalysis(action.conversationId)
    if (!analysis.done) return { prospect, pending: true }
    const outcome = analysis.collected.outcome !== undefined ? parseOutcome(analysis.collected.outcome) : analysis.passed.includes('booked_meeting') ? 'rdv' : 'inconnu'
    const analyzed = applyCallResult(prospect, {
      callId: action.callId,
      conversationId: action.conversationId,
      outcome,
      summary: analysis.collected.resume ?? analysis.summary,
      meetingSlot: analysis.collected.meeting_slot,
      callbackAt: analysis.collected.callback_time,
      transcript: analysis.transcript.length > 0 ? analysis.transcript : undefined,
    })
    await store.saveProspect(analyzed)
    return { prospect: analyzed }
  }
  const { action: _action, ...result } = action
  const updated = applyCallResult(prospect, result)
  await store.saveProspect(updated)
  return { prospect: updated }
}
