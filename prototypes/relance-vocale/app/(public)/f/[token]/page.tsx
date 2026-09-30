import { notFound } from 'next/navigation'
import { DebtorForm } from '@/components/debtor-form'
import { AGENT_NAME } from '@/core/agent-prompt'
import { CLIENT } from '@/core/client'
import { appNow } from '@/core/clock'
import { recordVisit } from '@/core/debtor'
import { daysSince, formatDay, formatEur, formatLongDay } from '@/core/format'
import { openPromise } from '@/core/receivables'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

/** The debtor's answer page, reached from the link sent after a missed call. */
export default async function DebtorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const store = getStore()
  const found = await store.findInvoiceByToken(token)
  if (found === undefined) notFound()
  const now = appNow(await store.getSettings())
  // Opening the page is itself a signal, logged at most once a day.
  const invoice = recordVisit(found, now)
  if (invoice !== found) await store.saveInvoice(invoice)
  const promise = openPromise(invoice)
  const paid = invoice.status === 'encaissee'

  return (
    <div className="mx-auto max-w-[640px] py-10">
      <div className="animate-rise">
        <p className="eyebrow">{CLIENT.company} · facture {invoice.number}</p>
        <h1 className="font-display mt-4 text-[34px] leading-[1.05] sm:text-[42px]">
          {paid ? <>Cette facture est <span className="accent">réglée.</span></> : <>Une minute pour <span className="accent">nous répondre.</span></>}
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          {paid
            ? `Merci, ${CLIENT.company} a bien reçu votre règlement. Vous ne serez plus relancé pour cette facture.`
            : `${AGENT_NAME}, l’assistante vocale de ${CLIENT.company}, a essayé de vous joindre. Répondez ici plutôt qu’au téléphone : votre réponse arrive directement à l’agence.`}
        </p>
      </div>

      <dl className="card animate-rise mt-7 grid grid-cols-2 gap-x-6 gap-y-4 p-5 sm:grid-cols-3" style={{ animationDelay: '80ms' }}>
        <div>
          <dt className="label">Montant</dt>
          <dd className="font-display tabular mt-1.5 text-[22px] leading-none">{formatEur(invoice.amountEur, true)}</dd>
        </div>
        <div>
          <dt className="label">Échue le</dt>
          <dd className="mt-1.5 text-[15px] font-semibold text-ink">{formatDay(invoice.dueDate)}{!paid && <span className="font-normal text-faint"> · {daysSince(invoice.dueDate, now)} j</span>}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="label">Prestation</dt>
          <dd className="mt-1.5 text-[13.5px] leading-snug text-ink-2">{invoice.mission}</dd>
        </div>
      </dl>

      {!paid && (
        <div className="animate-rise mt-4" style={{ animationDelay: '160ms' }}>
          <DebtorForm token={token} creditor={CLIENT.company} promise={promise === undefined || promise.confirmedAt !== undefined ? undefined : { id: promise.id, amount: formatEur(promise.amountEur, true), day: formatLongDay(promise.dueDate) }} />
        </div>
      )}

      <p className="mt-10 text-[12px] leading-relaxed text-faint">
        {AGENT_NAME} est une intelligence artificielle qui appelle au nom de {CLIENT.company}. Aucune coordonnée bancaire ne vous sera demandée ni modifiée sur cette page. Pour ne plus être contacté par {AGENT_NAME}, répondez « stop » au message reçu.
      </p>
    </div>
  )
}
