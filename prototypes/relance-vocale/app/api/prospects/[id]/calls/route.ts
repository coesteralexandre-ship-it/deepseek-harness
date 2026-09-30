import { NextResponse } from 'next/server'
import { applyCallsAction, callsAction } from '@/core/calls'
import { errorResponse, jsonError, parseBody } from '@/core/http'
import { getStore } from '@/core/store'
import { toView } from '@/core/views'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** Record a browser conversation: `open` when it connects, `close` with its outcome when it ends. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, callsAction)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  try {
    const result = await applyCallsAction(store, prospect, parsed.data)
    return NextResponse.json({ call: result.call, prospect: toView(result.prospect, await store.listSignals()), pending: result.pending === true })
  } catch (error) {
    return errorResponse(error)
  }
}
