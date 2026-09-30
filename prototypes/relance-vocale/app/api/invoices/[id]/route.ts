import { NextResponse } from 'next/server'
import { z } from 'zod'
import { runDueAction } from '@/core/autopilot'
import { jsonError, parseBody } from '@/core/http'
import { STAGE_META, breakPromise, keepPromise, logActivity, markPaid } from '@/core/receivables'
import { getStore } from '@/core/store'
import { INVOICE_STAGES, type Invoice } from '@/core/types'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params
  const invoice = await getStore().getInvoice(id)
  return invoice === undefined ? jsonError('Facture introuvable', 404) : NextResponse.json(invoice)
}

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('paid') }),
  z.object({ action: z.literal('takeover') }),
  z.object({ action: z.literal('resume') }),
  /** Drag and drop on the board. */
  z.object({ action: z.literal('move'), status: z.enum(INVOICE_STAGES) }),
  /** Run the next action now instead of waiting for its date. */
  z.object({ action: z.literal('advance') }),
  z.object({ action: z.literal('promise'), promiseId: z.string(), status: z.enum(['tenue', 'rompue']) }),
])

/** Decisions the client's team takes on an invoice. */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const [invoice, settings] = await Promise.all([store.getInvoice(id), store.getSettings()])
  if (invoice === undefined) return jsonError('Facture introuvable', 404)
  const now = await workspaceNow(store)
  const action = parsed.data
  let updated: Invoice
  switch (action.action) {
    case 'paid':
      updated = markPaid(invoice, now, 'vous')
      break
    case 'takeover':
      updated = logActivity({ ...invoice, status: 'a_vous', followUpAt: undefined, knows: 'Reprise par votre équipe' }, { kind: 'etape', actor: 'vous', title: 'Reprise en main par votre équipe' }, now)
      break
    case 'resume':
      updated = logActivity({ ...invoice, status: 'appel', followUpAt: new Date(now + 3_600_000).toISOString(), knows: 'Rendue à Léa, rappel dans l’heure' }, { kind: 'etape', actor: 'vous', title: 'Rendue à Léa' }, now)
      break
    case 'move':
      if (action.status === invoice.status) return NextResponse.json(invoice)
      updated = action.status === 'encaissee'
        ? markPaid(invoice, now, 'vous')
        : logActivity({ ...invoice, status: action.status }, { kind: 'etape', actor: 'vous', title: `Déplacée vers « ${STAGE_META[action.status].label} »` }, now)
      break
    case 'advance':
      updated = runDueAction(invoice, now, settings.autopilot, true)
      if (updated === invoice) return jsonError('Aucune action à lancer sur cette facture.', 409)
      break
    default:
      if (!invoice.promises.some(promise => promise.id === action.promiseId)) return jsonError('Promesse introuvable', 404)
      updated = action.status === 'tenue' ? keepPromise(invoice, action.promiseId, now, 'vous') : breakPromise(invoice, action.promiseId, now, 'vous')
  }
  await store.saveInvoice(updated)
  return NextResponse.json(updated)
}
