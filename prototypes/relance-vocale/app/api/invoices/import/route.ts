import { NextResponse } from 'next/server'
import { z } from 'zod'
import { creditorOf } from '@/core/client'
import { jsonError, parseBody } from '@/core/http'
import { IMPORT_BATCH_MAX, IMPORT_ROW } from '@/core/import'
import { invoicesFromRows } from '@/core/import-invoices'
import { getStore } from '@/core/store'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'

// Same row schema and batch size as the browser check in `readRows`, so a row the preview accepts is never refused here.
const body = z.object({ rows: z.array(IMPORT_ROW).min(1).max(IMPORT_BATCH_MAX) })

/** Add the invoices of an aged balance, already parsed and checked in the browser; duplicates are skipped. */
export async function POST(request: Request) {
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const [existing, settings] = await Promise.all([store.listInvoices(), store.getSettings()])
  const { created, duplicates } = invoicesFromRows(parsed.data.rows, existing, creditorOf(settings.agency), await workspaceNow(store))
  if (created.length === 0 && duplicates === 0) return jsonError('Aucune facture à importer.', 400)
  await store.saveInvoices(created)
  return NextResponse.json({ created: created.length, duplicates })
}
