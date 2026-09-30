import type { Agency, Settings } from './types.ts'

export const DAY_MS = 86_400_000

/** The demo agency; the Settings page replaces it. */
export const DEFAULT_AGENCY: Agency = { company: 'Flexo RH', city: 'Lyon', team: 'Service comptabilité clients', weeklyPayrollEur: 58_000 }

export const DEFAULT_SETTINGS: Settings = { clockOffsetDays: 0, autopilot: 'demo', agency: DEFAULT_AGENCY }

/** Current time of the workspace: real time plus the demo offset. */
export function appNow(settings: Settings): number {
  return Date.now() + settings.clockOffsetDays * DAY_MS
}

/** Business timezone: every schedule hour and day boundary is Paris wall-clock time, whatever the server runs in (Vercel runs in UTC). */
export const BUSINESS_TZ = 'Europe/Paris'

const PARTS = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' })
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Paris wall-clock parts of an instant; `month` is 1 to 12, `weekday` 0 (Sunday) to 6. */
export interface ParisParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
}

function toMs(isoOrMs: string | number): number {
  return typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs)
}

/** Paris wall-clock parts of `isoOrMs`. */
export function parisParts(isoOrMs: string | number): ParisParts {
  const values: Record<string, string> = {}
  for (const part of PARTS.formatToParts(new Date(toMs(isoOrMs)))) values[part.type] = part.value
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: WEEKDAYS.indexOf(values.weekday ?? ''),
  }
}

/** Paris offset from UTC at `ms`, in milliseconds (3 600 000 in winter, 7 200 000 in summer). */
function parisOffset(ms: number): number {
  const p = parisParts(ms)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

/** The instant of a Paris wall-clock time; `day` may overflow the month, it rolls over like `Date.UTC`. */
export function parisTime(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second)
  // The offset at the wall time read as UTC can be the wrong side of a DST change: correct once with the offset at the estimate.
  return wall - parisOffset(wall - parisOffset(wall))
}

/** ISO time at `hour`:00 Paris, `days` calendar days after the Paris day of `isoOrMs`. */
export function parisDayAt(isoOrMs: string | number, days: number, hour: number): string {
  const p = parisParts(isoOrMs)
  return new Date(parisTime(p.year, p.month, p.day + days, hour)).toISOString()
}

/** Same Paris wall-clock time `days` calendar days later. */
export function parisShiftDays(isoOrMs: string | number, days: number): number {
  const p = parisParts(isoOrMs)
  return parisTime(p.year, p.month, p.day + days, p.hour, p.minute, p.second)
}

/** 00:00 Paris on the day containing `ms`. */
export function parisMidnight(ms: number): number {
  const p = parisParts(ms)
  return parisTime(p.year, p.month, p.day)
}

/** Day of the week in Paris, 0 for Sunday to 6 for Saturday. */
export function parisWeekday(isoOrMs: string | number): number {
  return parisParts(isoOrMs).weekday
}

/** Paris calendar date of `isoOrMs`, as YYYY-MM-DD. */
export function parisDate(isoOrMs: string | number): string {
  const p = parisParts(isoOrMs)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Calendar days from the Paris day of `from` to the Paris day of `to` (0 the same day, 1 the next). */
export function parisDayDiff(to: string | number, from: string | number): number {
  const a = parisParts(to)
  const b = parisParts(from)
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / DAY_MS)
}
