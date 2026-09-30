import { NextResponse } from 'next/server'
import { z } from 'zod'
import { dynamicVariablesFor } from '@/core/agent-prompt'
import { startOutboundCall } from '@/core/elevenlabs'
import { elevenLabsEnv, publicCallbackEnabled } from '@/core/env'
import { errorResponse, jsonError, parseBody } from '@/core/http'
import { CALLBACK_REQUEST_TITLE, recordLandingSignal } from '@/core/landing'
import { openCall } from '@/core/outcome'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

const body = z.object({
  toNumber: z.string().regex(/^\+[1-9]\d{6,14}$/, 'numéro au format E.164 attendu, ex. +33612345678'),
})

/** The prospect asks, from the public page, to be called back now. */
export async function POST(request: Request, { params }: Context) {
  const { token } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const env = elevenLabsEnv()
  if (!publicCallbackEnabled() || env.apiKey === undefined || env.agentId === undefined || env.phoneNumberId === undefined) {
    return jsonError('Le rappel téléphonique n’est pas activé sur cette démo.', 503)
  }
  const store = getStore()
  const prospect = await store.findProspectByToken(token)
  if (prospect === undefined) return jsonError('Lien inconnu', 404)
  const signals = await store.listSignals()
  const own = signals.filter(signal => signal.prospectId === prospect.id)
  try {
    const response = await startOutboundCall({
      agentId: env.agentId,
      phoneNumberId: env.phoneNumberId,
      toNumber: parsed.data.toNumber,
      dynamicVariables: dynamicVariablesFor(prospect, own),
    })
    if (!response.success) return jsonError(response.message ?? 'L’appel n’a pas pu être lancé', 502)
    const opened = openCall(prospect, 'telephone', response.conversationId)
    await store.saveProspect(opened.prospect)
    await recordLandingSignal(store, opened.prospect, signals, CALLBACK_REQUEST_TITLE, `Numéro se terminant par ${parsed.data.toNumber.slice(-2)}.`)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
