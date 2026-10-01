import { NextResponse } from 'next/server'
import { z } from 'zod'
import { jsonError, parseBody } from '@/core/http'
import { allow, dailyCapUsd, recordSpend, spentToday, tooMany } from '@/core/ratelimit'
import { getStore } from '@/core/store'
import { SOURCES, runWatch } from '@/core/veille'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const body = z.object({
  sources: z.array(z.string()).optional(),
  paid: z.boolean().default(false),
  prospectIds: z.array(z.string()).max(50).optional(),
})

/** State of each watch source: ready or why not, plus the last run. */
export async function GET() {
  const settings = await getStore().getSettings()
  return NextResponse.json({ sources: SOURCES.map(source => ({ key: source.key, label: source.label, unavailable: source.unavailable() ?? null, paid: source.key === 'equipe' || source.key === 'avis' })), lastRun: settings.veilleLastRun ?? null })
}

/** Run the watch now. Hundreds of public requests: a few runs an hour, and paid sources only when asked and under the daily cap. */
export async function POST(request: Request) {
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  if (!allow('veille', 4, 3_600_000)) return tooMany('veilles', 3600)
  const store = getStore()
  const remaining = dailyCapUsd() - spentToday()
  if (parsed.data.paid && remaining <= 0) return jsonError(`Plafond du jour atteint (${dailyCapUsd()} $, ENRICH_DAILY_USD) : relancez sans les sources payantes.`, 429)
  const now = await workspaceNow(store)
  const report = await runWatch(store, { ...parsed.data, maxCostUsd: Math.min(2, Math.max(0, remaining)), trigger: 'manuel', now })
  if (report.costUsd > 0) recordSpend(report.costUsd)
  const { created_signals, ...rest } = report
  return NextResponse.json({ ...rest, signals: created_signals.map(signal => ({ id: signal.id, prospectId: signal.prospectId, source: signal.source, title: signal.title })) })
}
