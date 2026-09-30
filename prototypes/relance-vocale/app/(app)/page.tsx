import { PageHead } from '@/components/page-head'
import { RelanceBoard } from '@/components/relance-board'
import { AGENT_NAME } from '@/core/agent-prompt'
import { getStore } from '@/core/store'
import { readBoardView } from '@/core/workspace'

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const store = getStore()
  const [view, { agency }] = await Promise.all([readBoardView(store), store.getSettings()])
  return (
    <>
      <PageHead
        eyebrow={`Pipeline de relance · ${agency.company}, ${agency.city}`}
        title={<>Chaque facture avance <span className="accent">toute seule.</span></>}
        lead={`Un email le lendemain de l’échéance, un appel de ${AGENT_NAME} deux jours après, une date obtenue, le virement vérifié : chaque carte suit la séquence et change de colonne sans que personne ne la pousse.`}
      />
      <RelanceBoard initial={view} />
    </>
  )
}
