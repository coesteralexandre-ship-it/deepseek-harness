import { NextResponse } from 'next/server'
import { callResultFromPayload, invoiceIdOf, postCallPayload, prospectIdOf, relanceResultFromPayload, verifyWebhookSignature } from '@/core/elevenlabs'
import { elevenLabsEnv } from '@/core/env'
import { jsonError } from '@/core/http'
import { applyCallResult } from '@/core/outcome'
import { applyRelanceResult } from '@/core/receivables'
import { getStore } from '@/core/store'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'

/**
 * ElevenLabs post-call webhook. Closes the matching call record and moves the
 * prospect, or the invoice of a reminder call, to the state the agent's analysis implies.
 */
export async function POST(request: Request) {
  const rawBody = await request.text()
  const { webhookSecret } = elevenLabsEnv()
  if (webhookSecret !== undefined && !verifyWebhookSignature(rawBody, request.headers.get('elevenlabs-signature'), webhookSecret)) {
    return jsonError('Signature invalide', 401)
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    // ElevenLabs only sends JSON; anything else is not a webhook delivery.
    return jsonError('JSON attendu', 400)
  }
  const parsed = postCallPayload.safeParse(json)
  if (!parsed.success) return jsonError(`Payload inattendu : ${parsed.error.issues[0]?.message ?? 'inconnu'}`, 400)
  const payload = parsed.data
  if (payload.type !== 'post_call_transcription') return NextResponse.json({ ignored: payload.type })

  const store = getStore()
  const conversationId = payload.data.conversation_id
  const invoiceId = invoiceIdOf(payload)
  if (invoiceId !== undefined) {
    const invoice = await store.getInvoice(invoiceId)
    if (invoice === undefined) return NextResponse.json({ ignored: 'facture inconnue', conversationId })
    const closed = applyRelanceResult(invoice, relanceResultFromPayload(payload), await workspaceNow(store))
    await store.saveInvoice(closed)
    return NextResponse.json({ ok: true, invoiceId: closed.id, status: closed.status, verified: webhookSecret !== undefined })
  }
  const prospectId = prospectIdOf(payload)
  const prospect = prospectId !== undefined
    ? await store.getProspect(prospectId)
    : (await store.listProspects()).find(candidate => candidate.calls.some(call => call.conversationId === conversationId))
  if (prospect === undefined) return NextResponse.json({ ignored: 'conversation sans prospect connu', conversationId })

  const updated = applyCallResult(prospect, callResultFromPayload(payload))
  await store.saveProspect(updated)
  return NextResponse.json({ ok: true, prospectId: updated.id, stage: updated.stage, verified: webhookSecret !== undefined })
}
