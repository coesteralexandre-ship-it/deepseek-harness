import { audioResponse, ensureAudio, slug } from '@/core/audio'
import { jsonError } from '@/core/http'
import { allow, tooMany } from '@/core/ratelimit'
import { getStore } from '@/core/store'
import { isAudioFormat, ttsConfigured } from '@/core/tts'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

/** Public voice note behind a landing token, synthesized on first request when ElevenLabs is configured. */
export async function GET(request: Request, { params }: Context) {
  const { token } = await params
  const format = new URL(request.url).searchParams.get('format') ?? 'mp3'
  if (!isAudioFormat(format)) return jsonError('format attendu : mp3 ou ogg', 400)
  const store = getStore()
  const prospect = await store.findProspectByToken(token)
  if (prospect === undefined) return jsonError('Lien inconnu', 404)
  const cached = await store.getAudio(prospect.id, format)
  if (cached === undefined && !ttsConfigured()) return jsonError('Note vocale indisponible', 404)
  // Synthesis is paid: three per day per link; a cached note is served without limit.
  if (cached === undefined && !allow(`tts:${token}`, 3, 86_400_000)) return tooMany('synthèses', 86_400)
  try {
    const signals = (await store.listSignals()).filter(signal => signal.prospectId === prospect.id)
    const audio = cached ?? (await ensureAudio(store, prospect, signals, format))
    return audioResponse(audio, `lea-${slug(prospect.company)}.${format}`, 'public, max-age=3600')
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Synthèse impossible', 502)
  }
}
