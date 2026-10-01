import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActorBadge, actorLabel } from '@/components/actor-badge'
import { CopyButton } from '@/components/copy-button'
import { EmailStudio } from '@/components/email-studio'
import { InvoiceDecisions, PromiseButtons, RunNextAction } from '@/components/invoice-actions'
import { Pill } from '@/components/pill'
import { Transcript } from '@/components/transcript'
import { VoiceConsole } from '@/components/voice-console'
import { AGENT_NAME } from '@/core/agent-prompt'
import { ago } from '@/core/board-view'
import { answerUrl } from '@/core/client'
import { appNow } from '@/core/clock'
import { EMAIL_KIND_META } from '@/core/emails'
import { elevenLabsEnv } from '@/core/env'
import { daysSince, formatDateTime, formatDay, formatEur, formatPhone, relativeFuture } from '@/core/format'
import { llmConfigured } from '@/core/llm'
import { PLAYBOOK, PROMISE_STATUS_META, RELANCE_OUTCOME_META, STAGE_META, nextAction } from '@/core/receivables'
import { relanceVariablesFor } from '@/core/relance-prompt'
import { getStore } from '@/core/store'
import { INVOICE_STAGES, type EmailKind } from '@/core/types'

export const dynamic = 'force-dynamic'

const MODE_LABEL = { navigateur: 'navigateur', telephone: 'téléphone', simulation: 'simulation' } as const

const ANSWER_SOURCE = { direct: `Noté en direct par ${AGENT_NAME}`, analyse: 'Lu dans l’analyse de l’appel', page: 'Donné sur la page de réponse', vous: 'Qualifié par votre équipe' } as const

