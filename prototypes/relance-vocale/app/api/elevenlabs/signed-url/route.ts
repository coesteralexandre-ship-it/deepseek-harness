import { NextResponse } from 'next/server'
import { getSignedUrl } from '@/core/elevenlabs'
import { elevenLabsEnv } from '@/core/env'
import { errorResponse, jsonError } from '@/core/http'

export const dynamic = 'force-dynamic'

/** Signed WebSocket URL the browser uses to talk to the private agent. */
export async function GET() {
  const env = elevenLabsEnv()
  if (env.apiKey === undefined || env.agentId === undefined) {
    return jsonError('Renseigner ELEVENLABS_API_KEY et ELEVENLABS_AGENT_ID pour parler à l’agent.', 503)
  }
  try {
    return NextResponse.json({ signedUrl: await getSignedUrl(env.agentId) })
  } catch (error) {
    return errorResponse(error)
  }
}
