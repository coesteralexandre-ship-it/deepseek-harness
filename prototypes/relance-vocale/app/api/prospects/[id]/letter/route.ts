import { NextResponse } from 'next/server'
import { z } from 'zod'
import { callerName } from '@/core/env'
import { jsonError, parseBody } from '@/core/http'
import { buildLetter } from '@/core/letter'
import { llmConfigured, rewriteWithLlm } from '@/core/llm'
import { letterFor, outreachUrls } from '@/core/outreach'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const body = z.object({
  /** `generate` rebuilds the template from the signals; `polish` rewrites `text` (or the current letter) with the LLM. */
  action: z.enum(['generate', 'polish']),
  text: z.string().max(6000).optional(),
})

const POLISH_INSTRUCTION = 'Réécris cette lettre de prospection postale en une page (180 à 240 mots hors adresse et signature). Garde l’adresse, la date, l’objet, la signature et la dernière phrase sur le « stop » tels quels.'

/** Letter text for the builder, from the template or the LLM. Saving goes through PATCH /api/prospects/[id]. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  const signals = (await store.listSignals()).filter(signal => signal.prospectId === prospect.id)

  if (parsed.data.action === 'generate') {
    return NextResponse.json({ text: buildLetter({ prospect, signals, callerName: callerName(), landingUrl: outreachUrls(prospect).landingUrl }), source: 'template' })
  }
  if (!llmConfigured()) return jsonError('Réécriture indisponible : renseigner DEEPSEEK_API_KEY.', 503)
  try {
    const text = await rewriteWithLlm(POLISH_INSTRUCTION, parsed.data.text ?? letterFor(prospect, signals))
    return NextResponse.json({ text, source: 'llm' })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Réécriture impossible', 502)
  }
}
