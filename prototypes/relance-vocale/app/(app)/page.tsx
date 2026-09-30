import { PipelineBoard } from '@/components/pipeline-board'
import { formatKeur } from '@/core/format'
import { getStore } from '@/core/store'
import { toViews } from '@/core/views'

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const store = getStore()
  const [prospects, signals] = await Promise.all([store.listProspects(), store.listSignals()])
  const views = toViews(prospects, signals)
  const kpis = [
    { label: 'Signaux à trier', value: String(signals.filter(signal => signal.status === 'nouveau').length) },
    { label: 'Prêts à appeler', value: String(views.filter(view => view.stage === 'a_appeler').length) },
    { label: 'RDV pris', value: String(views.filter(view => view.stage === 'rdv_pris').length) },
    { label: 'Impayés détectés', value: formatKeur(views.reduce((sum, view) => sum + (view.estimatedUnpaidKeur ?? 0), 0)) },
  ]

  return (
    <>
      <section className="grid items-end gap-8 py-10 md:grid-cols-[1.3fr_1fr]">
        <div className="animate-rise">
          <h1 className="font-display text-[44px] leading-[0.95] tracking-tight sm:text-[56px]">
            Les impayés parlent
            <br />
            <em className="text-red">avant</em> les bilans.
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-2">
            Chaque carte est une agence d’intérim qui a laissé un signal : un post, une offre d’emploi, un client en redressement.
            L’agent vocal l’appelle, se présente comme la démo, et prend le rendez-vous. Glissez une carte pour la déplacer.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi, index) => (
            <div key={kpi.label} className="rule animate-rise pt-3" style={{ animationDelay: `${120 + index * 60}ms` }}>
              <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{kpi.label}</dt>
              <dd className="font-display tabular mt-1 text-[34px] leading-none">{kpi.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <PipelineBoard prospects={views} />
    </>
  )
}
