/** Parsing of pasted or uploaded tables (CSV, semicolon CSV, Excel copy-paste) and of French numbers and dates. Pure: runs in the browser and on the server. */

/** Split text into rows of cells. Detects tab, semicolon or comma from the first non-empty line and honours double quotes. */
export function parseTable(text: string): string[][] {
  const clean = text.replace(/^﻿/u, '').replace(/\r\n?/gu, '\n')
  const first = clean.split('\n').find(line => line.trim() !== '') ?? ''
  const count = (ch: string) => first.split(ch).length - 1
  const delimiter = count('\t') > 0 ? '\t' : count(';') >= count(',') && count(';') > 0 ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i] as string
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cell += ch
      continue
    }
    if (ch === '"' && cell.trim() === '') quoted = true
    else if (ch === delimiter) {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n') {
      row.push(cell.trim())
      if (row.some(value => value !== '')) rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell.trim())
  if (row.some(value => value !== '')) rows.push(row)
  return rows
}

/** Lower-case, accent-free, letters and digits only: « N° Facture » → « nfacture ». */
export function normalizeKey(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().replace(/[^a-z0-9]/gu, '')
}

/**
 * Amount written the French or the English way: « 1 234,56 », « 1.234,56 », « 1,234.56 », « -45 », « 12 300 € ».
 * Returns undefined when the text holds no number.
 */
export function parseFrenchAmount(value: string): number | undefined {
  let text = value.replace(/[\s  €]|EUR/gu, '')
  const negative = /^-|^\(.*\)$|-$/u.test(text)
  text = text.replace(/[()+-]/gu, '')
  if (!/\d/u.test(text)) return undefined
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma > lastDot) text = text.replace(/\./gu, '').replace(',', '.')
  else if (lastDot > lastComma && lastComma !== -1) text = text.replace(/,/gu, '')
  // Dots only: several dots, or one dot before exactly three digits, are thousand separators (« 12.300 »).
  else if (lastComma === -1 && lastDot !== -1 && ((text.match(/\./gu) ?? []).length > 1 || /\.\d{3}$/u.test(text))) text = text.replace(/\./gu, '')
  const amount = Number(text)
  if (!Number.isFinite(amount)) return undefined
  return negative ? -amount : amount
}

/** Optional time after a date, as Excel and accounting exports write it: « 00:00 », « 00:00:00 », « T00:00:00.000Z », « T10:00+02:00 ». */
const TIME_SUFFIX = String.raw`(?:[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?`
const ISO_DATE = new RegExp(`^(\\d{4})-(\\d{1,2})-(\\d{1,2})${TIME_SUFFIX}$`, 'u')
const FRENCH_DATE = new RegExp(`^(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{2}|\\d{4})${TIME_SUFFIX}$`, 'u')

/**
 * Date as ISO YYYY-MM-DD from « 28/09/2026 », « 28-09-26 », « 2026-09-28 », « 28.09.2026 », or an Excel serial number,
 * each optionally followed by a time (« 28/09/2026 00:00 », « 2026-09-28T00:00:00 »), which is ignored.
 * Returns undefined for anything else, including impossible dates.
 */
export function parseFrenchDate(value: string): string | undefined {
  const text = value.trim()
  let year: number
  let month: number
  let day: number
  let match = ISO_DATE.exec(text)
  if (match !== null) {
    year = Number(match[1])
    month = Number(match[2])
    day = Number(match[3])
  } else if ((match = FRENCH_DATE.exec(text)) !== null) {
    day = Number(match[1])
    month = Number(match[2])
    year = Number(match[3])
    if (year < 100) year += 2000
  } else if (/^\d{5}$/u.test(text)) {
    // Excel serial: days since 1899-12-30, the fraction being the time of day.
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(text.replace(',', '.'))) * 86_400_000)
    return date.toISOString().slice(0, 10)
  } else return undefined
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined
  return date.toISOString().slice(0, 10)
}

/**
 * French numbers to E.164: « 04 72 00 01 05 » → « +33472000105 », « +33 (0)4 72 00 01 05 » → « +33472000105 ».
 * Numbers already in E.164 are kept; anything else is undefined.
 */
export function toE164(value: string): string | undefined {
  // The national « 0 » written after the country code, « +33 (0)4 … » or « 0033 04 … », is not dialled.
  const digits = value
    .replace(/^\s*(\+|00)(\d{1,3})\s*\(0\)/u, '$1$2')
    .replace(/[\s.()-]/gu, '')
    .replace(/^(?:\+|00)330(\d{9})$/u, '+33$1')
  if (/^\+[1-9]\d{6,14}$/u.test(digits)) return digits
  if (/^0033[1-9]\d{8}$/u.test(digits)) return `+${digits.slice(2)}`
  if (/^0[1-9]\d{8}$/u.test(digits)) return `+33${digits.slice(1)}`
  return undefined
}
