import { NextResponse } from 'next/server'
import { resetAllowed } from '@/core/env'
import { jsonError } from '@/core/http'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

/** Reload the seed data. Refused in production unless `ALLOW_RESET=1`: it wipes every prospect, invoice and call. */
export async function POST() {
  if (!resetAllowed()) return jsonError('Remise à zéro désactivée en production (ALLOW_RESET=1 pour l’autoriser).', 403)
  await getStore().reset()
  return NextResponse.json({ ok: true })
}
