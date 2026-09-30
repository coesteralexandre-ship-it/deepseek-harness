import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ACCESS_COOKIE, accessDigest } from '@/core/access'
import { accessCode } from '@/core/env'
import { jsonError, parseBody } from '@/core/http'

export const dynamic = 'force-dynamic'

const body = z.object({ code: z.string().min(1).max(200) })

/** Exchange the access code for the session cookie. */
export async function POST(request: Request) {
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const code = accessCode()
  if (code === undefined) return NextResponse.json({ ok: true })
  if (parsed.data.code.trim() !== code) return jsonError('Code incorrect.', 401)
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ACCESS_COOKIE, await accessDigest(code), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 })
  return response
}

/** Sign out. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(ACCESS_COOKIE)
  return response
}
