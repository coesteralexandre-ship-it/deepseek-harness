import { audioResponse, slug } from '@/core/audio'
import { jsonError } from '@/core/http'
import { getStore } from '@/core/store'
import { isAudioFormat } from '@/core/tts'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** Cached voice note of a prospect (`?format=mp3|ogg`); 404 until it has been generated. */
export async function GET(request: Request, { params }: Context) {
  const { id } = await params
  const format = new URL(request.url).searchParams.get('format') ?? 'mp3'
  if (!isAudioFormat(format)) return jsonError('format attendu : mp3 ou ogg', 400)
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  const audio = await store.getAudio(prospect.id, format)
  if (audio === undefined) return jsonError('Note vocale pas encore générée', 404)
  return audioResponse(audio, `lea-${slug(prospect.company)}.${format}`, 'private, max-age=0')
}
