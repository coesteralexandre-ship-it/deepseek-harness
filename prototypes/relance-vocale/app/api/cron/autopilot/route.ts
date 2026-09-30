import { NextResponse } from 'next/server'
import { jsonError } from '@/core/http'
import { getStore } from '@/core/store'
import { advance } from '@/core/workspace'

export const dynamic = 'force-dynamic'

/** Daily Vercel cron: run what came due. Vercel sends `Authorization: Bearer <CRON_SECRET>`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret === undefined || secret === '' || request.headers.get('authorization') !== `Bearer ${secret}`) return jsonError('Non autorisé', 401)
  const board = await advance(getStore(), 0)
  return NextResponse.json({ ok: true, invoices: board.invoices.length, autopilot: board.settings.autopilot })
}
