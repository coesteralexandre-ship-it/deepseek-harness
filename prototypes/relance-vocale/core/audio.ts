import { voiceScriptFor } from './outreach.ts'
import type { Store } from './store.ts'
import { AUDIO_CONTENT_TYPE, synthesize } from './tts.ts'
import type { AudioFormat, Prospect, Signal, StoredAudio } from './types.ts'

/** Lowercase ASCII slug for filenames. */
export function slug(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Stream a stored voice note with download-friendly headers. */
export function audioResponse(audio: StoredAudio, filename: string, cacheControl: string): Response {
  const bytes = Buffer.from(audio.base64, 'base64')
  const body = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(body).set(bytes)
  return new Response(body, {
    headers: {
      'content-type': audio.contentType,
      'content-length': String(bytes.byteLength),
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': cacheControl,
    },
  })
}

/**
 * Return the cached voice note for the prospect's current script, synthesizing it when absent or stale.
 * @throws when synthesis is needed and ElevenLabs is not configured or fails.
 */
export async function ensureAudio(store: Store, prospect: Prospect, signals: readonly Signal[], format: AudioFormat, regenerate = false): Promise<StoredAudio> {
  const script = voiceScriptFor(prospect, signals)
  const cached = await store.getAudio(prospect.id, format)
  if (cached !== undefined && !regenerate && cached.script === script) return cached
  const bytes = await synthesize(script, format)
  const audio: StoredAudio = {
    format,
    contentType: AUDIO_CONTENT_TYPE[format],
    base64: bytes.toString('base64'),
    script,
    generatedAt: new Date().toISOString(),
  }
  await store.saveAudio(prospect.id, audio)
  return audio
}
