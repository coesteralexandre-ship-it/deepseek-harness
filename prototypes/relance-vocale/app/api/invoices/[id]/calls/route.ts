import { NextResponse } from 'next/server'
import { z } from 'zod'
import { answerFromTool, answerToolParams, describeAnswer } from '@/core/answer'
import { getConversationAnalysis, relanceResultFromCollected } from '@/core/elevenlabs'
import { errorResponse, jsonError, parseBody } from '@/core/http'
import { STAGE_META, applyRelanceResult, noteLiveAnswer, openRelanceCall, preferLiveAnswer, resultFromAnswer } from '@/core/receivables'
import { getStore } from '@/core/store'
import { RELANCE_OUTCOMES, type DebtorAnswer, type Invoice } from '@/core/types'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/**
 * `open` when the conversation connects, `note` when the agent's tool writes the debtor's answer mid-call,
 * `close` when the call ends (with the live answer, or what a person qualified), `analyze` to read the agent's own analysis back.
 */
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), mode: z.enum(['navigateur', 'telephone', 'simulation']), conversationId: z.string().optional() }),
  z.object({ action: z.literal('note'), callId: z.string().optional(), conversationId: z.string().optional(), answer: answerToolParams }),
  z.object({
    action: z.literal('close'),
    callId: z.string().optional(),
    conversationId: z.string().optional(),
    /** Absent: the call closes with the answer the agent noted live. */
    outcome: z.enum(RELANCE_OUTCOMES).optional(),
    summary: z.string().max(4000).optional(),
    promiseAmountEur: z.number().positive().max(10_000_000).optional(),
    promiseDate: z.string().max(200).optional(),
    disputeReason: z.string().max(1000).optional(),
    rightContact: z.string().max(300).optional(),
    transcript: z.array(z.object({ role: z.enum(['agent', 'user']), text: z.string().max(4000) })).max(500).optional(),
  }),
  z.object({ action: z.literal('analyze'), callId: z.string().optional(), conversationId: z.string() }),
])

/** What changed on the board: the column before and after, for the console's confirmation. */
function move(before: Invoice, after: Invoice) {
  return { from: STAGE_META[before.status].label, to: STAGE_META[after.status].label, knows: after.knows }
}

/** What the agent hears back from its tool, so its next sentence fits the answer it noted. */
function toolReply(answer: DebtorAnswer, sentence: string): string {
  const line = sentence.replace(/\.$/u, '')
  switch (answer.outcome) {
    case 'promesse':
      if (answer.promiseDate === undefined) return 'Noté : promesse de règlement, sans date. Demande une date précise, puis rappelle l’outil avec date_reglement.'
      return `Noté dans le dossier : ${line}. Récapitule au client la date et le montant, annonce l’email de récapitulatif, puis conclus.`
    case 'deja_regle':
      return `Noté dans le dossier : ${line}. Remercie, dis qu’un email lui demandera l’avis de virement pour le retrouver, puis conclus.`
    case 'litige':
      return `Noté dans le dossier : ${line}. Dis qu’un membre de l’équipe le rappelle avec la pièce, n’insiste pas sur le paiement, puis conclus.`
    case 'renvoi':
      return answer.rightContact !== undefined
        ? `Noté : la facture sera renvoyée à ${answer.rightContact}. Confirme-le au client, puis conclus.`
        : 'Noté : facture à renvoyer. Demande à qui l’envoyer (nom ou email de la comptabilité fournisseurs), puis rappelle l’outil avec bon_interlocuteur.'
    case 'rappel':
      return answer.callbackAt !== undefined ? `Noté : ${line}. Confirme le créneau, puis conclus.` : 'Noté : rappel demandé. Demande un jour et une heure précis, puis rappelle l’outil avec rappel_le.'
    default:
      return 'Noté. Conclus poliment.'
  }
}

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
    if (action.action === 'note') {
      const answer = answerFromTool(action.answer, now)
      const noted = noteLiveAnswer(invoice, action, answer, now)
      if (noted === undefined) return jsonError('Aucun appel en cours pour cette conversation', 404)
      await store.saveInvoice(noted)
      // The answer stored on this call: a « sans suite » note leaves the invoice's previous answer in place.
      const call = noted.calls.find(entry => (action.callId !== undefined && entry.id === action.callId) || (action.conversationId !== undefined && entry.conversationId === action.conversationId))
      const saved = call?.answer ?? answer
      const line = describeAnswer(saved)
      // Read back to the agent: what to say next depends on the answer.
      return NextResponse.json({ answer: saved, line, message: toolReply(saved, line) })
    }
    if (action.action === 'close') {
      const { action: _action, outcome, ...rest } = action
      const call = invoice.calls.find(entry => (rest.callId !== undefined && entry.id === rest.callId) || (rest.conversationId !== undefined && entry.conversationId === rest.conversationId))
      if (outcome === undefined && call?.answer === undefined) return jsonError('Aucune réponse notée pendant l’appel : choisir l’issue.', 422)
      const result = outcome !== undefined ? { ...rest, outcome, answerSource: 'vous' as const } : resultFromAnswer(call?.answer ?? { outcome: 'sans_suite', notedAt: new Date(now).toISOString(), source: 'direct' }, rest)
      const closed = applyRelanceResult(invoice, result, now)
      await store.saveInvoice(closed)
      return NextResponse.json({ invoice: closed, move: move(invoice, closed) })
    }
    const analysis = await getConversationAnalysis(action.conversationId)
    if (!analysis.done) return NextResponse.json({ invoice, pending: true })
    const fromAnalysis = { ...relanceResultFromCollected(action.conversationId, analysis.collected, analysis.summary, analysis.transcript), callId: action.callId }
    const analyzed = applyRelanceResult(invoice, preferLiveAnswer(invoice, fromAnalysis), now)
    await store.saveInvoice(analyzed)
    return NextResponse.json({ invoice: analyzed, pending: false, move: move(invoice, analyzed) })
  } catch (error) {
    return errorResponse(error)
  }
}
