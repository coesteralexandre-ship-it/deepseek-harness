import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dynamicVariablesFor } from '@/core/agent-prompt'
import { startOutboundCall } from '@/core/elevenlabs'
import { elevenLabsEnv } from '@/core/env'
import { errorResponse, jsonError, parseBody } from '@/core/http'
import { openCall } from '@/core/outcome'
import { getStore } from '@/core/store'
import { toView } from '@/core/views'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const body = z.object({
  /** Dial this E.164 number instead of the prospect's, to receive the demo call yourself. */
  toNumber: z.string().regex(/^\+[1-9]\d{6,14}$/, 'numéro au format E.164 attendu, ex. +33612345678').optional(),
})

/** Start a real outbound phone call through ElevenLabs. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const env = elevenLabsEnv()
  if (env.apiKey === undefined || env.agentId === undefined || env.phoneNumberId === undefined) {
    return jsonError('Appel sortant non configuré : renseigner ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID et ELEVENLABS_PHONE_NUMBER_ID.', 503)
  }
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  const signals = (await store.listSignals()).filter(signal => signal.prospectId === prospect.id)

  try {
    const response = await startOutboundCall({
      agentId: env.agentId,
      phoneNumberId: env.phoneNumberId,
      toNumber: parsed.data.toNumber ?? prospect.contact.phone,
      dynamicVariables: dynamicVariablesFor(prospect, signals),
    })
    if (!response.success) return jsonError(response.message ?? 'ElevenLabs a refusé l’appel', 502)
    const opened = openCall(prospect, 'telephone', response.conversationId)
    await store.saveProspect(opened.prospect)
    return NextResponse.json({ call: opened.call, callSid: response.callSid, prospect: toView(opened.prospect, signals) })
  } catch (error) {
    return errorResponse(error)
  }
}
