/**
 * Enrich the real prospect base in place: website, business numbers and emails, the representative's
 * LinkedIn profile, the company's LinkedIn page, and the team map (Exa `category: people`).
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/enrich-prospects.ts [--serper N] [--sans-equipe]
 *
 * `--serper N` caps the Serper credits spent on gaps (website not found, no number on the site); 0 by default.
 * Writes back `core/data/prospects-reels.json` after each prospect, so an interrupted run keeps what it found.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { enrichContacts, enrichKeys, mapTeam } from '../core/enrich.ts'
import type { Prospect } from '../core/types.ts'

const args = process.argv.slice(2)
const serperAt = args.indexOf('--serper')
let serperLeft = serperAt >= 0 ? Number(args[serperAt + 1]) : 0
const withTeam = !args.includes('--sans-equipe')
const path = join(import.meta.dirname, '..', 'core', 'data', 'prospects-reels.json')
const keys = enrichKeys()
if (keys.exa === undefined) {
  console.error('EXA_API_KEY manquante (dans .env.local).')
  process.exit(1)
}
const data = JSON.parse(readFileSync(path, 'utf8')) as { prospects: Prospect[] }
let total = 0
for (const [index, prospect] of data.prospects.entries()) {
  try {
    const useSerper = serperLeft > 0
    const enrichment = await enrichContacts(prospect, keys, { useSerper })
    // Serper is only called on gaps: count a credit for each gap it may have filled.
    if (useSerper) serperLeft -= (prospect.enrichment === undefined ? 1 : 0) + (enrichment.phones.length > 0 && enrichment.phones[0]?.label.startsWith('Fiche Google') ? 1 : 0)
    let next: Prospect = { ...prospect, enrichment }
    if (withTeam) {
      const { team, cost } = await mapTeam(next, keys)
      next = { ...next, enrichment: { ...enrichment, team, teamMappedAt: new Date().toISOString(), costUsd: Math.round((enrichment.costUsd + cost) * 1000) / 1000 } }
    }
    total += (next.enrichment?.costUsd ?? 0) - (prospect.enrichment?.costUsd ?? 0)
    data.prospects[index] = next
    writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`)
    const e = next.enrichment
    console.log(`${index + 1}/${data.prospects.length} ${prospect.company} · site ${e?.website ?? '—'} · ${e?.phones.length ?? 0} tél · ${e?.emails.length ?? 0} email · LinkedIn ${e?.linkedinPerson ? 'oui' : 'non'} · équipe ${e?.team?.length ?? '—'} · ${e?.gaps.join(', ') || 'complet'}`)
  } catch (error) {
    console.log(`${index + 1}/${data.prospects.length} ${prospect.company} · ERREUR ${error instanceof Error ? error.message : error}`)
    if (error instanceof Error && /épuisés/u.test(error.message)) break
  }
}
console.log(`Dépensé : ${total.toFixed(3)} $`)
