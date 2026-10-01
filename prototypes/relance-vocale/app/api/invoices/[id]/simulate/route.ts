import { NextResponse } from 'next/server'
import { z } from 'zod'
import { jsonError, parseBody } from '@/core/http'
import { STAGE_META, applyRelanceResult } from '@/core/receivables'
import { simulatedCall } from '@/core/simulation'
import { getStore } from '@/core/store'
import { RELANCE_OUTCOMES } from '@/core/types'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const body = z.object({ outcome: z.enum(RELANCE_OUTCOMES).default('promesse') })

/** Replay a finished reminder call without consuming minutes. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const invoice = await store.getInvoice(id)
  if (invoice === undefined) return jsonError('Facture introuvable', 404)
  const now = await workspaceNow(store)
  const updated = applyRelanceResult(invoice, simulatedCall(invoice, parsed.data.outcome, now), now)
  await store.saveInvoice(updated)
  return NextResponse.json({ ...updated, move: { from: STAGE_META[invoice.status].label, to: STAGE_META[updated.status].label, knows: updated.knows } })
}
