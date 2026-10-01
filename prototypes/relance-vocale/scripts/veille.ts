import { getStore } from '../core/store.ts'
import { runWatch } from '../core/veille/index.ts'

/**
 * Run the watch locally against the in-memory store (seeded from core/data/prospects-reels.json) and print
 * what it would create. `node --env-file-if-exists=.env.local --experimental-strip-types scripts/veille.ts [--paid] [--sources bodacc,inpi] [--max 10]`
 */
const args = process.argv.slice(2)
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const paid = args.includes('--paid')
const sources = flag('sources')?.split(',')
const max = Number(flag('max') ?? '1000')

const store = getStore()
const all = (await store.listProspects()).slice(0, max)
const report = await runWatch(store, { paid, sources, prospectIds: all.map(prospect => prospect.id), trigger: 'manuel', log: line => console.log(line) })
if (args.includes('--twice')) {
  // Same process, same store: the second pass must create nothing.
  const again = await runWatch(store, { paid: false, sources, prospectIds: all.map(prospect => prospect.id), trigger: 'manuel' })
  console.log(`\nSecond passage : ${again.created} signal(s) créé(s) (attendu 0), ${again.errors.length} erreur(s)`)
}
console.log('\n=== Bilan ===')
console.log(`${report.prospects} prospects, ${report.created} signaux créés, ${report.costUsd} $`)
console.log('Par source :', report.bySource)
if (report.skipped.length > 0) console.log('Non lancées :', report.skipped.join(' | '))
if (report.errors.length > 0) console.log(`Erreurs (${report.errors.length}) :\n  ${report.errors.join('\n  ')}`)
