import { appUrl } from './env.ts'
import type { Invoice } from './types.ts'

/** The client agency whose invoices the demo follows. */
export const CLIENT = { company: 'Flexo RH', city: 'Lyon', weeklyPayrollEur: 58_000, team: 'Service comptabilité clients' } as const

/** Public page where the debtor answers without an account. */
export function answerUrl(invoice: Invoice): string {
  return `${appUrl()}/f/${invoice.token}`
}
