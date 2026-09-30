import { z } from 'zod'
import { applyCallResult, openCall } from './outcome.ts'
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
])

export type CallsAction = z.infer<typeof callsAction>

/** Open or close a call record and persist the prospect. */
export async function applyCallsAction(store: Store, prospect: Prospect, action: CallsAction): Promise<{ prospect: Prospect; call?: CallRecord }> {
  if (action.action === 'open') {
    const opened = openCall(prospect, action.mode, action.conversationId)
    await store.saveProspect(opened.prospect)
    return opened
  }
  const { action: _action, ...result } = action
  const updated = applyCallResult(prospect, result)
  await store.saveProspect(updated)
  return { prospect: updated }
}
