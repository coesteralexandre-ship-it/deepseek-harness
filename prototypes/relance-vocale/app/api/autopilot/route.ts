import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseBody } from '@/core/http'
import { getStore } from '@/core/store'
import { boardView } from '@/core/board-view'
import { advance, readBoardView } from '@/core/workspace'

export const dynamic = 'force-dynamic'

/** The rendered reminder board: columns, cards, journal, agenda, figures. */
export async function GET() {
  return NextResponse.json(await readBoardView(getStore()))
}

const body = z.discriminatedUnion('action', [
  /** Move the clock `days` ahead and let the autopilot act; 0 runs what is due now. */
  z.object({ action: z.literal('advance'), days: z.number().int().min(0).max(30) }),
  z.object({ action: z.literal('mode'), autopilot: z.enum(['demo', 'reel']) }),
])

export async function POST(request: Request) {
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  if (parsed.data.action === 'advance') {
    const board = await advance(store, parsed.data.days)
    return NextResponse.json(boardView(board.invoices, board.settings, board.now))
  }
  const settings = { ...(await store.getSettings()), autopilot: parsed.data.autopilot }
  await store.saveSettings(settings)
  return NextResponse.json(await readBoardView(store))
}
