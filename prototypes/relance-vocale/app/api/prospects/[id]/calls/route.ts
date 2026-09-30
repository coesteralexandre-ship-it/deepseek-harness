import { NextResponse } from 'next/server'
import { z } from 'zod'
import { jsonError, parseBody } from '@/core/http'
import { applyCallResult, openCall } from '@/core/outcome'
import { getStore } from '@/core/store'
import { toView } from '@/core/views'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const body = z.discriminatedUnion('action', [
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

/** Record a browser conversation: `open` when it connects, `close` with its outcome when it ends. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)

  if (parsed.data.action === 'open') {
    const opened = openCall(prospect, parsed.data.mode, parsed.data.conversationId)
    await store.saveProspect(opened.prospect)
    return NextResponse.json({ call: opened.call, prospect: toView(opened.prospect, await store.listSignals()) })
  }

  const { action: _action, ...result } = parsed.data
  const updated = applyCallResult(prospect, result)
  await store.saveProspect(updated)
  return NextResponse.json(toView(updated, await store.listSignals()))
}
