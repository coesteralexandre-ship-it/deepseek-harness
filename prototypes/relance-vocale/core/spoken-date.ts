import { parisDate, parisParts, parisShiftDays, parisTime, parisWeekday } from './clock.ts'
import { parseFrenchDate } from './tabular.ts'

/** Dates as a debtor says them on the phone, resolved against the Paris calendar. Pure: runs in the browser and on the server. */

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']
const SMALL_NUMBERS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15, vingt: 20, trente: 30 }

/** Lower case, no accents, apostrophes as spaces: « Après-demain » → « apres-demain ». */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().replace(/[’']/gu, ' ')
}

function count(word: string): number | undefined {
  return /^\d+$/u.test(word) ? Number(word) : SMALL_NUMBERS[word]
}

/** Paris date `days` after the Paris day of `now`. */
function plus(now: number, days: number): string {
  return parisDate(parisShiftDays(now, days))
}

/**
 * Which way a date without a year or a week points: a promise is ahead (`futur`), a payment the debtor
 * says already left is behind (`passe`).
 */
export type DateDirection = 'futur' | 'passe'

/** Next date (strictly after today unless `allowToday`) whose weekday is `weekday`. */
function nextWeekday(now: number, weekday: number, allowToday = false): string {
  const today = parisWeekday(now)
  let days = (weekday - today + 7) % 7
  if (days === 0 && !allowToday) days = 7
  return plus(now, days)
}

/** Latest date on or before today (strictly before when `strict`) whose weekday is `weekday`. */
function lastWeekday(now: number, weekday: number, strict: boolean): string {
  let days = (parisWeekday(now) - weekday + 7) % 7
  if (days === 0 && strict) days = 7
  return plus(now, -days)
}

/** YYYY-MM-DD of `day`/`month`/`year` in Paris, or undefined when that day does not exist; `month` may run past 12 or below 1 (next or last year). */
function calendarDate(year: number, month: number, day: number): string | undefined {
  const time = parisTime(year, month, day, 12)
  const expected = ((month - 1) % 12 + 12) % 12 + 1
  const parts = parisParts(time)
  return parts.day === day && parts.month === expected ? parisDate(time) : undefined
}

/**
 * The date with this day of month (and month, when given) that the direction points to.
 * `futur`: the first on or after today; a named month already past this year is read as next year only when it is
 * more than two months back (« 15 janvier » said in October), otherwise the date is ambiguous and undefined.
 * `passe`: the latest on or before today; a named date just ahead is ambiguous and undefined.
 */
function dayOfMonth(now: number, day: number, month: number | undefined, direction: DateDirection): string | undefined {
  if (day < 1 || day > 31 || (month !== undefined && (month < 1 || month > 12))) return undefined
  const p = parisParts(now)
  const today = parisDate(now)
  if (month !== undefined) {
    const thisYear = calendarDate(p.year, month, day)
    if (direction === 'passe') {
      if (thisYear !== undefined && thisYear <= today) return thisYear
      // A payment « made » on a date still ahead this year is a slip, not last year: unless it is far ahead, it is undefined.
      const monthsAhead = (month - p.month + 12) % 12
      return monthsAhead > 2 ? calendarDate(p.year - 1, month, day) : undefined
    }
    if (thisYear === undefined || thisYear >= today) return thisYear
    // A promise for a named month already past: next year when it is well behind (« 15 janvier » said in October),
    // undefined when it is just behind (« 25 septembre » said on 1 October is a slip).
    const monthsBack = (p.month - month + 12) % 12
    return monthsBack > 2 ? calendarDate(p.year + 1, month, day) : undefined
  }
  const offsets = direction === 'passe' ? [0, -1, -2] : [0, 1, 2]
  for (const offset of offsets) {
    const date = calendarDate(p.year, p.month + offset, day)
    // An impossible day (31 in a 30-day month) is skipped.
    if (date === undefined) continue
    if (direction === 'passe' ? date <= today : date >= today) return date
  }
  return undefined
}

/** Last day of the month `monthsAhead` months from now (-1 for last month). */
function lastDayOfMonth(now: number, monthsAhead = 0): string {
  const p = parisParts(now)
  return parisDate(parisTime(p.year, p.month + 1 + monthsAhead, 0, 12))
}

/**
 * The calendar date a spoken payment date names, as YYYY-MM-DD in Paris, or undefined when the text holds none.
 * Understands ISO and numeric dates, « aujourd’hui », « demain », « après-demain », « hier », weekdays (« vendredi »,
 * « lundi prochain », « lundi dernier »), « le 15 », « le 1er octobre », « dans 3 jours », « il y a 3 jours », « sous huitaine »,
 * « fin de semaine », « semaine prochaine », « la semaine dernière », « fin du mois », « début du mois prochain ».
 * `direction` says whether a bare weekday or day of month is ahead (a promise) or behind (a payment already made).
 * The last expression in the text wins, since a debtor corrects themselves as they go.
 */
export function resolveSpokenDate(text: string | undefined, now: number, direction: DateDirection = 'futur'): string | undefined {
  if (text === undefined || text.trim() === '') return undefined
  // A full numeric date; a bare number (an Excel serial for the table parser) is not a spoken date.
  const numeric = /[-/.]/u.test(text) ? parseFrenchDate(text.trim().slice(0, 30)) : undefined
  if (numeric !== undefined) return numeric
  const folded = fold(text)
  const found: { at: number; date: string }[] = []
  const add = (pattern: RegExp, resolve: (match: RegExpExecArray) => string | undefined) => {
    for (const match of folded.matchAll(new RegExp(pattern.source, 'gu'))) {
      const date = resolve(match)
      if (date !== undefined) found.push({ at: match.index ?? 0, date })
    }
  }
  // A numeric date stands alone: not a piece of a phone number (04.72.00.01.05) or of a longer chain of digits.
  add(/(?<![\d./-])(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)(?![./-]?\d)/u, match => {
    const value = match[1] as string
    if (/^\d{1,2}[/.-]\d{1,2}$/u.test(value)) {
      const [day, month] = value.split(/[/.-]/u).map(Number)
      return dayOfMonth(now, day as number, month, direction)
    }
    return parseFrenchDate(value)
  })
  add(/\b(aujourd hui|ce soir|ce matin|cet apres-midi|dans la journee)\b/u, () => plus(now, 0))
  add(/\b(apres[- ]demain)\b/u, () => plus(now, 2))
  add(/(?<!apres[- ])\bdemain\b/u, () => plus(now, 1))
  add(/\b(avant[- ]hier)\b/u, () => plus(now, -2))
  add(/(?<!avant[- ])\bhier\b/u, () => plus(now, -1))
  add(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(\s+(prochain|dernier))?\b/u, match => {
    const weekday = WEEKDAYS.indexOf(match[1] as string)
    if (match[3] === 'dernier') return lastWeekday(now, weekday, true)
    if (match[3] === 'prochain') return nextWeekday(now, weekday)
    return direction === 'passe' ? lastWeekday(now, weekday, false) : nextWeekday(now, weekday)
  })
  add(/\b(?:le\s+)?(\d{1,2}|1er|premier)\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/u, match => {
    const day = match[1] === '1er' || match[1] === 'premier' ? 1 : Number(match[1])
    return dayOfMonth(now, day, MONTHS.indexOf(match[2] as string) + 1, direction)
  })
  // A number followed by another digit group is an amount (« le 15 000 euros »), never a day.
  add(/\ble\s+(\d{1,2}|1er)\s+du\s+mois\s+(prochain|dernier)\b/u, match => {
    const day = match[1] === '1er' ? 1 : Number(match[1])
    const p = parisParts(now)
    return calendarDate(p.year, p.month + (match[2] === 'prochain' ? 1 : -1), day)
  })
  // « le premier » alone is too often « le premier virement » to be a day: only « le 1er » and digits count here.
  add(/\ble\s+(\d{1,2}|1er)\b(?![./-]\d)(?!\s*(?:\d|du\s+mois\s+(?:prochain|dernier)|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|euros?|€|%|h\b|heures?))/u, match => {
    const day = match[1] === '1er' ? 1 : Number(match[1])
    return dayOfMonth(now, day, undefined, direction)
  })
  add(/\bdans\s+(\d+|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze|vingt|trente)\s+(jours?|semaines?)\b/u, match => {
    const n = count(match[1] as string)
    if (n === undefined) return undefined
    return plus(now, (match[2] as string).startsWith('semaine') ? n * 7 : n)
  })
  add(/\bil y a\s+(\d+|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|quinze|vingt|trente)\s+(jours?|semaines?)\b/u, match => {
    const n = count(match[1] as string)
    if (n === undefined) return undefined
    return plus(now, -((match[2] as string).startsWith('semaine') ? n * 7 : n))
  })
  add(/\b(la )?semaine derniere\b/u, () => plus(now, -7))
  add(/\bsous\s+(huitaine|huit jours)\b/u, () => plus(now, 8))
  add(/\bsous\s+(quinzaine|quinze jours)\b/u, () => plus(now, 15))
  add(/\b(fin de (la )?semaine|cette semaine|d ici vendredi)\b/u, () => nextWeekday(now, 5, true))
  // Friday of next week: next Monday, then four days.
  add(/\b(la )?semaine prochaine\b/u, () => plus(now, ((8 - parisWeekday(now)) % 7 || 7) + 4))
  add(/\bfin (du|de ce) mois\b(?! (dernier|prochain))/u, () => lastDayOfMonth(now))
  add(/\bfin du mois dernier\b/u, () => lastDayOfMonth(now, -1))
  add(/\bfin du mois prochain\b/u, () => lastDayOfMonth(now, 1))
  add(/\b(debut|courant) du mois prochain\b/u, () => {
    const p = parisParts(now)
    return parisDate(parisTime(p.year, p.month + 1, 5, 12))
  })
  add(/\bdebut (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/u, match => dayOfMonth(now, 5, MONTHS.indexOf(match[1] as string) + 1, direction))
  if (found.length === 0) return undefined
  found.sort((a, b) => a.at - b.at)
  return found[found.length - 1]?.date
}

/**
 * Hour and minute spoken with a callback (« à 14 h », « 9h30 », « 14:30 », « demain matin »), Paris time; undefined without one,
 * null for an hour outside the 07:00 to 20:59 calling window (« 9 h du soir »).
 */
function spokenHour(folded: string): { hour: number; minute: number } | null | undefined {
  // The last hour said wins, as for dates (« à 10 h… ah non, plutôt 16 h »); « dans 2 heures » is a delay, not an hour.
  const matches = [...folded.matchAll(/(?<!dans\s)\b(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?\b(\s*(?:du soir|de l apres-midi|de l apres midi))?/gu)]
  const match = matches[matches.length - 1]
  if (match !== undefined) {
    let hour = Number(match[1])
    // « 3 h de l’après-midi », « 7 h du soir »: only the words right after the hour count.
    if (match[3] !== undefined && hour < 12) hour += 12
    if (hour >= 7 && hour <= 20) return { hour, minute: match[2] !== undefined ? Number(match[2]) : 0 }
    // An hour outside the calling window is refused, not replaced by a default hour.
    return null
  }
  const parts: { at: number; hour: number; minute: number }[] = [
    { at: folded.search(/\bmatin\b/u), hour: 9, minute: 30 },
    { at: folded.search(/(?<!du\s)\bsoir\b|fin de (la )?journee/u), hour: 18, minute: 0 },
    { at: Math.max(folded.lastIndexOf('apres-midi'), folded.lastIndexOf('apres midi')), hour: 14, minute: 30 },
    { at: folded.search(/(?<!apres[- ])\bmidi\b/u), hour: 12, minute: 0 },
  ].filter(part => part.at >= 0)
  const last = parts.sort((a, b) => a.at - b.at)[parts.length - 1]
  return last === undefined ? undefined : { hour: last.hour, minute: last.minute }
}

/** Furthest ahead a callback may be set, in days: a debtor cannot park the reminders with a far date. */
export const CALLBACK_MAX_DAYS = 30

/** `at` when it lies after `now`, within `CALLBACK_MAX_DAYS` and between 07:00 and 20:59 Paris, undefined otherwise. */
function bounded(at: number, now: number): string | undefined {
  const hour = parisParts(at).hour
  return at > now && at <= now + CALLBACK_MAX_DAYS * 86_400_000 && hour >= 7 && hour <= 20 ? new Date(at).toISOString() : undefined
}

/**
 * When a callback was asked for, as an ISO instant: the spoken day at the spoken hour, Paris time.
 * A bare hour means today if it is still ahead, tomorrow otherwise; a day without an hour means 10:00.
 * Undefined when nothing is understood, or when the time is past or more than `CALLBACK_MAX_DAYS` ahead.
 */
export function resolveSpokenCallback(text: string | undefined, now: number): string | undefined {
  if (text === undefined || text.trim() === '') return undefined
  // An ISO time without an offset is Paris wall-clock time, whatever the server's timezone.
  const wall = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/u.exec(text.trim())
  if (wall !== null) return bounded(parisTime(Number(wall[1]), Number(wall[2]), Number(wall[3]), Number(wall[4]), Number(wall[5])), now)
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/u.test(text.trim()) && !Number.isNaN(Date.parse(text))) return bounded(Date.parse(text), now)
  const folded = fold(text)
  // « dans 2 heures », « dans 1 h 30 », « dans 20 minutes »: a delay from now.
  const delay = /\bdans\s+(\d+|une?|deux|trois|quatre|cinq|six|dix|quinze|vingt|trente)\s*(heures?|minutes?|min|h)(?:\s*(\d{2}))?\b/u.exec(folded)
  if (delay !== null) {
    const n = count(delay[1] as string)
    if (n === undefined) return undefined
    const minutes = (delay[2] as string).startsWith('m') ? n : n * 60 + (delay[3] !== undefined ? Number(delay[3]) : 0)
    return bounded(now + minutes * 60_000, now)
  }
  // « dans la journée » with no hour: two hours from now, if that is still within today's calling window.
  if (/\bdans la journee\b/u.test(folded) && !/\d\s*(h|heures?|:)/u.test(folded)) return bounded(now + 2 * 3_600_000, now)
  const hour = spokenHour(folded)
  if (hour === null) return undefined
  const day = resolveSpokenDate(text, now)
  if (day === undefined && hour === undefined) return undefined
  const [year, month, date] = (day ?? parisDate(now)).split('-').map(Number)
  let at = parisTime(year as number, month as number, date as number, hour?.hour ?? 10, hour?.minute ?? 0)
  if (at <= now && day === undefined) at = parisShiftDays(at, 1)
  return bounded(at, now)
}
