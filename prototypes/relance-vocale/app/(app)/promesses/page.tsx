import Link from 'next/link'
import { PageHead } from '@/components/page-head'
import { Pill } from '@/components/pill'
import { AGENT_NAME } from '@/core/agent-prompt'
import { CLIENT } from '@/core/client'
import { appNow } from '@/core/clock'
import { formatDay, formatEur } from '@/core/format'
import { PROMISE_STATUS_META, payerReliability, weekStart, weeklyForecast } from '@/core/receivables'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

export default async function PromisesPage() {
  const store = getStore()
  const [invoices, settings] = await Promise.all([store.listInvoices(), store.getSettings()])
  const now = appNow(settings)
  const weeks = weeklyForecast(invoices, now)
  const current = weekStart(now)
  const scale = Math.max(CLIENT.weeklyPayrollEur, ...weeks.map(week => week.promisedEur)) * 1.12
  const promises = invoices
    .flatMap(invoice => invoice.promises.map(promise => ({ promise, invoice })))
    .sort((a, b) => Date.parse(b.promise.dueDate) - Date.parse(a.promise.dueDate))
  const payers = payerReliability(invoices, now)
  const kept = promises.filter(row => row.promise.status === 'tenue').length
  const settled = promises.filter(row => row.promise.status !== 'attendue').length

  return (
    <>
      <PageHead
        eyebrow={`Registre des promesses · ${CLIENT.company}`}
        title={<>Ce qui doit rentrer <span className="accent">avant chaque paie.</span></>}
        lead={`Une promesse est une date et un montant donnés à ${AGENT_NAME}. Elle est suivie jusqu’au virement : tenue, attendue ou rompue.`}
      >
        <Pill tone="neutral">{kept} tenues sur {settled} échues</Pill>
      </PageHead>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="card p-5">
          <p className="label">Promis, reçu et paie à sortir, par semaine</p>
          <div className="mt-6 grid h-[220px] grid-cols-5 items-end gap-3 border-b border-line-2 px-1" role="img" aria-label="Cinq semaines : montants promis, montants reçus et paie hebdomadaire">
            {weeks.map(week => {
              const isCurrent = Date.parse(week.start) === current
              return (
                <div key={week.start} className="relative flex h-full items-end justify-center gap-1.5">
                  <div className="absolute inset-x-0 border-t border-dashed border-fuchsia" style={{ bottom: `${(CLIENT.weeklyPayrollEur / scale) * 100}%` }} />
                  <div className={`w-[34%] rounded-t-md border border-b-0 ${isCurrent ? 'border-blue bg-blue-soft' : 'border-line-2 bg-line'}`} style={{ height: `${(week.promisedEur / scale) * 100}%` }} title={`Promis : ${formatEur(week.promisedEur)}`} />
                  <div className="w-[34%] rounded-t-md bg-emerald-vivid" style={{ height: `${(week.receivedEur / scale) * 100}%` }} title={`Reçu : ${formatEur(week.receivedEur)}`} />
                </div>
              )
            })}
          </div>
          <div className="mt-2 grid grid-cols-5 gap-3 px-1 text-center">
            {weeks.map(week => (
              <div key={week.start}>
                <p className={`tabular font-mono text-[10.5px] ${Date.parse(week.start) === current ? 'text-ink' : 'text-faint'}`}>{formatDay(week.start)}</p>
                <p className="tabular font-mono text-[10.5px] text-muted">{week.promisedEur === 0 ? '—' : formatEur(week.promisedEur)}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-muted">
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm border border-line-2 bg-line" />Promis</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-vivid" />Reçu</span>
            <span className="inline-flex items-center gap-2"><span className="w-5 border-t-2 border-dashed border-fuchsia" />Paie de vendredi, {formatEur(CLIENT.weeklyPayrollEur)}</span>
          </div>
        </section>

        <section className="card overflow-x-auto">
          <p className="label px-5 pt-5">Toutes les promesses</p>
          <table className="table mt-2 min-w-[440px]">
            <tbody>
              {promises.map(({ promise, invoice }) => {
                const meta = PROMISE_STATUS_META[promise.status]
                return (
                  <tr key={promise.id}>
                    <td><Link href={`/factures/${invoice.id}`} className="font-semibold text-ink hover:text-blue">{invoice.debtor.company}</Link></td>
                    <td className="r tabular whitespace-nowrap font-mono text-[12.5px] text-ink">{formatEur(promise.amountEur)}</td>
                    <td className="tabular whitespace-nowrap font-mono text-[12px] text-muted">{formatDay(promise.dueDate)}</td>
                    <td><Pill tone={meta.tone}>{meta.label}</Pill></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>

      <section className="mt-8">
        <p className="eyebrow">Les payeurs les moins fiables</p>
        <div className="card mt-4 overflow-x-auto">
          <table className="table min-w-[620px]">
            <thead>
              <tr>
                <th>Client</th>
                <th className="r">Promesses tenues</th>
                <th className="r">Encours</th>
                <th className="r">Retard moyen</th>
                <th>Conseil</th>
              </tr>
            </thead>
            <tbody>
              {payers.map(payer => {
                const share = payer.kept / payer.settled
                return (
                  <tr key={payer.company}>
                    <td className="font-semibold text-ink">{payer.company}</td>
                    <td className="r tabular font-mono text-[12.5px]"><span className={share < 0.5 ? 'text-fuchsia' : share < 1 ? 'text-ochre' : 'text-emerald'}>{payer.kept} sur {payer.settled}</span></td>
                    <td className="r tabular whitespace-nowrap font-mono text-[12.5px]">{payer.overdueEur === 0 ? '—' : formatEur(payer.overdueEur)}</td>
                    <td className="r tabular font-mono text-[12.5px]">{payer.overdueEur === 0 ? '—' : `${payer.avgDaysLate} j`}</td>
                    <td className="text-muted">{share === 0 ? 'Passer à un humain et plafonner l’encours' : share < 0.5 ? 'Demander un acompte avant la prochaine mission' : share < 1 ? 'Confirmer chaque date par écrit' : 'Payeur fiable une fois relancé'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
