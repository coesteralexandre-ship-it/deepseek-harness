import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enrichContacts, enrichKeys, mapTeam } from '@/core/enrich'
import { jsonError, parseBody } from '@/core/http'
import { dailyCapUsd, recordSpend, spentToday } from '@/core/ratelimit'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'
// Website reading plus up to five searches: allow more than the default.
export const maxDuration = 60

type Context = { params: Promise<{ id: string }> }

const body = z.object({ what: z.enum(['contacts', 'equipe']) })

/** Enrich one prospect on demand: `contacts` (site, numbers, LinkedIn) or `equipe` (team map). */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const keys = enrichKeys()
  if (keys.exa === undefined) return jsonError('Enrichissement non configuré : renseigner EXA_API_KEY (et SERPER_API_KEY pour combler les trous).', 503)
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  // Paid searches: a daily cap for the instance, and a cap per prospect so one fiche cannot be relaunched without end.
  if (spentToday() >= dailyCapUsd()) return jsonError(`Plafond du jour atteint (${dailyCapUsd()} $ d’enrichissement, ENRICH_DAILY_USD).`, 429)
  if ((prospect.enrichment?.costUsd ?? 0) >= 0.6) return jsonError('Ce prospect a déjà reçu 0,60 $ de recherches : les relances sont bloquées pour éviter la dépense.', 429)
  const before = prospect.enrichment?.costUsd ?? 0
  try {
    if (parsed.data.what === 'contacts') {
      const enrichment = await enrichContacts(prospect, keys, { useSerper: true })
      recordSpend(enrichment.costUsd - before)
      await store.saveProspect({ ...prospect, enrichment, updatedAt: new Date().toISOString() })
      return NextResponse.json({ enrichment })
    }
    const { team, cost } = await mapTeam(prospect, keys)
    const base = prospect.enrichment ?? { phones: [], emails: [], enrichedAt: new Date().toISOString(), costUsd: 0, gaps: [] }
    const enrichment = { ...base, team, teamMappedAt: new Date().toISOString(), costUsd: Math.round((base.costUsd + cost) * 1000) / 1000 }
    recordSpend(cost)
    await store.saveProspect({ ...prospect, enrichment, updatedAt: new Date().toISOString() })
    return NextResponse.json({ enrichment })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Enrichissement impossible', /épuisés/u.test(String(error)) ? 402 : 502)
  }
}
