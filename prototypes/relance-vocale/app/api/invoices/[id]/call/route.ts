import { NextResponse } from 'next/server'
import { z } from 'zod'
import { startOutboundCall } from '@/core/elevenlabs'
import { elevenLabsEnv } from '@/core/env'
import { errorResponse, jsonError, parseBody } from '@/core/http'
import { openRelanceCall } from '@/core/receivables'
import { relanceVariablesFor } from '@/core/relance-prompt'
import { getStore } from '@/core/store'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const body = z.object({
  /** Dial this E.164 number instead of the debtor's, to receive the reminder call yourself. */
  toNumber: z.string().regex(/^\+[1-9]\d{6,14}$/, 'numéro au format E.164 attendu, ex. +33612345678').optional(),
})

/** Start a real reminder call through ElevenLabs. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const env = elevenLabsEnv()
  if (env.apiKey === undefined || env.relanceAgentId === undefined || env.phoneNumberId === undefined) {
    return jsonError('Appel sortant non configuré : renseigner ELEVENLABS_API_KEY, ELEVENLABS_RELANCE_AGENT_ID et ELEVENLABS_PHONE_NUMBER_ID.', 503)
  }
  const store = getStore()
  const invoice = await store.getInvoice(id)
  if (invoice === undefined) return jsonError('Facture introuvable', 404)
  // An invoice imported without a number must not open a call that ElevenLabs will refuse.
  if ((parsed.data.toNumber ?? invoice.debtor.phone).trim() === '') return jsonError('Aucun numéro de téléphone pour ce client : complétez la fiche avant d’appeler.', 400)
  try {
    const response = await startOutboundCall({
      // The phone agent has no client tool: no browser answers one during a phone call.
      agentId: env.relancePhoneAgentId ?? env.relanceAgentId,
      phoneNumberId: env.phoneNumberId,
      toNumber: parsed.data.toNumber ?? invoice.debtor.phone,
      dynamicVariables: relanceVariablesFor(invoice, new Date(await workspaceNow(store))),
    })
    if (!response.success) return jsonError(response.message ?? 'ElevenLabs a refusé l’appel', 502)
    const opened = openRelanceCall(invoice, 'telephone', response.conversationId, await workspaceNow(store))
    await store.saveInvoice(opened.invoice)
    return NextResponse.json({ call: opened.call, conversationId: response.conversationId })
  } catch (error) {
    return errorResponse(error)
  }
}
