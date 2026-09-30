import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { elevenLabsEnv } from './env.ts'
import { parseOutcome, type CallResult } from './outcome.ts'
import type { TranscriptTurn } from './types.ts'

const API = 'https://api.elevenlabs.io'

export class ElevenLabsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ElevenLabsError'
  }
}

function apiKey(): string {
  const { apiKey } = elevenLabsEnv()
  if (apiKey === undefined) throw new ElevenLabsError('ELEVENLABS_API_KEY manquante', 503)
  return apiKey
}

async function request<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json', ...init.headers },
    cache: 'no-store',
  })
  const text = await response.text()
  if (!response.ok) throw new ElevenLabsError(`ElevenLabs ${response.status} : ${text.slice(0, 300)}`, response.status)
  return schema.parse(JSON.parse(text))
}

const signedUrlResponse = z.object({ signed_url: z.string() })

/** Short-lived WebSocket URL for a browser conversation with a private agent. */
export async function getSignedUrl(agentId: string): Promise<string> {
  const json = await request(`/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, { method: 'GET' }, signedUrlResponse)
  return json.signed_url
}

export interface OutboundCallRequest {
  agentId: string
  phoneNumberId: string
  /** E.164. */
  toNumber: string
  dynamicVariables: Record<string, string>
}

const outboundCallResponse = z.object({
  success: z.boolean(),
  message: z.string().nullish(),
  conversation_id: z.string().nullish(),
  callSid: z.string().nullish(),
})

export interface OutboundCallResponse {
  success: boolean
  message?: string
  conversationId?: string
  callSid?: string
}

/** Dial `toNumber` from the imported phone number and hand the call to the agent. */
export async function startOutboundCall(call: OutboundCallRequest): Promise<OutboundCallResponse> {
  const provider = process.env.ELEVENLABS_PHONE_PROVIDER === 'sip_trunk' ? 'sip-trunk' : 'twilio'
  const json = await request(`/v1/convai/${provider}/outbound-call`, {
    method: 'POST',
    body: JSON.stringify({
      agent_id: call.agentId,
      agent_phone_number_id: call.phoneNumberId,
      to_number: call.toNumber,
      conversation_initiation_client_data: { dynamic_variables: call.dynamicVariables },
    }),
  }, outboundCallResponse)
  return {
    success: json.success,
    message: json.message ?? undefined,
    conversationId: json.conversation_id ?? undefined,
    callSid: json.callSid ?? undefined,
  }
}

const TOLERANCE_SECONDS = 30 * 60

/**
 * Check the `ElevenLabs-Signature` header (`t=<unix>,v0=<hmac>`) of a post-call webhook.
 * @param rawBody - exact request body, before any JSON parsing.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (header === null) return false
  const parts = header.split(',')
  const timestamp = parts.find(part => part.startsWith('t='))?.slice(2)
  const signature = parts.find(part => part.startsWith('v0='))
  if (timestamp === undefined || signature === undefined) return false
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || Math.abs(nowSeconds - seconds) > TOLERANCE_SECONDS) return false
  const expected = Buffer.from(`v0=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`)
  const received = Buffer.from(signature)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

const collected = z.object({ value: z.unknown().optional(), rationale: z.string().optional() })

/** Fields of the `post_call_transcription` webhook the demo reads; unknown fields are dropped. */
export const postCallPayload = z.object({
  type: z.string(),
  event_timestamp: z.number().optional(),
  data: z.object({
    agent_id: z.string().optional(),
    conversation_id: z.string(),
    status: z.string().optional(),
    transcript: z.array(z.object({ role: z.string(), message: z.string().nullish() })).optional(),
    analysis: z.object({
      call_successful: z.string().optional(),
      transcript_summary: z.string().optional(),
      data_collection_results: z.record(z.string(), collected).optional(),
      evaluation_criteria_results: z.record(z.string(), z.object({ result: z.string().optional() })).optional(),
    }).nullish(),
    conversation_initiation_client_data: z.object({
      dynamic_variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]).nullable()).optional(),
    }).nullish(),
  }),
})

export type PostCallPayload = z.infer<typeof postCallPayload>

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** Prospect id the call was started with, when the dynamic variables carried one. */
export function prospectIdOf(payload: PostCallPayload): string | undefined {
  const value = payload.data.conversation_initiation_client_data?.dynamic_variables?.prospect_id
  return typeof value === 'string' ? value : undefined
}

/** Translate the webhook analysis into a pipeline result. */
export function callResultFromPayload(payload: PostCallPayload): CallResult {
  const analysis = payload.data.analysis ?? undefined
  const collectedFields = analysis?.data_collection_results ?? {}
  const explicit = collectedFields.outcome?.value
  const booked = analysis?.evaluation_criteria_results?.booked_meeting?.result === 'success'
  const outcome = explicit !== undefined ? parseOutcome(explicit) : booked ? 'rdv' : 'inconnu'
  const transcript: TranscriptTurn[] = (payload.data.transcript ?? [])
    .filter(turn => typeof turn.message === 'string' && turn.message.trim() !== '')
    .map(turn => ({ role: turn.role === 'agent' ? 'agent' : 'user', text: turn.message as string }))
  return {
    conversationId: payload.data.conversation_id,
    outcome,
    summary: analysis?.transcript_summary,
    meetingSlot: asText(collectedFields.meeting_slot?.value),
    callbackAt: asText(collectedFields.callback_time?.value),
    transcript: transcript.length > 0 ? transcript : undefined,
  }
}
