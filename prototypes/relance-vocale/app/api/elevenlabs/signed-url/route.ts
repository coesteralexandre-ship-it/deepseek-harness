import { NextResponse } from 'next/server'
import { getSignedUrl } from '@/core/elevenlabs'
import { elevenLabsEnv } from '@/core/env'
import { errorResponse, jsonError } from '@/core/http'

export const dynamic = 'force-dynamic'

/** Signed WebSocket URL the browser uses to talk to an agent: `?agent=relance` for the reminder agent, the prospecting agent otherwise. */
export async function GET(request: Request) {
  const env = elevenLabsEnv()
  const relance = new URL(request.url).searchParams.get('agent') === 'relance'
  const agentId = relance ? env.relanceAgentId : env.agentId
  if (env.apiKey === undefined || agentId === undefined) {
    return jsonError(`Renseigner ELEVENLABS_API_KEY et ${relance ? 'ELEVENLABS_RELANCE_AGENT_ID' : 'ELEVENLABS_AGENT_ID'} pour parler à l’agent.`, 503)
  }
  try {
    return NextResponse.json({ signedUrl: await getSignedUrl(agentId) })
  } catch (error) {
    return errorResponse(error)
  }
}
