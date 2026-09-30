import { NextResponse } from 'next/server'
import { z } from 'zod'
import { appNow } from '@/core/clock'
import { creditorOf } from '@/core/client'
import { composeEmail } from '@/core/emails'
import { parseBody } from '@/core/http'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getStore().getSettings())
}

const body = z.object({
  agency: z.object({
    company: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(80),
    team: z.string().trim().min(1).max(120),
    weeklyPayrollEur: z.number().positive().max(100_000_000),
  }),
})

/** Save the agency and put its name on every open invoice, rewriting their unsent drafts, so the next email and call use it. */
export async function PATCH(request: Request) {
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const settings = { ...(await store.getSettings()), agency: parsed.data.agency }
  const creditor = creditorOf(parsed.data.agency)
  const now = appNow(settings)
  const invoices = (await store.listInvoices()).filter(invoice => invoice.status !== 'encaissee').map(invoice => {
    const updated = { ...invoice, creditor }
    // A draft froze the old name and signature when it was composed; sent emails stay as they left.
    // An untouched draft is recomposed; one a person edited keeps its text, with only the old name and signature swapped.
    const old = invoice.creditor
    const swap = (text: string) => text
      .split(`${old.team}\n${old.company}, ${old.city}`).join(`${creditor.team}\n${creditor.company}, ${creditor.city}`)
      .split(old.company).join(creditor.company)
    return {
      ...updated,
      emails: updated.emails.map(email => {
        if (email.status !== 'brouillon') return email
        const pristine = composeEmail(invoice, email.kind, Date.parse(email.createdAt))
        return pristine.subject === email.subject && pristine.body === email.body
          ? { ...email, ...composeEmail(updated, email.kind, now) }
          : { ...email, subject: swap(email.subject), body: swap(email.body) }
      }),
    }
  })
  await Promise.all([store.saveSettings(settings), store.saveInvoices(invoices)])
  return NextResponse.json({ settings, updated: invoices.length })
}
