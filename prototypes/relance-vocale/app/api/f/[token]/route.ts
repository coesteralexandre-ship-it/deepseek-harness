import { NextResponse } from 'next/server'
import { z } from 'zod'
import { applyDebtorAnswer, promiseDateError } from '@/core/debtor'
import { jsonError, parseBody } from '@/core/http'
import { getStore } from '@/core/store'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

const body = z.discriminatedUnion('answer', [
  z.object({ answer: z.literal('promesse'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date au format AAAA-MM-JJ attendue') }),
  z.object({ answer: z.literal('confirmer'), promiseId: z.string().min(1).max(40) }),
  z.object({ answer: z.literal('litige'), reason: z.string().trim().min(3).max(600) }),
  z.object({ answer: z.literal('contact'), contact: z.string().trim().min(3).max(200) }),
  z.object({ answer: z.literal('rappel'), when: z.string().trim().min(2).max(120) }),
])

/**
 * The debtor answers from the public page; the invoice moves on the board at once,
 * unless the team holds it (À vous, Litige): then the answer is only logged.
 */
export async function POST(request: Request, { params }: Context) {
  const { token } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const invoice = await store.findInvoiceByToken(token)
  if (invoice === undefined) return jsonError('Lien inconnu', 404)
  if (invoice.status === 'encaissee') return jsonError('Cette facture est déjà réglée.', 409)
  if (parsed.data.answer === 'confirmer' && !invoice.promises.some(promise => promise.id === (parsed.data as { promiseId: string }).promiseId)) return jsonError('Promesse introuvable', 404)
  const now = await workspaceNow(store)
  if (parsed.data.answer === 'promesse') {
    const refused = promiseDateError(parsed.data.date, now)
    if (refused !== undefined) return jsonError(refused, 400)
  }
  await store.saveInvoice(applyDebtorAnswer(invoice, parsed.data, now))
  return NextResponse.json({ ok: true })
}
