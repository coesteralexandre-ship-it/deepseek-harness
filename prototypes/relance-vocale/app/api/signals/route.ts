import { NextResponse } from 'next/server'
import { z } from 'zod'
import { jsonError, parseBody } from '@/core/http'
import { newId } from '@/core/ids'
import { getStore } from '@/core/store'
import { SIGNAL_SOURCES, type Prospect, type Signal } from '@/core/types'

export const dynamic = 'force-dynamic'

/** Signals with the company they belong to, newest first. */
export async function GET() {
  const store = getStore()
  const [signals, prospects] = await Promise.all([store.listSignals(), store.listProspects()])
  const companies = new Map(prospects.map(prospect => [prospect.id, prospect.company]))
  const items = signals
    .map(signal => ({ ...signal, company: companies.get(signal.prospectId) ?? '?' }))
    .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
  return NextResponse.json({ signals: items })
}

const signalFields = {
  source: z.enum(SIGNAL_SOURCES),
  title: z.string().min(3).max(200),
  excerpt: z.string().max(1000).default(''),
  url: z.string().url().optional(),
  weight: z.number().int().min(1).max(5).default(3),
  detectedAt: z.string().datetime({ offset: true }).optional(),
}

const newProspect = z.object({
  company: z.string().min(2).max(120),
  city: z.string().max(80).default(''),
  headcount: z.string().max(120).default(''),
  contact: z.object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().max(80).default(''),
    role: z.string().max(80).default(''),
    phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'numéro au format E.164 attendu'),
    email: z.string().email().optional(),
  }),
  angle: z.string().max(600).optional(),
})

const body = z.union([
  z.object({ prospectId: z.string(), ...signalFields }),
  z.object({ prospect: newProspect, ...signalFields }),
])

/**
 * Ingest one signal. Give `prospectId` to attach it to a known company, or
 * `prospect` to create the company on the fly (the endpoint an enrichment tool
 * such as Clay, n8n or a LinkedIn scraper would call).
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const now = new Date().toISOString()

  let prospect: Prospect | undefined
  if ('prospectId' in parsed.data) {
    prospect = await store.getProspect(parsed.data.prospectId)
    if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  } else {
    const draft = parsed.data.prospect
    prospect = {
      id: newId('p'),
      company: draft.company,
      city: draft.city,
      headcount: draft.headcount,
      contact: draft.contact,
      stage: 'nouveau',
      angle: draft.angle ?? `${parsed.data.title} : je suis l’agent qui relancerait vos clients, et vous entendez en ce moment ce qu’ils entendraient.`,
      calls: [],
      createdAt: now,
      updatedAt: now,
    }
    await store.saveProspect(prospect)
  }

  const signal: Signal = {
    id: newId('s'),
    prospectId: prospect.id,
    source: parsed.data.source,
    title: parsed.data.title,
    excerpt: parsed.data.excerpt,
    url: parsed.data.url,
    detectedAt: parsed.data.detectedAt ?? now,
    weight: parsed.data.weight as Signal['weight'],
    status: 'nouveau',
  }
  await store.saveSignal(signal)
  return NextResponse.json({ signal, prospect }, { status: 201 })
}
