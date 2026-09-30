import { NextResponse } from 'next/server'
import { z } from 'zod'
import { toolSecret } from '@/core/env'
import { jsonError, parseBody } from '@/core/http'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

const body = z.object({
  prospect_id: z.string(),
  slot: z.string().min(2).max(200),
  notes: z.string().max(2000).optional(),
})

/**
 * Server tool the agent can call mid-conversation (Agent → Tools → Webhook).
 * Marks the prospect as booked; the post-call webhook then closes the call.
 */
export async function POST(request: Request) {
  const secret = toolSecret()
  if (secret !== undefined && request.headers.get('x-tool-secret') !== secret) return jsonError('Secret d’outil invalide', 401)
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const prospect = await store.getProspect(parsed.data.prospect_id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)

  const now = new Date().toISOString()
  const calls = prospect.calls.map(call => (call.status === 'en_cours' ? { ...call, outcome: 'rdv' as const, meetingSlot: parsed.data.slot } : call))
  await store.saveProspect({
    ...prospect,
    calls,
    stage: 'rdv_pris',
    notes: parsed.data.notes !== undefined ? [prospect.notes, parsed.data.notes].filter(Boolean).join('\n') : prospect.notes,
    updatedAt: now,
  })
  return NextResponse.json({ ok: true, message: `Rendez-vous enregistré : ${parsed.data.slot}.` })
}
