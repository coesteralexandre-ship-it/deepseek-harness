const DAY_MS = 86_400_000

/** "il y a 3 j", "hier", "aujourd’hui". */
export function relativeDay(iso: string, now = Date.now()): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return iso
  const days = Math.floor((now - time) / DAY_MS)
  if (days <= 0) return 'aujourd’hui'
  if (days === 1) return 'hier'
  if (days < 30) return `il y a ${days} j`
  const months = Math.floor(days / 30)
  return `il y a ${months} mois`
}

/** Localized date and time; a string that is not a date comes back unchanged. */
export function formatDateTime(iso: string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return iso
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time))
}

export function formatKeur(value: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(value)} k€`
}

/** "+33 6 12 34 56 78" for an E.164 French number; other numbers unchanged. */
export function formatPhone(e164: string): string {
  const match = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164)
  return match ? `+33 ${match[1]} ${match[2]} ${match[3]} ${match[4]} ${match[5]}` : e164
}

export function formatEur(value: number, cents = false): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(value)
}

/** "2 oct." for an ISO date; the debtor's own words come back unchanged. */
export function formatDay(value: string): string {
  const time = Date.parse(value)
  if (Number.isNaN(time)) return value
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(time))
}

/** "jeudi 2 octobre" for an ISO date; free text comes back unchanged. */
export function formatLongDay(value: string): string {
  const time = Date.parse(value)
  if (Number.isNaN(time)) return value
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(time))
}

/** Whole days between an ISO due date and `now`; 0 before the due date. */
export function daysSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / DAY_MS))
}

/** "dans 2 j", "aujourd’hui", "en retard de 3 j" relative to `now`. */
export function relativeFuture(iso: string, now: number): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return iso
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const days = Math.floor((time - start.getTime()) / DAY_MS)
  if (days < 0) return `en retard de ${-days} j`
  if (days === 0) return 'aujourd’hui'
  if (days === 1) return 'demain'
  return `dans ${days} j`
}
