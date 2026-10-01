import { NextResponse } from 'next/server'
import { getSignedUrl } from '@/core/elevenlabs'
import { elevenLabsEnv } from '@/core/env'
import { errorResponse, jsonError } from '@/core/http'
import { allow, clientIp, tooMany } from '@/core/ratelimit'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

/** Signed URL for the public page: only a known landing token can start a conversation. */
export async function GET(request: Request, { params }: Context) {
  const { token } = await params
  // Each conversation costs minutes: a few per hour per link, and per visitor.
  if (!allow(`signed:${token}`, 6, 3_600_000) || !allow(`signed-ip:${clientIp(request)}`, 12, 3_600_000)) return tooMany('conversations', 3600)
  const env = elevenLabsEnv()
  if (env.apiKey === undefined || env.agentId === undefined) return jsonError('La conversation en ligne n’est pas activée.', 503)
  if ((await getStore().findProspectByToken(token)) === undefined) return jsonError('Lien inconnu', 404)
  try {
    return NextResponse.json({ signedUrl: await getSignedUrl(env.agentId) })
  } catch (error) {
    return errorResponse(error)
  }
}
