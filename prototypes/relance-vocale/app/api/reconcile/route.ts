import { NextResponse } from 'next/server'
import { z } from 'zod'
import { jsonError, parseBody } from '@/core/http'
import { applyCredit, checkedFingerprint, markAppliedCredits, matchCredits, readStatement } from '@/core/reconcile'
import { getStore } from '@/core/store'
import { parseTable } from '@/core/tabular'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'

const credit = z.object({ id: z.number().int().min(0), date: z.string().optional(), label: z.string().max(500), amountEur: z.number().positive(), fingerprint: z.string().max(1000).optional() })

const body = z.discriminatedUnion('action', [
  /** Read a pasted statement and propose a match per credit. */
  z.object({ action: z.literal('analyze'), text: z.string().min(1).max(500_000) }),
  /** Apply the matches the person validated. */
  z.object({ action: z.literal('apply'), items: z.array(z.object({ credit, invoiceId: z.string() })).min(1).max(500) }),
])

export async function POST(request: Request) {
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const invoices = await store.listInvoices()
  if (parsed.data.action === 'analyze') {
    const credits = readStatement(parseTable(parsed.data.text))
    if (credits.length === 0) return jsonError('Aucun crédit lisible : il faut une colonne de montant ou de crédit.', 400)
    return NextResponse.json({ credits: markAppliedCredits(credits, invoices), matches: matchCredits(credits, invoices) })
  }
  const now = await workspaceNow(store)
  const byId = new Map(invoices.map(invoice => [invoice.id, invoice]))
  const changed = new Map<string, (typeof invoices)[number]>()
  // Every credit already applied, on any invoice: a transfer counts once, even pasted again or sent twice in one request.
  const applied = new Set(invoices.flatMap(invoice => invoice.reconciledCredits ?? []))
  let count = 0
  let skipped = 0
  for (const item of parsed.data.items) {
    const fingerprint = checkedFingerprint(item.credit)
    if (applied.has(fingerprint)) {
      skipped += 1
      continue
    }
    const invoice = changed.get(item.invoiceId) ?? byId.get(item.invoiceId)
    if (invoice === undefined || invoice.status === 'encaissee') continue
    applied.add(fingerprint)
    changed.set(invoice.id, applyCredit(invoice, { ...item.credit, fingerprint }, now))
    count += 1
  }
  await store.saveInvoices([...changed.values()])
  return NextResponse.json({ applied: count, paid: [...changed.values()].filter(invoice => invoice.status === 'encaissee').length, skipped })
}
