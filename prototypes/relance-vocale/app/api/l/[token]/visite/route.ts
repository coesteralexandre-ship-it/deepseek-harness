import { NextResponse } from 'next/server'
import { LANDING_VISIT_TITLE, recordLandingSignal } from '@/core/landing'
import { jsonError } from '@/core/http'
import { allow, clientIp } from '@/core/ratelimit'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ token: string }> }

/** Link previewers and crawlers open the page without a person behind it: their visit is not a signal. */
const ROBOT = /bot|crawl|spider|preview|fetch|facebookexternalhit|whatsapp|slack|telegram|discord|twitter|linkedin|skype|headless|curl|wget|python|go-http|java\//iu

/**
 * A person opened the page behind the QR code: logged by the browser once the page runs, not at render,
 * so the previews that messaging apps and mail clients fetch leave no trace.
 */
export async function POST(request: Request, { params }: Context) {
  const { token } = await params
  if (ROBOT.test(request.headers.get('user-agent') ?? '')) return NextResponse.json({ ok: true, ignored: 'robot' })
  if (!allow(`visite:${clientIp(request)}`, 30, 3_600_000)) return NextResponse.json({ ok: true, ignored: 'limite' })
  const store = getStore()
  const prospect = await store.findProspectByToken(token)
  if (prospect === undefined) return jsonError('Lien inconnu', 404)
  const signals = await store.listSignals()
  await recordLandingSignal(store, prospect, signals, LANDING_VISIT_TITLE, 'Ouverture de la page publique liée au QR code de la lettre ou au message vocal.')
  return NextResponse.json({ ok: true })
}
