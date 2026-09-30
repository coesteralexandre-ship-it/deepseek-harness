import { PageHead } from '@/components/page-head'
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
    <>
      <PageHead
        eyebrow="Prospection · boîte de réception"
        title={<>Tout commence par <span className="accent">un signal.</span></>}
        lead="Un signal qualifié rend son entreprise appelable. Un signal ignoré ne compte plus dans le score."
      />
      <SignalInbox items={items} prospects={options} />
    </>
  )
}
