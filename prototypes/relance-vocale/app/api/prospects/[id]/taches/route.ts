import { NextResponse } from 'next/server'
import { z } from 'zod'
import { jsonError, parseBody } from '@/core/http'
import { getStore } from '@/core/store'
import { addTask, completeTask, deleteTask, reopenTask } from '@/core/tasks'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const createBody = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['appel', 'courrier', 'email', 'autre']).default('autre'),
  dueAt: z.string().datetime({ offset: true }),
  note: z.string().trim().max(1000).optional(),
})

const patchBody = z.object({ taskId: z.string().min(1), action: z.enum(['faite', 'rouvrir', 'supprimer']) })

/** Add a dated task to a prospect. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, createBody)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  const updated = addTask(prospect, parsed.data, Date.now())
  await store.saveProspect(updated)
  return NextResponse.json({ tasks: updated.tasks })
}

/** Mark a task done, reopen it, or remove it. */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, patchBody)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  const now = Date.now()
  const { taskId, action } = parsed.data
  const updated = action === 'faite' ? completeTask(prospect, taskId, now) : action === 'rouvrir' ? reopenTask(prospect, taskId, now) : deleteTask(prospect, taskId, now)
  await store.saveProspect(updated)
  return NextResponse.json({ tasks: updated.tasks })
}
