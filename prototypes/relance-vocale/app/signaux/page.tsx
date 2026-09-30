import { SignalInbox, type SignalItem } from '@/components/signal-inbox'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

export default async function SignalsPage() {
  const store = getStore()
  const [signals, prospects] = await Promise.all([store.listSignals(), store.listProspects()])
  const companies = new Map(prospects.map(prospect => [prospect.id, prospect.company]))
  const items: SignalItem[] = signals
    .map(signal => ({ ...signal, company: companies.get(signal.prospectId) ?? '?' }))
    .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
  const options = prospects
    .map(prospect => ({ id: prospect.id, company: prospect.company }))
    .sort((a, b) => a.company.localeCompare(b.company, 'fr'))

  return (
    <div className="py-10">
      <div className="mb-8 max-w-2xl animate-rise">
        <h1 className="font-display text-[40px] leading-[0.95] tracking-tight">Signaux</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Tout commence ici : un signal qualifié rend son entreprise appelable. Un signal ignoré ne compte plus dans le score.
        </p>
      </div>
      <SignalInbox items={items} prospects={options} />
    </div>
  )
}
