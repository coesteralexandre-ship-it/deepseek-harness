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