const ACTION_VERB = { email: 'Préparer l’email maintenant', appel: 'Passer l’appel maintenant', verification: 'Vérifier maintenant', humain: 'Passer la main maintenant' } as const

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const store = getStore()
  const [invoice, settings] = await Promise.all([store.getInvoice(id), store.getSettings()])
  if (invoice === undefined) notFound()
  const now = appNow(settings)
  const env = elevenLabsEnv()
  const browserReady = env.apiKey !== undefined && env.relanceAgentId !== undefined
  const phoneReady = browserReady && env.phoneNumberId !== undefined
  const stage = STAGE_META[invoice.status]
  const action = nextAction(invoice)
  const calls = [...invoice.calls].reverse()
  const activities = [...invoice.activities].filter(activity => Date.parse(activity.at) <= now).reverse()
  const firstName = invoice.debtor.contactName.split(' ')[0] ?? invoice.debtor.contactName
  const stageIndex = INVOICE_STAGES.indexOf(invoice.status)
  const kinds = (Object.entries(EMAIL_KIND_META) as [EmailKind, { label: string; hint: string }][]).map(([kind, meta]) => ({ kind, ...meta }))

  return (
    <div className="space-y-6">
      <div className="animate-rise">
        <Link href="/" className="text-[12.5px] font-semibold text-muted hover:text-blue">← Pipeline de relance</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[36px] leading-[1.02] sm:text-[46px]">{invoice.debtor.company}</h1>
              <Pill tone={stage.tone}>{stage.label}</Pill>
            </div>
            <p className="mt-2 text-[14px] text-muted"><span className="font-mono text-[12.5px] text-ink-2">{invoice.number}</span> · {invoice.mission}</p>
          </div>
          <div className="text-right">
            <p className="font-display tabular text-[40px] leading-none">{formatEur(invoice.amountEur, true)}</p>
            <p className="mt-1.5 text-[13px] text-muted">{invoice.status === 'encaissee' ? `Réglée le ${invoice.paidAt !== undefined ? formatDay(invoice.paidAt) : '—'}` : `Échue le ${formatDay(invoice.dueDate)} · ${daysSince(invoice.dueDate, now)} jours de retard`}</p>
          </div>
        </div>

        <ol className="mt-6 grid grid-cols-7 gap-1" aria-label="Étapes du pipeline">
          {INVOICE_STAGES.map((status, index) => {
            const meta = STAGE_META[status]
            const reached = index === stageIndex
            return (
              <li key={status} className="min-w-0">
                <span className={`block h-1.5 rounded-full ${reached ? 'bg-blue' : index < stageIndex && stageIndex <= 3 ? 'bg-ink' : 'bg-line'}`} />
                <span className={`mt-1.5 block truncate text-[11.5px] ${reached ? 'font-bold text-blue' : 'text-muted'}`}>{meta.label}</span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="min-w-0 space-y-6">
          <section className="grid gap-4 md:grid-cols-2">
            <div className="card card-blue p-5">
              <p className="label">Prochaine action</p>
              {action !== undefined
                ? (
                  <>
                    <p className="font-display mt-2 text-[22px] leading-tight">{action.label}</p>
                    <p className="mt-1 text-[13.5px] text-muted">
                      {Date.parse(action.at) <= now ? 'Due maintenant' : `Prévue ${relativeFuture(action.at, now)}`} · {settings.autopilot === 'demo' ? 'l’autopilote s’en charge' : 'Léa prépare, vous validez'}
                    </p>
                    <div className="mt-4"><RunNextAction invoiceId={invoice.id} label={ACTION_VERB[action.kind]} /></div>
                  </>
                )
                : <p className="font-display mt-2 text-[22px] leading-tight">{invoice.status === 'encaissee' ? 'Rien : la facture est réglée.' : invoice.status === 'litige' ? 'Votre équipe envoie la pièce.' : 'Votre équipe reprend la main.'}</p>}
            </div>
            <div className="card p-5">
              <p className="label">Ce que {AGENT_NAME} sait</p>
              <p className="mt-2 text-[17px] font-semibold leading-snug text-ink">{invoice.knows}</p>
              {invoice.answer !== undefined && invoice.status !== 'encaissee' && (invoice.answer.quote !== undefined || invoice.answer.delayReason !== undefined) && (
                <div className="mt-3 border-l-2 border-blue pl-3">
                  <p className="label">Réponse du client</p>
                  {invoice.answer.quote !== undefined && <p className="mt-1 text-[14px] italic leading-relaxed text-ink-2">« {invoice.answer.quote} »</p>}
                  {invoice.answer.delayReason !== undefined && <p className="mt-1 text-[12.5px] text-muted">Cause du retard : <span className="font-semibold text-ink-2">{invoice.answer.delayReason}</span></p>}
                  <p className="mt-1 text-[11.5px] text-faint">{ANSWER_SOURCE[invoice.answer.source]} · {formatDateTime(invoice.answer.notedAt)}</p>
                </div>
              )}
              {invoice.disputeReason !== undefined && invoice.status === 'litige' && <p className="mt-3 rounded-md bg-fuchsia-soft/60 px-3 py-2 text-[13px] leading-relaxed text-fuchsia">{invoice.disputeReason}</p>}
              <div className="mt-4 flex gap-[3px]" aria-label="Avancement de la séquence">
                {PLAYBOOK.map((step, index) => (
                  <span key={step.id} title={`J+${step.day} · ${step.label}`} className={`h-1.5 flex-1 rounded-full ${index < invoice.playbookIndex ? 'bg-ink' : 'bg-line'}`} />
                ))}
              </div>
              <p className="mt-1.5 text-[11.5px] text-faint">Séquence : {Math.min(invoice.playbookIndex, PLAYBOOK.length)} étapes sur {PLAYBOOK.length}</p>
            </div>
          </section>

          <EmailStudio invoiceId={invoice.id} emails={invoice.emails} kinds={kinds} llm={llmConfigured()} />

          {invoice.promises.length > 0 && (
            <section>
              <p className="eyebrow">Promesses · {invoice.promises.length}</p>
              <ul className="card mt-3 divide-y divide-line">
                {invoice.promises.map(promise => {
                  const meta = PROMISE_STATUS_META[promise.status]
                  return (
                    <li key={promise.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-display tabular text-[19px]">{formatEur(promise.amountEur)}</span>
                        <span className="text-[13.5px] text-muted">pour le {formatDay(promise.dueDate)}</span>
                        <Pill tone={meta.tone}>{meta.label}</Pill>
                        {promise.confirmedAt !== undefined && <span className="text-[12px] font-semibold text-emerald">✓ Confirmée par écrit</span>}
                      </div>
                      {promise.status === 'attendue' && <PromiseButtons invoiceId={invoice.id} promiseId={promise.id} />}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <section>
            <p className="eyebrow">Journal · {activities.length}</p>
            <ol className="card relative mt-3 px-5 py-4">
              {activities.map((activity, index) => (
                <li key={activity.id} className="relative flex gap-3.5 pb-4 last:pb-0">
                  {index < activities.length - 1 && <span className="absolute left-[13px] top-8 bottom-0 w-px bg-line" aria-hidden="true" />}
                  <ActorBadge actor={activity.actor} />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-[14px] font-semibold leading-snug text-ink">{activity.title}</p>
                    {activity.detail !== undefined && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{activity.detail}</p>}
                    <p className="mt-1 text-[11.5px] text-faint">{actorLabel(activity.actor)} · {formatDateTime(activity.at)} · {ago(activity.at, now)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {calls.length > 0 && (
            <section>
              <p className="eyebrow">Appels · {calls.length}</p>
              <ol className="mt-3 space-y-3">
                {calls.map(call => {
                  const outcome = call.outcome !== undefined ? RELANCE_OUTCOME_META[call.outcome] : undefined
                  return (
                    <li key={call.id} className="card p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        {call.status === 'en_cours'
                          ? <Pill tone="warn">En cours</Pill>
                          : call.status === 'echec'
                            ? <Pill tone="hot">Échec</Pill>
                            : outcome !== undefined && <Pill tone={outcome.tone}>{outcome.label}</Pill>}
                        <span className="text-[12px] text-faint">{MODE_LABEL[call.mode]} · {formatDateTime(call.startedAt)}</span>
                      </div>
                      {call.summary !== undefined && <p className="mt-3 text-[14px] leading-relaxed text-ink-2">{call.summary}</p>}
                      {call.error !== undefined && <p className="mt-2 font-mono text-[12px] text-fuchsia">{call.error}</p>}
                      {call.transcript !== undefined && call.transcript.length > 0 && (
                        <details className="mt-3">
                          <summary className="text-[12px] font-semibold text-blue">Transcription · {call.transcript.length} tours</summary>
                          <div className="mt-3 rounded-md bg-sunk p-3">
                            <Transcript turns={call.transcript} userName={firstName} />
                          </div>
                        </details>
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <VoiceConsole
            kind="invoice"
            id={invoice.id}
            title={`Relancer ${invoice.debtor.company}`}
            roleHint={`Vous jouez ${invoice.debtor.contactName} : ${AGENT_NAME} vous relance au nom de ${invoice.creditor.company}.`}
            userName={firstName}
            phone={invoice.debtor.phone}
            browserReady={browserReady}
            phoneReady={phoneReady}
            dynamicVariables={relanceVariablesFor(invoice, new Date(now), { liveTool: true })}
            defaultAmountEur={invoice.amountEur}
          />

          <div className="card p-5">
            <p className="label">Interlocuteur</p>
            <p className="mt-2 text-[15px] font-semibold text-ink">{invoice.debtor.contactName}</p>
            <p className="text-[13px] text-muted">{invoice.debtor.contactRole}</p>
            <p className="tabular mt-1.5 font-mono text-[12px] text-ink-2">{formatPhone(invoice.debtor.phone)}</p>
            <p className="font-mono text-[12px] text-ink-2">{invoice.debtor.email}</p>
          </div>

          <div className="card p-5">
            <p className="label">Page de réponse du client</p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">Dans chaque email. Le client donne une date, signale un litige ou indique la bonne personne, sans compte, et la carte bouge aussitôt.</p>
            <p className="mt-3 break-all font-mono text-[11.5px] text-blue">{answerUrl(invoice)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton text={answerUrl(invoice)} label="Copier le lien" />
              <a href={`/f/${invoice.token}`} target="_blank" rel="noreferrer" className="btn btn-sm">Ouvrir ↗</a>
            </div>
          </div>

          <div className="card p-5">
            <p className="label">Vos décisions</p>
            <div className="mt-3"><InvoiceDecisions invoiceId={invoice.id} status={invoice.status} /></div>
          </div>
        </aside>
      </div>
    </div>
  )
}
