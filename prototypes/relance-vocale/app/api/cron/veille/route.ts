import { NextResponse } from 'next/server'
import { jsonError } from '@/core/http'
import { dailyCapUsd, recordSpend, spentToday } from '@/core/ratelimit'
import { getStore } from '@/core/store'
import { runWatch } from '@/core/veille'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Daily Vercel cron: free sources every weekday; paid ones on Monday only, under the daily cap. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret === undefined || secret === '' || request.headers.get('authorization') !== `Bearer ${secret}`) return jsonError('Non autorisé', 401)
  const store = getStore()
  const now = await workspaceNow(store)
  const monday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Europe/Paris' }).format(new Date(now)) === 'Mon'
  const remaining = dailyCapUsd() - spentToday()
  const report = await runWatch(store, { paid: monday && remaining > 0, maxCostUsd: Math.min(2, Math.max(0, remaining)), trigger: 'cron', now })
  if (report.costUsd > 0) recordSpend(report.costUsd)
  return NextResponse.json({ ok: true, prospects: report.prospects, created: report.created, bySource: report.bySource, errors: report.errors.length, costUsd: report.costUsd, skipped: report.skipped })
}
