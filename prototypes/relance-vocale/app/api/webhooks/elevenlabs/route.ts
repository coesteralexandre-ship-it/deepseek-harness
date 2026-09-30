import { NextResponse } from 'next/server'
import { callResultFromPayload, postCallPayload, relanceResultFromPayload, verifyWebhookSignature } from '@/core/elevenlabs'
import { elevenLabsEnv } from '@/core/env'
import { jsonError } from '@/core/http'
import { applyCallResult } from '@/core/outcome'
import { applyRelanceResult } from '@/core/receivables'
import { getStore } from '@/core/store'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'

/** An agent id on the payload must match the configured one; either side unset skips the check. */
function fromAgent(payloadAgentId: string | undefined, expected: string | undefined): boolean {
  return payloadAgentId === undefined || expected === undefined || payloadAgentId === expected
}

/**
 * ElevenLabs post-call webhook. Closes the call record the server opened for the
 * conversation and moves its prospect, or the invoice of a reminder call, to the state
 * the agent's analysis implies. The dynamic variables never pick the target.
 */
export async function POST(request: Request) {
  const rawBody = await request.text()
  const { webhookSecret, agentId, relanceAgentId } = elevenLabsEnv()
  if (webhookSecret === undefined) {
    // Unsigned deliveries are only accepted in local development.
    if (process.env.NODE_ENV === 'production') return jsonError('Webhook désactivé : ELEVENLABS_WEBHOOK_SECRET n’est pas configuré.', 503)
  } else if (!verifyWebhookSignature(rawBody, request.headers.get('elevenlabs-signature'), webhookSecret)) {
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
  const payloadAgentId = payload.data.agent_id
  const invoice = (await store.listInvoices()).find(candidate => candidate.calls.some(call => call.conversationId === conversationId))
  if (invoice !== undefined) {
    if (!fromAgent(payloadAgentId, relanceAgentId)) return NextResponse.json({ ignored: 'agent inattendu', conversationId })
    if (invoice.status === 'encaissee') return NextResponse.json({ ignored: 'facture déjà encaissée', conversationId })
    const closed = applyRelanceResult(invoice, relanceResultFromPayload(payload), await workspaceNow(store))
    await store.saveInvoice(closed)
    return NextResponse.json({ ok: true, invoiceId: closed.id, status: closed.status, verified: webhookSecret !== undefined })
  }
  const prospect = (await store.listProspects()).find(candidate => candidate.calls.some(call => call.conversationId === conversationId))
  if (prospect === undefined) return NextResponse.json({ ignored: 'conversation sans appel enregistré', conversationId })
  if (!fromAgent(payloadAgentId, agentId)) return NextResponse.json({ ignored: 'agent inattendu', conversationId })

  const updated = applyCallResult(prospect, callResultFromPayload(payload))
  await store.saveProspect(updated)
  return NextResponse.json({ ok: true, prospectId: updated.id, stage: updated.stage, verified: webhookSecret !== undefined })
}
