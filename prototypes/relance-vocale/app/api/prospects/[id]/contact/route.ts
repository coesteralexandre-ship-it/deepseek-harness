import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordOf } from '@/core/contact'
import { jsonError, parseBody } from '@/core/http'
import { getStore } from '@/core/store'
import { logProspect } from '@/core/tasks'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('opposition'), reason: z.string().trim().min(1).max(300) }),
  z.object({ action: z.literal('lever'), reason: z.string().trim().min(1).max(300) }),
  z.object({ action: z.literal('notice') }),
])

/**
 * The prospect's record: « ne plus contacter » (and lifting it, with a reason each time) and the date the
 * information notice went out. Every change is written to the prospect's history.
 */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  const now = Date.now()
  const iso = new Date(now).toISOString()
  const record = recordOf(prospect)
  const action = parsed.data
  let updated = prospect
  if (action.action === 'opposition') {
    updated = logProspect({ ...prospect, record: { ...record, optOut: { at: iso, reason: action.reason } }, stage: 'pas_interesse', nextCallAt: undefined }, 'Ne plus contacter', action.reason, now)
  } else if (action.action === 'lever') {
    const { optOut: _dropped, ...rest } = record
    updated = logProspect({ ...prospect, record: rest }, 'Contact à nouveau autorisé', action.reason, now)
  } else {
    updated = logProspect({ ...prospect, record: { ...record, noticeSentAt: iso } }, 'Information sur l’origine des données envoyée', 'Article 14 du RGPD : origine des données et droit d’opposition.', now)
  }
  await store.saveProspect(updated)
  return NextResponse.json({ record: updated.record, stage: updated.stage })
}
