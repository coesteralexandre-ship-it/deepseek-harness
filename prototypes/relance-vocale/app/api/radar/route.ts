import { NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse, jsonError, parseBody } from '@/core/http'
import { allow, tooMany } from '@/core/ratelimit'
import { RadarSourceError, prospectFromRadar, scanDepartement } from '@/core/radar'
import { getStore } from '@/core/store'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Metropolitan 01 to 95 (Corsica as 2A / 2B, never 20) and overseas 971 to 976. */
const DEPARTEMENT = /^(0[1-9]|1\d|2[1-9]|[3-8]\d|9[0-5]|2A|2B|97[1-6])$/u

const body = z.object({
  departement: z.string().trim().toUpperCase().refine(value => value !== '20', 'la Corse se saisit 2A ou 2B').refine(value => value === '20' || DEPARTEMENT.test(value), 'département inconnu, ex. 69, 2A ou 974'),
  minDsoDays: z.number().int().min(20).max(200).default(60),
  maxCompanies: z.number().int().min(25).max(200).default(100),
})

/** Scan the public directory and INPI ratios of one département and add the agencies with a long customer credit to the pipeline. */
export async function POST(request: Request) {
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  // A scan is hundreds of public requests: a handful per hour is plenty.
  if (!allow('radar', 6, 3_600_000)) return tooMany('balayages', 3600)
  const store = getStore()
  try {
    const result = await scanDepartement(parsed.data)
    const known = new Set((await store.listProspects()).map(prospect => prospect.siren).filter(Boolean))
    const now = await workspaceNow(store)
    let added = 0
    for (const company of result.kept) {
      if (known.has(company.siren)) continue
      const { prospect, signal } = prospectFromRadar(company, result.medianDays, result.withAccounts, now)
      await store.saveProspect(prospect)
      await store.saveSignal(signal)
      added += 1
    }
    return NextResponse.json({ scanned: result.scanned, withAccounts: result.withAccounts, medianDays: result.medianDays, kept: result.kept.length, added, networks: result.networks })
  } catch (error) {
    if (error instanceof RadarSourceError) return jsonError(error.message, 502)
    return errorResponse(error)
  }
}
