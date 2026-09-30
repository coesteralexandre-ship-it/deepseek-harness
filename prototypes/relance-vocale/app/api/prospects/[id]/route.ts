import { NextResponse } from 'next/server'
import { z } from 'zod'
import { jsonError, parseBody } from '@/core/http'
import { getStore } from '@/core/store'
import { STAGES } from '@/core/types'
import { toView } from '@/core/views'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  return NextResponse.json(toView(prospect, await store.listSignals()))
}

const patchBody = z.object({
  stage: z.enum(STAGES).optional(),
  notes: z.string().max(4000).optional(),
  angle: z.string().max(600).optional(),
  nextCallAt: z.string().datetime({ offset: true }).nullable().optional(),
})

/** Move a prospect on the board or edit its notes and opening angle. */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, patchBody)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  const { stage, notes, angle, nextCallAt } = parsed.data
  const updated = {
    ...prospect,
    stage: stage ?? prospect.stage,
    notes: notes ?? prospect.notes,
    angle: angle ?? prospect.angle,
    nextCallAt: nextCallAt === null ? undefined : nextCallAt ?? prospect.nextCallAt,
    updatedAt: new Date().toISOString(),
  }
  await store.saveProspect(updated)
  return NextResponse.json(toView(updated, await store.listSignals()))
}
