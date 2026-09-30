import { NextResponse } from 'next/server'
import { z } from 'zod'
import { jsonError, parseBody } from '@/core/http'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const body = z.object({ status: z.enum(['qualifie', 'ignore', 'nouveau']) })

/** Qualify a signal (its prospect becomes callable) or ignore it. */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const signal = await store.getSignal(id)
  if (signal === undefined) return jsonError('Signal introuvable', 404)
  const updated = { ...signal, status: parsed.data.status }
  await store.saveSignal(updated)

  const prospect = await store.getProspect(signal.prospectId)
  if (prospect !== undefined && parsed.data.status === 'qualifie' && prospect.stage === 'nouveau') {
    await store.saveProspect({ ...prospect, stage: 'a_appeler', updatedAt: new Date().toISOString() })
  }
  return NextResponse.json({ signal: updated })
}
