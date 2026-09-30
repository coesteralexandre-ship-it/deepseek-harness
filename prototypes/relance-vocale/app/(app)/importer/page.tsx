import { InvoiceImport } from '@/components/invoice-import'
import { PageHead } from '@/components/page-head'

export const dynamic = 'force-dynamic'

export default function ImportPage() {
  return (
    <>
      <PageHead
        eyebrow="Import · balance âgée"
        title={<>Vos vraies factures, <span className="accent">en une minute.</span></>}
        lead="Collez l’export de votre logiciel. Les colonnes sont reconnues toutes seules ; chaque facture échue démarre sa séquence de relance aujourd’hui, les autres le jour de leur échéance."
      />
      <InvoiceImport />
    </>
  )
}
