import { NextResponse } from 'next/server'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

/** Reload the seed data. */
export async function POST() {
  await getStore().reset()
  return NextResponse.json({ ok: true })
}
