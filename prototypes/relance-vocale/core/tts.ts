import { elevenLabsEnv } from './env.ts'
import type { AudioFormat } from './types.ts'

const API = 'https://api.elevenlabs.io'

export const AUDIO_CONTENT_TYPE: Record<AudioFormat, string> = { mp3: 'audio/mpeg', ogg: 'audio/ogg' }

/** ElevenLabs output formats: MP3 for email and download, Ogg Opus for WhatsApp voice notes. */
const OUTPUT_FORMAT: Record<AudioFormat, string> = { mp3: 'mp3_44100_128', ogg: 'opus_48000_64' }

export function isAudioFormat(value: unknown): value is AudioFormat {
  return value === 'mp3' || value === 'ogg'
}

/** True when both the API key and a voice id are set. */
export function ttsConfigured(): boolean {
  const env = elevenLabsEnv()
  return env.apiKey !== undefined && process.env.ELEVENLABS_VOICE_ID?.trim() !== undefined && process.env.ELEVENLABS_VOICE_ID?.trim() !== ''
}

/**
 * Synthesize `text` with the agent's voice.
 * @throws when ElevenLabs is not configured or rejects the request.
 */
export async function synthesize(text: string, format: AudioFormat): Promise<Buffer> {
  const { apiKey } = elevenLabsEnv()
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim()
  if (apiKey === undefined || voiceId === undefined || voiceId === '') {
    throw new Error('Synthèse vocale non configurée : renseigner ELEVENLABS_API_KEY et ELEVENLABS_VOICE_ID.')
  }
  const response = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT[format]}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: AUDIO_CONTENT_TYPE[format] },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`ElevenLabs TTS ${response.status} : ${(await response.text()).slice(0, 300)}`)
  return Buffer.from(await response.arrayBuffer())
}
