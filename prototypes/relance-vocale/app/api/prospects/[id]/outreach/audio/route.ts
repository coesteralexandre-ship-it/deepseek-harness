import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureAudio } from '@/core/audio'
import { jsonError, parseBody } from '@/core/http'
import { outreachUrls } from '@/core/outreach'
import { getStore } from '@/core/store'
import { ttsConfigured } from '@/core/tts'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const body = z.object({
  format: z.enum(['mp3', 'ogg']).default('mp3'),
  /** Saved as the prospect's voice script before synthesis; omit to keep the current one. */
  script: z.string().min(20).max(2000).optional(),
  regenerate: z.boolean().default(false),
})

/** Synthesize the prospect's voice note with the agent's voice and cache it. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  if (!ttsConfigured()) return jsonError('Synthèse vocale non configurée : renseigner ELEVENLABS_API_KEY et ELEVENLABS_VOICE_ID.', 503)
  const store = getStore()
  let prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  if (parsed.data.script !== undefined) {
    prospect = { ...prospect, voiceScript: parsed.data.script, updatedAt: new Date().toISOString() }
    await store.saveProspect(prospect)
  }
  const signals = (await store.listSignals()).filter(signal => signal.prospectId === prospect.id)
  try {
    const audio = await ensureAudio(store, prospect, signals, parsed.data.format, parsed.data.regenerate)
    return NextResponse.json({
      format: audio.format,
      generatedAt: audio.generatedAt,
      bytes: Math.round((audio.base64.length * 3) / 4),
      script: audio.script,
      url: `/api/prospects/${prospect.id}/audio?format=${audio.format}`,
      publicUrl: outreachUrls(prospect).audioUrl(audio.format),
    })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Synthèse impossible', 502)
  }
}
