import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AGENT_NAME, PRODUCT_NAME } from '@/core/agent-prompt'
import { ensureAudio } from '@/core/audio'
import { contactBlock } from '@/core/contact'
import { jsonError, parseBody } from '@/core/http'
import { outreachUrls } from '@/core/outreach'
import { getStore } from '@/core/store'
import { ttsConfigured } from '@/core/tts'
import { clickToChatLink, sendAudioByLink, whatsappConfigured } from '@/core/whatsapp'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const body = z.object({
  /** Recipient in E.164; defaults to the prospect's number. */
  to: z.string().regex(/^\+[1-9]\d{6,14}$/, 'numéro au format E.164 attendu').optional(),
  /** true sends the voice note through the Cloud API; false only returns the click-to-chat link. */
  send: z.boolean().default(false),
})

/** WhatsApp delivery: a `wa.me` link with the prefilled text, or a Cloud API audio message. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  const blocked = contactBlock(prospect, 'whatsapp')
  if (blocked !== undefined) return jsonError(blocked, 403)
  const to = parsed.data.to ?? prospect.contact.phone
  if (to.trim() === '') return jsonError('Aucun numéro de téléphone sur cette fiche.', 400)
  const urls = outreachUrls(prospect)
  const text = `Bonjour ${prospect.contact.firstName}, ici ${AGENT_NAME}, l’assistante vocale d’${PRODUCT_NAME} (une IA). Je vous ai laissé un message de 40 secondes : ${urls.landingUrl}`
  const link = clickToChatLink(to, text)

  if (!parsed.data.send) {
    return NextResponse.json({ sent: false, link, text, downloadUrl: `/api/prospects/${prospect.id}/audio?format=ogg` })
  }
  if (!whatsappConfigured()) return jsonError('WhatsApp Cloud API non configurée : renseigner WHATSAPP_TOKEN et WHATSAPP_PHONE_NUMBER_ID.', 503)
  if (!ttsConfigured()) return jsonError('Synthèse vocale non configurée : renseigner ELEVENLABS_VOICE_ID.', 503)
  try {
    const signals = (await store.listSignals()).filter(signal => signal.prospectId === prospect.id)
    await ensureAudio(store, prospect, signals, 'ogg')
    const result = await sendAudioByLink(to, urls.audioUrl('ogg'))
    return NextResponse.json({ sent: true, messageId: result.messageId, to })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Envoi WhatsApp impossible', 502)
  }
}
