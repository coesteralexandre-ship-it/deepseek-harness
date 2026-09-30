import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getConversationAnalysis } from '@/core/elevenlabs'
import { errorResponse, jsonError, parseBody } from '@/core/http'
import { applyRelanceResult, openRelanceCall, parseAmount, parseRelanceOutcome } from '@/core/receivables'
import { getStore } from '@/core/store'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** `open` when the conversation connects, `close` with what a person qualified, `analyze` to read the agent's own analysis back. */
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), mode: z.enum(['navigateur', 'telephone', 'simulation']), conversationId: z.string().optional() }),
  z.object({
    action: z.literal('close'),
    callId: z.string().optional(),
    conversationId: z.string().optional(),
    outcome: z.enum(['promesse', 'litige', 'renvoi', 'rappel', 'sans_suite']),
    summary: z.string().max(4000).optional(),
    promiseAmountEur: z.number().positive().max(10_000_000).optional(),
    promiseDate: z.string().max(200).optional(),
    disputeReason: z.string().max(1000).optional(),
    rightContact: z.string().max(300).optional(),
    transcript: z.array(z.object({ role: z.enum(['agent', 'user']), text: z.string().max(4000) })).max(500).optional(),
  }),
  z.object({ action: z.literal('analyze'), callId: z.string().optional(), conversationId: z.string() }),
])

/** Journal of a reminder call held from the app. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const invoice = await store.getInvoice(id)
  if (invoice === undefined) return jsonError('Facture introuvable', 404)
  const now = await workspaceNow(store)
  const action = parsed.data
  try {
    if (action.action === 'open') {
      const opened = openRelanceCall(invoice, action.mode, action.conversationId, now)
      await store.saveInvoice(opened.invoice)
      return NextResponse.json({ call: opened.call, invoice: opened.invoice })
    }
    if (action.action === 'close') {
      const { action: _action, ...result } = action
      const closed = applyRelanceResult(invoice, result, now)
      await store.saveInvoice(closed)
      return NextResponse.json({ invoice: closed })
    }
    const analysis = await getConversationAnalysis(action.conversationId)
    if (!analysis.done) return NextResponse.json({ invoice, pending: true })
    const analyzed = applyRelanceResult(invoice, {
      callId: action.callId,
      conversationId: action.conversationId,
      outcome: parseRelanceOutcome(analysis.collected.relance_outcome),
      summary: analysis.collected.resume ?? analysis.summary,
      promiseDate: analysis.collected.promise_date,
      promiseAmountEur: parseAmount(analysis.collected.promise_amount),
      disputeReason: analysis.collected.dispute_reason,
      rightContact: analysis.collected.right_contact,
      transcript: analysis.transcript.length > 0 ? analysis.transcript : undefined,
    }, now)
    await store.saveInvoice(analyzed)
    return NextResponse.json({ invoice: analyzed, pending: false })
  } catch (error) {
    return errorResponse(error)
  }
}
