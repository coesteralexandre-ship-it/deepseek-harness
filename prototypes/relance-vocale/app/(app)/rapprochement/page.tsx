import { BankReconcile } from '@/components/bank-reconcile'
import { PageHead } from '@/components/page-head'

export const dynamic = 'force-dynamic'

export default function ReconcilePage() {
  return (
    <>
      <PageHead
        eyebrow="Rapprochement bancaire"
        title={<>Le virement arrive, <span className="accent">la promesse est tenue.</span></>}
        lead="Collez votre relevé : chaque crédit est rapproché de la facture ou de la promesse qu’il règle, par le numéro de facture, le nom du client et le montant. Vous validez, les cartes passent en Encaissé."
      />
      <BankReconcile />
    </>
  )
}
