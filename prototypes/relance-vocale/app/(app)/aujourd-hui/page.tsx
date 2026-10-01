import Link from 'next/link'
import { PageHead } from '@/components/page-head'
import { TodayList } from '@/components/today-list'
import { getStore } from '@/core/store'
import { dueTasks } from '@/core/tasks'

export const dynamic = 'force-dynamic'

const DAY_MS = 86_400_000

/** What the team does today in prospecting: tasks due, prospects who opened the QR page, callbacks requested. */
export default async function TodayPage() {
  const store = getStore()
  const [prospects, signals] = await Promise.all([store.listProspects(), store.listSignals()])
  const now = Date.now()
  const tasks = dueTasks(prospects, now, 7)
  const names = new Map(prospects.map(prospect => [prospect.id, prospect]))
  const scans = signals
    .filter(signal => signal.source === 'inbound' && now - Date.parse(signal.detectedAt) < 2 * DAY_MS)
    .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
    .map(signal => ({ id: signal.id, title: signal.title, at: signal.detectedAt, prospect: names.get(signal.prospectId) }))
  const overdue = tasks.filter(task => task.inDays < 0).length
  const today = tasks.filter(task => task.inDays === 0).length

  return (
    <>
      <PageHead
        eyebrow={`Prospection · ${new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(now))}`}
        title={<>Ce qui vous attend <span className="accent">aujourd’hui.</span></>}
        lead={`${today} tâche${today > 1 ? 's' : ''} pour aujourd’hui${overdue > 0 ? `, ${overdue} en retard` : ''}, ${scans.length} ouverture${scans.length > 1 ? 's' : ''} de QR code en 48 h. Chaque ligne mène à la fiche.`}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <TodayList tasks={tasks} />
        <aside className="space-y-4">
          <section className="card p-5">
            <p className="label">Ont ouvert le lien · 48 h</p>
            {scans.length === 0 && <p className="mt-2 text-[13px] text-faint">Personne pour l’instant.</p>}
            <ul className="mt-2 divide-y divide-line">
              {scans.map(scan => (
                <li key={scan.id} className="py-2.5">
                  <Link href={scan.prospect !== undefined ? `/prospects/${scan.prospect.id}` : '/pipeline'} className="text-[14px] font-semibold text-ink hover:text-blue">{scan.prospect?.company ?? 'Prospect retiré'}</Link>
                  <p className="text-[12px] text-muted">{scan.title} · {new Date(scan.at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="card p-5">
            <p className="label">Comment ça marche</p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">Une tâche se crée sur la fiche d’un prospect, ou toute seule quand vous le passez « À rappeler » avec une date. Elle reste ici jusqu’à ce que vous la cochiez. Les ouvertures de QR code viennent de vos courriers.</p>
          </section>
        </aside>
      </div>
    </>
  )
}
