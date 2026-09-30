import { z } from 'zod'

/**
 * WhatsApp delivery of the voice note: a click-to-chat link for manual sending
 * (the file is attached by hand), or the Cloud API when credentials are set.
 * The Cloud API only accepts a free-form audio message inside an open
 * 24-hour customer window; a first contact must be an approved template.
 */

function config(): { token: string; phoneNumberId: string } | undefined {
  const token = process.env.WHATSAPP_TOKEN?.trim()
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  return token && phoneNumberId ? { token, phoneNumberId } : undefined
}

export function whatsappConfigured(): boolean {
  return config() !== undefined
}

/** `https://wa.me/<digits>?text=…` opening a chat with the prefilled text. */
export function clickToChatLink(phoneE164: string, text: string): string {
  return `https://wa.me/${phoneE164.replace(/\D/gu, '')}?text=${encodeURIComponent(text)}`
}

const sendResponse = z.object({ messages: z.array(z.object({ id: z.string() })).optional() })

/**
 * Send the audio at `link` (public URL) as a WhatsApp audio message.
 * @throws when the Cloud API is not configured or rejects the request.
 */
export async function sendAudioByLink(toE164: string, link: string): Promise<{ messageId?: string }> {
  const cfg = config()
  if (cfg === undefined) throw new Error('WhatsApp Cloud API non configurée : renseigner WHATSAPP_TOKEN et WHATSAPP_PHONE_NUMBER_ID.')
  const version = process.env.WHATSAPP_API_VERSION?.trim() || 'v21.0'
  const response = await fetch(`https://graph.facebook.com/${version}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toE164.replace(/\D/gu, ''),
      type: 'audio',
      audio: { link },
    }),
    cache: 'no-store',
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`WhatsApp ${response.status} : ${text.slice(0, 300)}`)
  const parsed = sendResponse.safeParse(JSON.parse(text))
  return { messageId: parsed.success ? parsed.data.messages?.[0]?.id : undefined }
}
