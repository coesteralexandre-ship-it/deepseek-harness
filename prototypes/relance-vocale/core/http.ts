import { NextResponse } from 'next/server'
import { z } from 'zod'
import { CallJournalError } from './calls.ts'
import { ElevenLabsError } from './elevenlabs.ts'

/** JSON error body every route returns on failure. */
export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

/** Parse a JSON request body against `schema`; a 400 response names the first problem. */
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    // Route bodies are either JSON or absent; an empty body validates like `{}`.
    raw = {}
  }
  const result = schema.safeParse(raw)
  if (result.success) return { ok: true, data: result.data }
  const issue = result.error.issues[0]
  const where = issue?.path.join('.') ?? ''
  return { ok: false, response: jsonError(`Corps invalide${where ? ` (${where})` : ''} : ${issue?.message ?? 'inconnu'}`, 400) }
}

/** Map thrown errors to a response, keeping ElevenLabs status codes. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ElevenLabsError) return jsonError(error.message, error.status === 503 ? 503 : 502)
  if (error instanceof CallJournalError) return jsonError(error.message, error.status)
  return jsonError(error instanceof Error ? error.message : 'Erreur inconnue', 500)
}
