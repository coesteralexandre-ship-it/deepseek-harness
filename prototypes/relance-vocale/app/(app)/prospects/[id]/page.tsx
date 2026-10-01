import Link from 'next/link'
import { notFound } from 'next/navigation'
import { OutreachPanel } from '@/components/outreach-panel'
import { EnrichPanel } from '@/components/enrich-panel'
import { Pill } from '@/components/pill'
import { SourceChip, WeightDots } from '@/components/source-chip'
import { StageSelect } from '@/components/stage-select'
import { Transcript } from '@/components/transcript'
import { VoiceConsole } from '@/components/voice-console'
import { AGENT_NAME, dynamicVariablesFor } from '@/core/agent-prompt'
import { enrichKeys } from '@/core/enrich'
import { elevenLabsEnv } from '@/core/env'
import { formatDateTime, formatKeur, formatPhone, relativeDay } from '@/core/format'
import { outreachCapabilities, outreachUrls, voiceScriptFor } from '@/core/outreach'
import { STAGE_META, type Tone } from '@/core/stages'
import { getStore } from '@/core/store'
import type { CallOutcome } from '@/core/types'
import { toView } from '@/core/views'

export const dynamic = 'force-dynamic'

const OUTCOME_LABEL: Record<CallOutcome, { label: string; tone: Tone }> = {
  rdv: { label: 'RDV pris', tone: 'ok' },
  rappel: { label: 'À rappeler', tone: 'warn' },
  refus: { label: 'Refus', tone: 'mute' },
  inconnu: { label: 'À qualifier', tone: 'warn' },
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
  const fullName = `${view.contact.firstName} ${view.contact.lastName}`.trim()
  const callee = view.contact.firstName !== '' ? view.contact.firstName : 'la direction'
  const [mp3, ogg] = await Promise.all([store.getAudio(prospect.id, 'mp3'), store.getAudio(prospect.id, 'ogg')])

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
      <div className="animate-rise min-w-0">
        <Link href="/pipeline" className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint hover:text-ink">← Pipeline</Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[34px] leading-[1.02] sm:text-[44px]">{view.company}</h1>
          <Pill tone={stage.tone}>{stage.label}</Pill>
        </div>
        <p className="mt-2 text-[14px] text-muted">{view.city} · {view.headcount}</p>
        {(view.address !== undefined || view.siren !== undefined) && (
          <p className="mt-1 text-[13px] text-muted">
            {view.address}
            {view.siren !== undefined && <> · <a href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${view.siren}`} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-blue hover:underline">SIREN {view.siren} ↗</a></>}
          </p>
        )}

        <dl className="mt-7 grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <dt className="label">Contact</dt>
            <dd className="mt-2 text-[14.5px] font-semibold text-ink">{fullName !== '' ? fullName : 'Dirigeant non publié'}</dd>
            <dd className="text-[13px] text-muted">{view.contact.role}</dd>
            <dd className="tabular mt-1 font-mono text-[12px] text-muted">{view.contact.phone !== '' ? formatPhone(view.contact.phone) : 'Numéro non publié'}</dd>
          </div>
          <div className="card p-4">
            <dt className="label">Score</dt>
            <dd className="font-display tabular mt-2 text-[30px] leading-none">{view.score}<span className="text-[15px] font-medium text-faint">/100</span></dd>
            <dd className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-gradient-to-r from-blue to-fuchsia" style={{ width: `${view.score}%` }} /></dd>
          </div>
          <div className="card p-4">
            <dt className="label" title="Créances clients au-delà du délai légal de 60 jours, estimées sur les comptes publiés : CA × (délai client − 60) / 365">Au-delà de 60 j (estimé)</dt>
            <dd className="font-display tabular mt-2 text-[30px] leading-none">{view.estimatedUnpaidKeur !== undefined ? formatKeur(view.estimatedUnpaidKeur) : '—'}</dd>
          </div>
        </dl>

        <section className="mt-8">
          <p className="eyebrow">Angle d’ouverture</p>
          <blockquote className="mt-3 border-l-[3px] border-blue pl-4 text-[21px] font-semibold leading-snug tracking-[-0.01em] text-ink">{view.angle}</blockquote>
        </section>

        <section className="mt-8">
          <p className="eyebrow">Signaux · {view.signals.length}</p>
          <ul className="card mt-3 divide-y divide-line">
            {view.signals.map(signal => (
              <li key={signal.id} className={`px-4 py-3.5 ${signal.status === 'ignore' ? 'opacity-50' : ''}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <SourceChip source={signal.source} />
                  <WeightDots weight={signal.weight} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{relativeDay(signal.detectedAt)}{signal.status === 'ignore' ? ' · ignoré' : ''}</span>
                </div>
                <p className="mt-2 text-[15px] font-medium leading-snug text-ink">{signal.title}</p>
                {signal.excerpt !== '' && <p className="mt-1 text-[13px] leading-relaxed text-muted">{signal.excerpt}</p>}
                {signal.url !== undefined && <a href={signal.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[12.5px] font-semibold text-blue hover:underline">Voir la source ↗</a>}
              </li>
            ))}
          </ul>
        </section>

        <EnrichPanel prospectId={prospect.id} enrichment={prospect.enrichment} ready={enrichKeys().exa !== undefined} />

        <section className="mt-8">
          <p className="eyebrow">Appels · {calls.length}</p>
          {calls.length === 0 && <p className="mt-3 text-[13.5px] text-faint">Aucun appel pour l’instant.</p>}
          <ol className="mt-3 space-y-3">
            {calls.map(call => (
              <li key={call.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {call.status === 'en_cours'
                      ? <Pill tone="warn">En cours</Pill>
                      : call.status === 'echec'
                        ? <Pill tone="hot">Échec</Pill>
                        : <Pill tone={OUTCOME_LABEL[call.outcome ?? 'inconnu'].tone}>{OUTCOME_LABEL[call.outcome ?? 'inconnu'].label}</Pill>}
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{MODE_LABEL[call.mode]} · {formatDateTime(call.startedAt)}</span>
                  </div>
                  {call.meetingSlot !== undefined && <span className="font-mono text-[11px] text-emerald">RDV : {call.meetingSlot}</span>}
                  {call.callbackAt !== undefined && <span className="font-mono text-[11px] text-ochre">Rappel : {call.callbackAt}</span>}
                </div>
                {call.summary !== undefined && <p className="mt-3 text-[14px] leading-relaxed text-ink-2">{call.summary}</p>}
                {call.error !== undefined && <p className="mt-3 font-mono text-[12px] text-fuchsia">{call.error}</p>}
                {call.transcript !== undefined && call.transcript.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.16em] text-faint hover:text-ink">Transcription · {call.transcript.length} tours</summary>
                    <div className="mt-3 rounded-lg border border-line bg-sunk p-3">
                      <Transcript turns={call.transcript} userName={view.contact.firstName} />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="animate-rise space-y-4 lg:sticky lg:top-8 lg:self-start" style={{ animationDelay: '120ms' }}>
        <VoiceConsole
          kind="prospect"
          id={view.id}
          title={`Appeler ${callee}`}
          roleHint={`Vous jouez ${fullName !== '' ? fullName : 'la direction'} : ${AGENT_NAME} vous appelle avec les signaux de ${view.company} et tente de prendre rendez-vous.`}
          userName={callee}
          phone={view.contact.phone}
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
        <div className="card space-y-4 p-5">
          <StageSelect prospectId={view.id} stage={view.stage} />
          {view.nextCallAt !== undefined && (
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ochre">Prochain appel : {formatDateTime(view.nextCallAt)}</p>
          )}
          {view.notes !== undefined && view.notes !== '' && (
            <div>
              <p className="label">Notes</p>
              <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-muted">{view.notes}</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
