import { PageHead } from '@/components/page-head'
import { RelanceBoard } from '@/components/relance-board'
import { AGENT_NAME } from '@/core/agent-prompt'
import { CLIENT } from '@/core/client'
import { getStore } from '@/core/store'
import { readBoardView } from '@/core/workspace'

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const view = await readBoardView(getStore())
  return (
    <>
      <PageHead
        eyebrow={`Pipeline de relance · ${CLIENT.company}, ${CLIENT.city}`}
        title={<>Chaque facture avance <span className="accent">toute seule.</span></>}
        lead={`Un email le lendemain de l’échéance, un appel de ${AGENT_NAME} deux jours après, une date obtenue, le virement vérifié : chaque carte suit la séquence et change de colonne sans que personne ne la pousse.`}
      />
      <RelanceBoard initial={view} />
    </>
  )
}
