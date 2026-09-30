import { z } from 'zod'

/** Push a prospect into a lemlist campaign with the outreach links as custom variables. */

function config(): { apiKey: string; campaignId: string } | undefined {
  const apiKey = process.env.LEMLIST_API_KEY?.trim()
  const campaignId = process.env.LEMLIST_CAMPAIGN_ID?.trim()
  return apiKey && campaignId ? { apiKey, campaignId } : undefined
}

export function lemlistConfigured(): boolean {
  return config() !== undefined
}

export interface LemlistLead {
  email: string
  firstName: string
  lastName: string
  companyName: string
  phone: string
  /** Custom variables usable as `{{name}}` in the sequence: audioUrl, landingUrl, letterUrl, angle, signal… */
  variables: Record<string, string>
}

const leadResponse = z.object({ _id: z.string().optional() })

/**
 * Add (or update, with deduplication) one lead in the configured campaign.
 * @throws when lemlist is not configured or rejects the request.
 */
export async function addLeadToCampaign(lead: LemlistLead): Promise<{ id?: string }> {
  const cfg = config()
  if (cfg === undefined) throw new Error('lemlist non configuré : renseigner LEMLIST_API_KEY et LEMLIST_CAMPAIGN_ID.')
  const url = `https://api.lemlist.com/api/campaigns/${encodeURIComponent(cfg.campaignId)}/leads/${encodeURIComponent(lead.email)}?deduplicate=true`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`:${cfg.apiKey}`).toString('base64')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      firstName: lead.firstName,
      lastName: lead.lastName,
      companyName: lead.companyName,
      phone: lead.phone,
      ...lead.variables,
    }),
    cache: 'no-store',
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`lemlist ${response.status} : ${text.slice(0, 300)}`)
  const parsed = leadResponse.safeParse(JSON.parse(text))
  return { id: parsed.success ? parsed.data._id : undefined }
}
