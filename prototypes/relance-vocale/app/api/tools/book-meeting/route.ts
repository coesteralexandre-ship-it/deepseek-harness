import { NextResponse } from 'next/server'
import { z } from 'zod'
import { toolSecret } from '@/core/env'
import { jsonError, parseBody } from '@/core/http'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

const body = z.object({
  /** ElevenLabs system variable `system__conversation_id`: the call record it names picks the prospect. */
  conversation_id: z.string().trim().min(1).max(200),
  /** Optional cross-check only: it comes from dynamic variables a public page can set. */
  prospect_id: z.string().optional(),
  slot: z.string().min(2).max(200),
  notes: z.string().max(2000).optional(),
})

/**
 * Server tool the agent can call mid-conversation (Agent → Tools → Webhook).
 * Marks the prospect of the call in progress as booked; the post-call webhook then closes the call.
 */
export async function POST(request: Request) {
  const secret = toolSecret()
  if (secret === undefined) {
    // An open tool is only acceptable in local development.
    if (process.env.NODE_ENV === 'production') return jsonError('Outil désactivé : TOOL_SECRET n’est pas configuré.', 503)
  } else if (request.headers.get('x-tool-secret') !== secret) {
    return jsonError('Secret d’outil invalide', 401)
  }
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const { conversation_id: conversationId, prospect_id: prospectId, slot, notes } = parsed.data
  const store = getStore()
  const prospect = (await store.listProspects()).find(candidate => candidate.calls.some(call => call.conversationId === conversationId && call.status === 'en_cours'))
  if (prospect === undefined) return jsonError('Aucun appel en cours pour cette conversation', 404)
  if (prospectId !== undefined && prospectId !== prospect.id) return jsonError('Le prospect ne correspond pas à l’appel en cours', 409)

  const now = new Date().toISOString()
  const calls = prospect.calls.map(call => (call.conversationId === conversationId && call.status === 'en_cours' ? { ...call, outcome: 'rdv' as const, meetingSlot: slot } : call))
  await store.saveProspect({
    ...prospect,
    calls,
    stage: 'rdv_pris',
    notes: notes !== undefined ? [prospect.notes, notes].filter(Boolean).join('\n') : prospect.notes,
    updatedAt: now,
  })
  return NextResponse.json({ ok: true, message: `Rendez-vous enregistré : ${slot}.` })
}
