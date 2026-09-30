import { NextResponse } from 'next/server'
import { applyPublicCallsAction, CallJournalError, publicCallsAction } from '@/core/calls'
import { errorResponse, jsonError, parseBody } from '@/core/http'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

/**
 * Journal of a browser conversation started from the public page: the visitor opens the
 * call on the link's prospect, and its outcome is read back from ElevenLabs.
 */
export async function POST(request: Request, { params }: Context) {
  const { token } = await params
  const parsed = await parseBody(request, publicCallsAction)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const prospect = await store.findProspectByToken(token)
  if (prospect === undefined) return jsonError('Lien inconnu', 404)
  try {
    const result = await applyPublicCallsAction(store, prospect, parsed.data)
    return NextResponse.json({ ok: true, callId: result.call?.id, pending: result.pending === true })
  } catch (error) {
    if (error instanceof CallJournalError) return jsonError(error.message, error.status)
    return errorResponse(error)
  }
}
