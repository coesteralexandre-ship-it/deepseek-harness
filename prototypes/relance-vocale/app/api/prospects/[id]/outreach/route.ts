import { NextResponse } from 'next/server'
import { jsonError } from '@/core/http'
import { outreachCapabilities, outreachUrls, voiceScriptFor } from '@/core/outreach'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** Outreach assets of one prospect: public links, voice-note state and which integrations are enabled. */
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  const signals = (await store.listSignals()).filter(signal => signal.prospectId === prospect.id)
  const urls = outreachUrls(prospect)
  const [mp3, ogg] = await Promise.all([store.getAudio(prospect.id, 'mp3'), store.getAudio(prospect.id, 'ogg')])
  return NextResponse.json({
    landingUrl: urls.landingUrl,
    letterUrl: urls.letterUrl,
    audio: {
      mp3: { ready: mp3 !== undefined, generatedAt: mp3?.generatedAt, publicUrl: urls.audioUrl('mp3') },
      ogg: { ready: ogg !== undefined, generatedAt: ogg?.generatedAt, publicUrl: urls.audioUrl('ogg') },
    },
    script: voiceScriptFor(prospect, signals),
    capabilities: outreachCapabilities(),
  })
}
