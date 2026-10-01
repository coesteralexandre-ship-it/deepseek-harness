import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ACCESS_COOKIE, accessDigest, sameDigest } from '@/core/access'
import { accessCode } from '@/core/env'
import { jsonError, parseBody } from '@/core/http'
import { allow, clientIp, tooMany } from '@/core/ratelimit'

export const dynamic = 'force-dynamic'

const body = z.object({ code: z.string().min(1).max(200) })

/** Exchange the access code for the session cookie. */
export async function POST(request: Request) {
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const code = accessCode()
  if (code === undefined) return NextResponse.json({ ok: true })
  // Ten tries per quarter of an hour and per address: the code cannot be guessed by force.
  if (!allow(`auth:${clientIp(request)}`, 10, 15 * 60_000)) return tooMany('tentatives', 15 * 60)
  const expected = await accessDigest(code)
  if (!sameDigest(await accessDigest(parsed.data.code.trim()), expected)) return jsonError('Code incorrect.', 401)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ACCESS_COOKIE, expected, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 })
  return response
}

/** Sign out. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(ACCESS_COOKIE)
  return response
}
