import { NextResponse } from 'next/server'
import { z } from 'zod'
import { jsonError, parseBody } from '@/core/http'
import { getStore } from '@/core/store'
import { STAGE_META } from '@/core/stages'
import { addTask, logProspect } from '@/core/tasks'
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
  letter: z.string().max(6000).optional(),
  voiceScript: z.string().max(2000).optional(),
  nextCallAt: z.string().datetime({ offset: true }).nullable().optional(),
})

/** Move a prospect on the board or edit its notes, opening angle, letter and voice script. */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, patchBody)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  const { stage, notes, angle, letter, voiceScript, nextCallAt } = parsed.data
  const now = Date.now()
  const callAt = nextCallAt === null ? undefined : nextCallAt ?? prospect.nextCallAt
  // A callback without a date is a card nobody comes back to: the stage requires one.
  if (stage === 'a_rappeler' && callAt === undefined) return jsonError('Une date de rappel est requise pour passer « À rappeler ».', 400)
  if (stage === 'a_rappeler' && callAt !== undefined && Date.parse(callAt) < now - 60_000) return jsonError('La date de rappel est déjà passée.', 400)
  let updated: typeof prospect = {
    ...prospect,
    stage: stage ?? prospect.stage,
    notes: notes ?? prospect.notes,
    angle: angle ?? prospect.angle,
    letter: letter ?? prospect.letter,
    voiceScript: voiceScript ?? prospect.voiceScript,
    nextCallAt: callAt,
    updatedAt: new Date(now).toISOString(),
  }
  if (stage !== undefined && stage !== prospect.stage) updated = logProspect(updated, `Étape : ${STAGE_META[stage].label}`, undefined, now)
  // The stage's date becomes the task the « Aujourd’hui » page shows.
  if (updated.stage === 'a_rappeler' && callAt !== undefined && (callAt !== prospect.nextCallAt || stage === 'a_rappeler')) {
    const who = `${prospect.contact.firstName} ${prospect.contact.lastName}`.trim() || prospect.company
    updated = addTask(updated, { title: `Rappeler ${who}`, kind: 'appel', dueAt: callAt, fromStage: true }, now)
  }
  await store.saveProspect(updated)
  return NextResponse.json(toView(updated, await store.listSignals()))
}
