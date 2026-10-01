import { enrichKeys, mapTeam } from '../enrich.ts'
import type { Draft, WatchSource } from './common.ts'

/**
 * LinkedIn team map re-run through Exa (about 0,044 $ per prospect): a finance or management person who was
 * not there last time, with a recent start, is the clearest buying trigger (new DAF, new RAF, new manager).
 */

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

/** Months between « Mon YYYY » and now; undefined when unreadable. */
function monthsSince(since: string | undefined, now: number): number | undefined {
  const match = /^([A-Za-z]{3})\w* (\d{4})$/u.exec(since ?? '')
  if (match === null) return undefined
  const month = MONTHS[(match[1] as string).toLowerCase()]
  if (month === undefined) return undefined
  const date = new Date(now)
  return (date.getUTCFullYear() - Number(match[2])) * 12 + (date.getUTCMonth() + 1 - month)
}

export const equipe: WatchSource = {
  key: 'equipe',
  label: 'Équipe LinkedIn (Exa)',
  unavailable: () => (enrichKeys().exa === undefined ? 'EXA_API_KEY manquante' : undefined),
  async detect({ prospect, now }) {
    const drafts: Draft[] = []
    const keys = enrichKeys()
    if (keys.exa === undefined) return { drafts }
    const { team, cost } = await mapTeam(prospect, keys)
    const known = new Set(prospect.veille?.teamSeen ?? (prospect.enrichment?.team ?? []).map(member => member.linkedin))
    for (const member of team) {
      if (known.has(member.linkedin)) continue
      if (member.group !== 'finance' && member.group !== 'direction') continue
      const months = monthsSince(member.since, now)
      if (months !== undefined && months > 6) continue
      drafts.push({ source: 'linkedin', weight: 4, detectedAt: new Date(now).toISOString(), url: member.linkedin, title: `${member.group === 'finance' ? 'Nouveau profil finance' : 'Nouveau dirigeant'} : ${member.name}`, excerpt: `${member.title}${member.since !== undefined ? ` · en poste depuis ${member.since}` : ''}${member.location !== undefined ? ` · ${member.location}` : ''}. Vu sur LinkedIn par la veille d’équipe.` })
    }
    const seen = [...new Set([...known, ...team.map(member => member.linkedin)])]
    return { drafts, snapshot: { teamSeen: seen, teamAt: new Date(now).toISOString() }, costUsd: cost }
  },
}
