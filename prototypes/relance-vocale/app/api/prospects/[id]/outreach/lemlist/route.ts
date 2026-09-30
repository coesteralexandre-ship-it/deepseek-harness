import { NextResponse } from 'next/server'
import { z } from 'zod'
import { jsonError, parseBody } from '@/core/http'
import { addLeadToCampaign, lemlistConfigured } from '@/core/lemlist'
import { outreachUrls } from '@/core/outreach'
import { summarizeSignals } from '@/core/signals'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const body = z.object({
  /** Saved on the prospect when given; required when the prospect has no email. */
  email: z.string().email().optional(),
})

/** Add the prospect to the configured lemlist campaign with the outreach links as custom variables. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  if (!lemlistConfigured()) return jsonError('lemlist non configuré : renseigner LEMLIST_API_KEY et LEMLIST_CAMPAIGN_ID.', 503)
  const store = getStore()
  let prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  const email = parsed.data.email ?? prospect.contact.email
  if (email === undefined) return jsonError('Email du contact requis pour lemlist.', 400)
  if (email !== prospect.contact.email) {
    prospect = { ...prospect, contact: { ...prospect.contact, email }, updatedAt: new Date().toISOString() }
    await store.saveProspect(prospect)
  }
  const signals = (await store.listSignals()).filter(signal => signal.prospectId === prospect.id)
  const urls = outreachUrls(prospect)
  try {
    const lead = await addLeadToCampaign({
      email,
      firstName: prospect.contact.firstName,
      lastName: prospect.contact.lastName,
      companyName: prospect.company,
      phone: prospect.contact.phone,
      variables: {
        role: prospect.contact.role,
        city: prospect.city,
        angle: prospect.angle,
        signal: summarizeSignals(signals),
        landingUrl: urls.landingUrl,
        audioUrl: urls.audioUrl('mp3'),
        audioOggUrl: urls.audioUrl('ogg'),
        letterUrl: urls.letterUrl,
      },
    })
    return NextResponse.json({ ok: true, leadId: lead.id, email })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Export lemlist impossible', 502)
  }
}
