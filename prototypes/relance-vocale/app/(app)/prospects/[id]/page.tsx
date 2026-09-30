import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CallPanel } from '@/components/call-panel'
import { OutreachPanel } from '@/components/outreach-panel'
import { SourceChip, WeightDots } from '@/components/source-chip'
import { StageSelect } from '@/components/stage-select'
import { Stamp } from '@/components/stamp'
import { Transcript } from '@/components/transcript'
import { dynamicVariablesFor } from '@/core/agent-prompt'
import { elevenLabsEnv } from '@/core/env'
import { formatDateTime, formatKeur, formatPhone, relativeDay } from '@/core/format'
import { outreachCapabilities, outreachUrls, voiceScriptFor } from '@/core/outreach'
import { STAGE_META, type Tone } from '@/core/stages'
import { getStore } from '@/core/store'
import type { CallOutcome } from '@/core/types'
import { toView } from '@/core/views'

export const dynamic = 'force-dynamic'

const OUTCOME_LABEL: Record<CallOutcome, { label: string; tone: Tone }> = {
  rdv: { label: 'RDV pris', tone: 'green' },
  rappel: { label: 'À rappeler', tone: 'amber' },
  refus: { label: 'Refus', tone: 'muted' },
  inconnu: { label: 'À qualifier', tone: 'amber' },
}

const MODE_LABEL = { navigateur: 'navigateur', telephone: 'téléphone', simulation: 'simulation' } as const

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) notFound()
  const view = toView(prospect, await store.listSignals())
  const env = elevenLabsEnv()
  const browserReady = env.apiKey !== undefined && env.agentId !== undefined
  const phoneReady = browserReady && env.phoneNumberId !== undefined
  const stage = STAGE_META[view.stage]
  const calls = [...view.calls].reverse()
  const urls = outreachUrls(prospect)
  const [mp3, ogg] = await Promise.all([store.getAudio(prospect.id, 'mp3'), store.getAudio(prospect.id, 'ogg')])

  return (
    <div className="grid gap-12 py-10 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="animate-rise">
        <Link href="/" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted hover:text-ink">← Pipeline</Link>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <h1 className="font-display text-[40px] leading-[0.95] tracking-tight sm:text-[52px]">{view.company}</h1>
          <Stamp tone={stage.tone} animate>{stage.label}</Stamp>
        </div>
        <p className="mt-2 text-[14px] text-muted">{view.city} · {view.headcount}</p>

        <dl className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-3">
          <div className="rule pt-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Contact</dt>
            <dd className="mt-1 text-[14px]">
              {view.contact.firstName} {view.contact.lastName}
              <br />
              <span className="text-ink-2">{view.contact.role}</span>
              <br />
              <span className="tabular font-mono text-[12px] text-ink-2">{formatPhone(view.contact.phone)}</span>
            </dd>
          </div>
          <div className="rule pt-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Score</dt>
            <dd className="font-display tabular mt-1 text-[34px] leading-none">{view.score}<span className="text-[16px] text-muted">/100</span></dd>
          </div>
          <div className="rule pt-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Impayés estimés</dt>
            <dd className="font-display tabular mt-1 text-[34px] leading-none">{view.estimatedUnpaidKeur !== undefined ? formatKeur(view.estimatedUnpaidKeur) : '—'}</dd>
          </div>
        </dl>

        <section className="mt-10">
          <h2 className="rule pt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Angle d’ouverture</h2>
          <blockquote className="font-display mt-3 border-l-2 border-red pl-4 text-[20px] italic leading-snug">{view.angle}</blockquote>
        </section>

        <section className="mt-10">
          <h2 className="rule pt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Signaux · {view.signals.length}</h2>
          <ul className="mt-3 divide-y divide-line">
            {view.signals.map(signal => (
              <li key={signal.id} className={`py-3 ${signal.status === 'ignore' ? 'opacity-50' : ''}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <SourceChip source={signal.source} />
                  <WeightDots weight={signal.weight} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{relativeDay(signal.detectedAt)}{signal.status === 'ignore' ? ' · ignoré' : ''}</span>
                </div>
                <p className="mt-1.5 text-[15px] leading-snug">{signal.title}</p>
                {signal.excerpt !== '' && <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{signal.excerpt}</p>}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="rule pt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Appels · {calls.length}</h2>
          {calls.length === 0 && <p className="mt-3 text-[13px] text-muted">Aucun appel pour l’instant.</p>}
          <ol className="mt-3 space-y-8">
            {calls.map(call => (
              <li key={call.id} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {call.status === 'en_cours'
                      ? <Stamp tone="amber">en cours</Stamp>
                      : call.status === 'echec'
                        ? <Stamp tone="red">échec</Stamp>
                        : <Stamp tone={OUTCOME_LABEL[call.outcome ?? 'inconnu'].tone}>{OUTCOME_LABEL[call.outcome ?? 'inconnu'].label}</Stamp>}
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{MODE_LABEL[call.mode]} · {formatDateTime(call.startedAt)}</span>
                  </div>
                  {call.meetingSlot !== undefined && <span className="font-mono text-[11px] text-green">RDV : {call.meetingSlot}</span>}
                  {call.callbackAt !== undefined && <span className="font-mono text-[11px] text-amber">Rappel : {call.callbackAt}</span>}
                </div>
                {call.summary !== undefined && <p className="mt-3 text-[14px] leading-relaxed">{call.summary}</p>}
                {call.error !== undefined && <p className="mt-3 font-mono text-[12px] text-red">{call.error}</p>}
                {call.transcript !== undefined && call.transcript.length > 0 && (
                  <details className="mt-4">
                    <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.16em] text-muted hover:text-ink">Transcription · {call.transcript.length} tours</summary>
                    <div className="mt-3">
                      <Transcript turns={call.transcript} userName={view.contact.firstName} />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="animate-rise lg:sticky lg:top-6 lg:self-start" style={{ animationDelay: '120ms' }}>
        <CallPanel
          prospect={{ id: view.id, company: view.company, firstName: view.contact.firstName, phone: view.contact.phone }}
          browserReady={browserReady}
          phoneReady={phoneReady}
          dynamicVariables={dynamicVariablesFor(view, view.signals)}
        />
        <OutreachPanel
          prospectId={view.id}
          firstName={view.contact.firstName}
          email={view.contact.email}
          phone={view.contact.phone}
          landingUrl={urls.landingUrl}
          letterUrl={urls.letterUrl}
          script={voiceScriptFor(prospect, view.signals)}
          audioReady={{ mp3: mp3 !== undefined, ogg: ogg !== undefined }}
          publicAudioUrl={{ mp3: urls.audioUrl('mp3'), ogg: urls.audioUrl('ogg') }}
          capabilities={outreachCapabilities()}
        />
        <div className="mt-8 space-y-5">
          <StageSelect prospectId={view.id} stage={view.stage} />
          {view.nextCallAt !== undefined && (
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-amber">Prochain appel : {formatDateTime(view.nextCallAt)}</p>
          )}
          {view.notes !== undefined && view.notes !== '' && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Notes</p>
              <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{view.notes}</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
