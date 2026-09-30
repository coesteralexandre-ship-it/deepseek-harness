import { appUrl } from './env.ts'
import type { Agency, Creditor, Invoice } from './types.ts'

/** The part of the agency an invoice carries. */
export function creditorOf(agency: Agency): Creditor {
  return { company: agency.company, city: agency.city, team: agency.team }
}

/** Public page where the debtor answers without an account. */
export function answerUrl(invoice: Invoice): string {
  return `${appUrl()}/f/${invoice.token}`
}
