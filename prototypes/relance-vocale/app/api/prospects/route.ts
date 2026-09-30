import { NextResponse } from 'next/server'
import { getStore } from '@/core/store'
import { toViews } from '@/core/views'

export const dynamic = 'force-dynamic'

/** Every prospect with its signals and heat score, hottest first. */
export async function GET() {
  const store = getStore()
  const [prospects, signals] = await Promise.all([store.listProspects(), store.listSignals()])
  return NextResponse.json({ store: store.kind, prospects: toViews(prospects, signals) })
}
