import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { elevenLabsEnv } from './env.ts'
import { parseOutcome, type CallResult } from './outcome.ts'
import { parseAmount, parseRelanceOutcome, type RelanceResult } from './receivables.ts'
import type { TranscriptTurn } from './types.ts'

const API = 'https://api.elevenlabs.io'

export class ElevenLabsError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
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

const conversationResponse = z.object({
  status: z.string(),
  agent_id: z.string().optional(),
  conversation_id: z.string().optional(),
  transcript: z.array(z.object({ role: z.string(), message: z.string().nullish() })).optional(),
  analysis: z.object({
    transcript_summary: z.string().optional(),
    data_collection_results: z.record(z.string(), z.object({ value: z.unknown().optional() })).optional(),
    evaluation_criteria_results: z.record(z.string(), z.object({ result: z.string().optional() })).optional(),
  }).nullish(),
})

export interface ConversationAnalysis {
  /** False while ElevenLabs is still processing the conversation. */
  done: boolean
  /** Agent that held the conversation, when ElevenLabs reports it. */
  agentId?: string
  summary?: string
  /** Data-collection values by field id, empty values dropped. */
  collected: Record<string, string>
  /** Evaluation criteria that succeeded. */
  passed: string[]
  transcript: TranscriptTurn[]
}

/** Analysis of a finished conversation, read back without waiting for the post-call webhook. */
export async function getConversationAnalysis(conversationId: string): Promise<ConversationAnalysis> {
  const json = await request(`/v1/convai/conversations/${encodeURIComponent(conversationId)}`, { method: 'GET' }, conversationResponse)
  const collected: Record<string, string> = {}
  for (const [id, field] of Object.entries(json.analysis?.data_collection_results ?? {})) {
    const value = typeof field.value === 'number' ? String(field.value) : asText(field.value)
    if (value !== undefined) collected[id] = value
  }
  return {
    done: json.status === 'done' || json.status === 'failed',
    agentId: json.agent_id,
    summary: json.analysis?.transcript_summary,
    collected,
    passed: Object.entries(json.analysis?.evaluation_criteria_results ?? {}).filter(([, criterion]) => criterion.result === 'success').map(([id]) => id),
    transcript: (json.transcript ?? [])
      .filter(turn => typeof turn.message === 'string' && turn.message.trim() !== '')
      .map(turn => ({ role: turn.role === 'agent' ? 'agent' : 'user', text: turn.message as string })),
  }
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

/**
 * Fields of the `post_call_transcription` webhook the demo reads; unknown fields are dropped.
 * The dynamic variables are set by whoever starts the conversation, a public page included,
 * so they never decide which invoice or prospect a result lands on.
 */
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

/** Translate the webhook analysis of a reminder call into an invoice update. */
export function relanceResultFromPayload(payload: PostCallPayload): RelanceResult {
  const analysis = payload.data.analysis ?? undefined
  const fields = analysis?.data_collection_results ?? {}
  const transcript: TranscriptTurn[] = (payload.data.transcript ?? [])
    .filter(turn => typeof turn.message === 'string' && turn.message.trim() !== '')
    .map(turn => ({ role: turn.role === 'agent' ? 'agent' : 'user', text: turn.message as string }))
  return {
    conversationId: payload.data.conversation_id,
    outcome: parseRelanceOutcome(fields.relance_outcome?.value),
    summary: asText(fields.resume?.value) ?? analysis?.transcript_summary,
    promiseDate: asText(fields.promise_date?.value),
    promiseAmountEur: parseAmount(fields.promise_amount?.value),
    disputeReason: asText(fields.dispute_reason?.value),
    rightContact: asText(fields.right_contact?.value),
    transcript: transcript.length > 0 ? transcript : undefined,
  }
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
    summary: asText(collectedFields.resume?.value) ?? analysis?.transcript_summary,
    meetingSlot: asText(collectedFields.meeting_slot?.value),
    callbackAt: asText(collectedFields.callback_time?.value),
    transcript: transcript.length > 0 ? transcript : undefined,
  }
}
