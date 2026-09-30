import { NextResponse } from 'next/server'
import { applyCallsAction, callsAction } from '@/core/calls'
import { errorResponse, jsonError, parseBody } from '@/core/http'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

/** Journal of a browser conversation started from the public page. */
export async function POST(request: Request, { params }: Context) {
  const { token } = await params
  const parsed = await parseBody(request, callsAction)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const prospect = await store.findProspectByToken(token)
  if (prospect === undefined) return jsonError('Lien inconnu', 404)
  try {
    const result = await applyCallsAction(store, prospect, parsed.data)
    return NextResponse.json({ ok: true, callId: result.call?.id, pending: result.pending === true })
  } catch (error) {
    return errorResponse(error)
  }
}
