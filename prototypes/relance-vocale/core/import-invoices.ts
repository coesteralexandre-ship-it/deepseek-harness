import { DAY_MS, parisMidnight, parisTime } from './clock.ts'
import { newId } from './ids.ts'
import type { ImportRow } from './import.ts'
import { logActivity } from './receivables.ts'
import { normalizeKey } from './tabular.ts'
import { newLandingToken } from './tokens.ts'
import type { Creditor, Invoice } from './types.ts'

/**
 * Invoices to add for the validated rows. A row whose number already exists for the same client is skipped.
 * An invoice already late starts its sequence the day before `now`, so the first reminder goes out today instead of
 * every overdue step firing at once.
 */
export function invoicesFromRows(rows: readonly ImportRow[], existing: readonly Invoice[], creditor: Creditor, now: number): { created: Invoice[]; duplicates: number } {
  const seen = new Set(existing.map(invoice => `${normalizeKey(invoice.debtor.company)}|${normalizeKey(invoice.number)}`))
  const created: Invoice[] = []
  let duplicates = 0
  const iso = new Date(now).toISOString()
  for (const row of rows) {
    const key = `${normalizeKey(row.company)}|${normalizeKey(row.number)}`
    if (seen.has(key)) {
      duplicates += 1
      continue
    }
    seen.add(key)
    const [year, month, day] = row.dueDate.split('-').map(Number)
    const due = new Date(parisTime(year as number, month as number, day as number))
    const late = due.getTime() < now - DAY_MS
    const anchor = new Date(parisMidnight(now - DAY_MS))
    const invoice: Invoice = {
      id: newId('f'),
      token: newLandingToken(),
      number: row.number,
      creditor,
      debtor: { company: row.company, contactName: row.contactName ?? 'Comptabilité fournisseurs', contactRole: row.contactName !== undefined ? 'Contact facturation' : 'Service comptable', phone: row.phone ?? '', email: row.email ?? '' },
      mission: row.mission ?? 'Prestations de travail temporaire',
      amountEur: row.amountEur,
      dueDate: due.toISOString(),
      sequenceAnchor: late ? anchor.toISOString() : undefined,
      status: 'a_relancer',
      playbookIndex: 0,
      knows: late ? 'Importée en retard : la séquence démarre aujourd’hui' : 'Importée, pas encore échue',
      profile: 'fiable',
      promises: [],
      calls: [],
      emails: [],
      activities: [],
      updatedAt: iso,
    }
    created.push(logActivity(invoice, { kind: 'etape', actor: 'vous', title: 'Importée depuis la balance âgée', detail: `${row.number} · ${row.amountEur.toFixed(2).replace('.', ',')} €` }, now))
  }
  return { created, duplicates }
}
