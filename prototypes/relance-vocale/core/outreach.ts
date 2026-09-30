import { appUrl, callerName } from './env.ts'
import { buildLetter, buildVoiceScript } from './letter.ts'
import { lemlistConfigured } from './lemlist.ts'
import { llmConfigured } from './llm.ts'
import { ttsConfigured } from './tts.ts'
import type { AudioFormat, Prospect, Signal } from './types.ts'
import { whatsappConfigured } from './whatsapp.ts'

/** Public and internal URLs of one prospect's outreach assets. */
export interface OutreachUrls {
  /** Public page behind the QR code: talk to the agent or ask for a call. */
  landingUrl: string
  /** Internal letter builder. */
  letterUrl: string
  /** Public audio, usable as a link in lemlist or WhatsApp. */
  audioUrl: (format: AudioFormat) => string
}

export function outreachUrls(prospect: Prospect): OutreachUrls {
  const base = appUrl()
  return {
    landingUrl: `${base}/l/${prospect.landingToken}`,
    letterUrl: `${base}/prospects/${prospect.id}/lettre`,
    audioUrl: format => `${base}/api/l/${prospect.landingToken}/audio?format=${format}`,
  }
}

/** Which outreach integrations the environment enables. */
export function outreachCapabilities(): { tts: boolean; llm: boolean; lemlist: boolean; whatsapp: boolean } {
  return { tts: ttsConfigured(), llm: llmConfigured(), lemlist: lemlistConfigured(), whatsapp: whatsappConfigured() }
}

/** Saved letter, or the template built from the prospect's signals. */
export function letterFor(prospect: Prospect, signals: readonly Signal[]): string {
  return prospect.letter ?? buildLetter({ prospect, signals, callerName: callerName(), landingUrl: outreachUrls(prospect).landingUrl })
}

/** Saved voice script, or the template built from the prospect's signals. */
export function voiceScriptFor(prospect: Prospect, signals: readonly Signal[]): string {
  return prospect.voiceScript ?? buildVoiceScript({ prospect, signals, callerName: callerName(), landingUrl: outreachUrls(prospect).landingUrl })
}
