/**
 * Second pass of the enrichment: re-run the contact search (site, numbers, LinkedIn) on the prospects whose
 * website is not their own or that have no number, keeping their team map.
 *
 *   node --env-file=.env.local --experimental-strip-types scripts/enrich-fix.ts [--serper N]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { enrichContacts, enrichKeys, isOwnSite, phoneFits, phoneSourceOk } from '../core/enrich.ts'
import type { Prospect } from '../core/types.ts'

const args = process.argv.slice(2)
const serperAt = args.indexOf('--serper')
let serperLeft = serperAt >= 0 ? Number(args[serperAt + 1]) : 0
const path = join(import.meta.dirname, '..', 'core', 'data', 'prospects-reels.json')
const keys = enrichKeys()
const data = JSON.parse(readFileSync(path, 'utf8')) as { prospects: Prospect[] }
let spent = 0
for (const [index, prospect] of data.prospects.entries()) {
  const e = prospect.enrichment
  const badSite = e?.website !== undefined && !isOwnSite(e.website, prospect.company)
  // Numbers read on third-party pages are checked again: wrong region, mobiles, aggregators.
  const badPhones = (e?.phones ?? []).some(phone => phone.label.startsWith('Publié sur') && (!phoneFits(phone.value, prospect.address, phone.url) || !phoneSourceOk(phone.url, prospect.company)))
  if (e !== undefined && !badSite && !badPhones && e.phones.length > 0) continue
  // A wrong website or number must not survive the pass: drop them before searching again.
  const cleared: Prospect = (badSite || badPhones) && e !== undefined ? { ...prospect, enrichment: { ...e, website: badSite ? undefined : e.website, phones: [], emails: badSite ? [] : e.emails } } : prospect
  const enrichment = await enrichContacts(cleared, keys, { useSerper: serperLeft > 0 })
  if (enrichment.phones.some(phone => phone.label.startsWith('Fiche Google'))) serperLeft -= 1
  spent += enrichment.costUsd - (prospect.enrichment?.costUsd ?? 0)
  data.prospects[index] = { ...prospect, enrichment: { ...enrichment, team: e?.team, teamMappedAt: e?.teamMappedAt } }
  writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`)
  console.log(`${index + 1} ${prospect.company} · site ${enrichment.website ?? '—'}${badSite ? ` (avant ${e?.website})` : ''} · ${enrichment.phones.map(phone => `${phone.value} [${phone.label}]`).join(', ') || 'aucun numéro'}`)
}
console.log(`Dépensé : ${spent.toFixed(3)} $`)
