import { BUSINESS_TZ, DAY_MS, parisDayAt, parisDayDiff } from './clock.ts'
import { daysSince, formatDay } from './format.ts'
import { OPEN_STAGES, PLAYBOOK, STAGE_META, boardAmountEur, nextAction, openPromise, receivablesKpis, type NextActionKind, type ReceivablesKpis } from './receivables.ts'
import type { Tone } from './stages.ts'
import { INVOICE_STAGES, type Activity, type Actor, type Invoice, type InvoiceStatus, type Settings } from './types.ts'

/** Everything a board card shows, computed on the server. */
export interface CardView {
  id: string
  status: InvoiceStatus
  company: string
  contact: string
  number: string
  amountEur: number
  daysLate: number
  knows: string
  /** The debtor's own words from the latest answer, while the invoice is open. */
  quote?: string
  next?: { kind: NextActionKind; label: string; when: string; due: boolean }
  drafts: number
  promise?: { amountEur: number; day: string; confirmed: boolean }
  broken: number
  /** Playbook steps done, out of `PLAYBOOK.length`. */
  progress: number
  lastActor?: Actor
  lastTitle?: string
  paidDay?: string
  updatedAt: string
}

export interface FeedItem {
  id: string
  invoiceId: string
  company: string
  actor: Actor
  kind: Activity['kind']
  title: string
  detail?: string
  at: string
  ago: string
}

export interface ColumnView {
  status: InvoiceStatus
  label: string
  hint: string
  tone: Tone
  count: number
  totalEur: number
}

export interface AgendaDay {
  /** ISO date. */
  day: string
  label: string
  counts: Record<NextActionKind, number>
}

export interface BoardView {
  now: number
  nowLabel: string
  offsetDays: number
  mode: Settings['autopilot']
  kpis: ReceivablesKpis
  columns: ColumnView[]
  cards: CardView[]
  feed: FeedItem[]
  agenda: AgendaDay[]
  /** Actions due now that wait for a person (real mode). */
  waiting: number
  /** Invoices that fall due within 14 days, not on the board yet. */
  upcoming: { count: number; totalEur: number }
}

/** "à l’instant", "il y a 3 h", "il y a 2 j" relative to the workspace clock. */
export function ago(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  return `il y a ${Math.floor(hours / 24)} j`
}

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: BUSINESS_TZ })
const LONG_DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: BUSINESS_TZ })

/** "dans 2 j", "aujourd’hui", "en retard de 3 j", counted in Paris calendar days. */
function whenLabel(iso: string, now: number): string {
  const days = parisDayDiff(iso, now)
  if (days < 0) return `en retard de ${-days} j`
  if (days === 0) return 'aujourd’hui'
  if (days === 1) return 'demain'
  return `dans ${days} j`
}

function cardOf(invoice: Invoice, now: number): CardView {
  const action = nextAction(invoice)
  const promise = openPromise(invoice) ?? (invoice.status === 'encaissee' ? undefined : [...invoice.promises].reverse().find(entry => entry.status === 'attendue'))
  const last = [...invoice.activities].reverse().find(activity => Date.parse(activity.at) <= now)
  return {
    id: invoice.id,
    status: invoice.status,
    company: invoice.debtor.company,
    contact: invoice.debtor.contactName,
    number: invoice.number,
    amountEur: invoice.amountEur,
    daysLate: daysSince(invoice.dueDate, now),
    knows: invoice.knows,
    quote: invoice.status !== 'encaissee' ? invoice.answer?.quote : undefined,
    next: action === undefined ? undefined : { kind: action.kind, label: action.label, when: whenLabel(action.at, now), due: Date.parse(action.at) <= now },
    drafts: invoice.emails.filter(email => email.status === 'brouillon').length,
    promise: promise === undefined ? undefined : { amountEur: promise.amountEur, day: formatDay(promise.dueDate), confirmed: promise.confirmedAt !== undefined },
    broken: invoice.promises.filter(entry => entry.status === 'rompue').length,
    progress: Math.min(invoice.playbookIndex, PLAYBOOK.length),
    lastActor: last?.actor,
    lastTitle: last?.title,
    paidDay: invoice.paidAt !== undefined ? formatDay(invoice.paidAt) : undefined,
    updatedAt: invoice.updatedAt,
  }
}

/** The whole reminder board, ready to render. */
export function boardView(all: readonly Invoice[], settings: Settings, now: number): BoardView {
  // An invoice joins the board the day it falls due.
  const invoices = all.filter(invoice => Date.parse(invoice.dueDate) <= now)
  const upcoming = all.filter(invoice => Date.parse(invoice.dueDate) > now && Date.parse(invoice.dueDate) <= now + 14 * DAY_MS)
  const cards = invoices.map(invoice => cardOf(invoice, now)).sort((a, b) => b.daysLate - a.daysLate || b.amountEur - a.amountEur)
  const feed: FeedItem[] = invoices
    .flatMap(invoice => invoice.activities.filter(activity => Date.parse(activity.at) <= now).map(activity => ({ activity, invoice })))
    .sort((a, b) => Date.parse(b.activity.at) - Date.parse(a.activity.at))
    .slice(0, 18)
    .map(({ activity, invoice }) => ({ id: activity.id, invoiceId: invoice.id, company: invoice.debtor.company, actor: activity.actor, kind: activity.kind, title: activity.title, detail: activity.detail, at: activity.at, ago: ago(activity.at, now) }))
  const agenda: AgendaDay[] = Array.from({ length: 7 }, (_, index) => {
    const day = parisDayAt(now, index, 0)
    return { day, label: index === 0 ? 'Auj.' : WEEKDAY.format(new Date(day)).replace('.', ''), counts: { email: 0, appel: 0, verification: 0, humain: 0 } }
  })
  let waiting = 0
  for (const invoice of invoices) {
    const action = nextAction(invoice)
    if (action === undefined) continue
    const at = Date.parse(action.at)
    if (at <= now) waiting += 1
    const index = Math.max(0, parisDayDiff(at, now))
    const slot = agenda[index]
    if (slot !== undefined) slot.counts[action.kind] += 1
  }
  return {
    now,
    nowLabel: LONG_DAY.format(new Date(now)),
    offsetDays: settings.clockOffsetDays,
    mode: settings.autopilot,
    kpis: receivablesKpis(invoices, now),
    columns: INVOICE_STAGES.map(status => {
      const own = invoices.filter(invoice => invoice.status === status)
      return { status, ...STAGE_META[status], count: own.length, totalEur: own.reduce((sum, invoice) => sum + boardAmountEur(invoice), 0) }
    }),
    cards,
    feed,
    agenda,
    upcoming: { count: upcoming.length, totalEur: upcoming.reduce((sum, invoice) => sum + invoice.amountEur, 0) },
    waiting: settings.autopilot === 'reel' ? waiting : invoices.filter(invoice => OPEN_STAGES.includes(invoice.status) && invoice.emails.some(email => email.status === 'brouillon')).length,
  }
}
