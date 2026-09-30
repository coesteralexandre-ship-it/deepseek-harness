import Link from 'next/link'
import { ActorBadge, actorLabel } from '@/components/actor-badge'
import { PageHead } from '@/components/page-head'
import { appNow } from '@/core/clock'
import { formatLongDay } from '@/core/format'
import { getStore } from '@/core/store'
import type { Actor } from '@/core/types'

export const dynamic = 'force-dynamic'

const FILTERS: { id: Actor | 'tous'; label: string }[] = [
  { id: 'tous', label: 'Tout' },
  { id: 'lea', label: 'Léa' },
  { id: 'autopilote', label: 'Autopilote' },
  { id: 'client', label: 'Clients' },
  { id: 'vous', label: 'Vous' },
]

function isActor(value: unknown): value is Actor {
  return value === 'lea' || value === 'autopilote' || value === 'client' || value === 'vous'
}

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ qui?: string }> }) {
  const { qui } = await searchParams
  const filter = isActor(qui) ? qui : undefined
  const store = getStore()
  const [invoices, settings] = await Promise.all([store.listInvoices(), store.getSettings()])
  const now = appNow(settings)
  const rows = invoices
    .flatMap(invoice => invoice.activities.map(activity => ({ activity, invoice })))
    .filter(({ activity }) => Date.parse(activity.at) <= now && (filter === undefined || activity.actor === filter))
    .sort((a, b) => Date.parse(b.activity.at) - Date.parse(a.activity.at))
  const days = new Map<string, typeof rows>()
  for (const row of rows) {
    // Group by local calendar day, not by UTC date.
    const key = new Date(row.activity.at).toLocaleDateString('sv-SE')
    days.set(key, [...(days.get(key) ?? []), row])
  }
  const count = (actor: Actor) => invoices.flatMap(invoice => invoice.activities).filter(activity => activity.actor === actor && Date.parse(activity.at) <= now).length

  return (
    <>
      <PageHead
        eyebrow="Journal · tout est tracé"
        title={<>Qui a fait quoi, <span className="accent">et quand.</span></>}
        lead="Chaque email préparé, chaque appel de Léa, chaque réponse d’un client et chaque décision de votre équipe, dans l’ordre."
      >
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(option => {
            const active = (option.id === 'tous' && filter === undefined) || option.id === filter
            return (
              <Link key={option.id} href={option.id === 'tous' ? '/journal' : `/journal?qui=${option.id}`} className={`btn btn-sm ${active ? 'btn-ink' : 'btn-ghost'}`}>
                {option.label}{option.id !== 'tous' && <span className="tabular opacity-60">{count(option.id)}</span>}
              </Link>
            )
          })}
        </div>
      </PageHead>

      <div className="space-y-8">
        {[...days.entries()].map(([day, entries]) => (
          <section key={day}>
            <p className="eyebrow capitalize">{formatLongDay(`${day}T12:00:00`)} · {entries.length}</p>
            <ol className="card mt-3 divide-y divide-line">
              {entries.map(({ activity, invoice }) => (
                <li key={activity.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3.5 px-5 py-3.5">
                  <ActorBadge actor={activity.actor} />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">{activity.title}</p>
                    {activity.detail !== undefined && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{activity.detail}</p>}
                    <p className="mt-1 text-[12px] text-faint">
                      <Link href={`/factures/${invoice.id}`} className="font-semibold text-ink-2 hover:text-blue">{invoice.debtor.company}</Link> · {invoice.number} · {actorLabel(activity.actor)}
                    </p>
                  </div>
                  <span className="tabular pt-0.5 text-[12px] text-faint">{new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(activity.at))}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
        {rows.length === 0 && <p className="text-[14px] text-muted">Rien pour ce filtre.</p>}
      </div>
    </>
  )
}
