import { PageHead } from '@/components/page-head'
import { PipelineBoard } from '@/components/pipeline-board'
import { formatKeur } from '@/core/format'
import { AGENT_NAME } from '@/core/agent-prompt'
import { REAL_BASE } from '@/core/seed'
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
    { label: 'Au-delà de 60 j (estimé)', value: formatKeur(views.reduce((sum, view) => sum + (view.estimatedUnpaidKeur ?? 0), 0)) },
  ]

  return (
    <>
      <PageHead
        eyebrow="Prospection · agences d’intérim"
        title={<>Les impayés parlent <span className="accent">avant</span> les bilans.</>}
        lead={`${REAL_BASE.prospects} agences d’intérim indépendantes, repérées le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(REAL_BASE.generatedAt))} parmi ${REAL_BASE.agencies.toLocaleString('fr-FR')} sur des données publiques : comptes INPI, offres d’emploi, BODACC. Le premier contact part par courrier avec un QR code ; ${AGENT_NAME} n’appelle que les agences qui le demandent. Glissez une carte pour la déplacer.`}
      />
      <dl className="grid grid-cols-2 gap-3 pb-8 lg:grid-cols-4">
        {kpis.map((kpi, index) => (
          <div key={kpi.label} className="card animate-rise p-4" style={{ animationDelay: `${index * 60}ms` }}>
            <dt className="label">{kpi.label}</dt>
            <dd className="font-display tabular mt-2 text-[28px] leading-none">{kpi.value}</dd>
          </div>
        ))}
      </dl>
      <PipelineBoard prospects={views} />
    </>
  )
}
