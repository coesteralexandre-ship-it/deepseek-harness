'use client'

import { ConversationProvider, useConversation } from '@elevenlabs/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Stamp } from '@/components/stamp'
import { AGENT_NAME, CLIENT_TOOL } from '@/core/agent-prompt'
import { formatPhone } from '@/core/format'
import type { CallOutcome, TranscriptTurn } from '@/core/types'

export interface CallPanelProspect {
  id: string
  company: string
  firstName: string
  phone: string
}

interface Props {
  prospect: CallPanelProspect
  /** API key and agent id are set: the browser can talk to the agent. */
  browserReady: boolean
  /** A phone number is imported too: real outbound calls are possible. */
  phoneReady: boolean
  dynamicVariables: Record<string, string>
}

export function CallPanel(props: Props) {
  return (
    <ConversationProvider>
      <Panel {...props} />
    </ConversationProvider>
  )
}

type Phase = 'idle' | 'starting' | 'live' | 'qualify' | 'saving'

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data: unknown = await response.json().catch(() => undefined)
  if (response.ok) return { ok: true, data }
  const error = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : `Erreur ${response.status}`
  return { ok: false, error }
}

function Panel({ prospect, browserReady, phoneReady, dynamicVariables }: Props) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [turns, setTurns] = useState<TranscriptTurn[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [booked, setBooked] = useState<string | null>(null)
  const [toNumber, setToNumber] = useState(prospect.phone)
  const [busy, setBusy] = useState<string | null>(null)
  const callId = useRef<string | undefined>(undefined)
  const conversationId = useRef<string | undefined>(undefined)
  const transcriptRef = useRef<HTMLOListElement>(null)

  const conversation = useConversation({
    clientTools: {
      [CLIENT_TOOL.name]: async (parameters: { slot?: string; notes?: string }) => {
        const slot = parameters.slot?.trim()
        if (slot === undefined || slot === '') return 'Il manque le créneau : demande un jour et une heure.'
        setBooked(slot)
        return `Rendez-vous enregistré : ${slot}.`
      },
    },
    onConnect: async ({ conversationId: id }) => {
      conversationId.current = id
      setPhase('live')
      const opened = await postJson(`/api/prospects/${prospect.id}/calls`, { action: 'open', mode: 'navigateur', conversationId: id })
      const data = opened.data as { call?: { id: string } } | undefined
      callId.current = data?.call?.id
      router.refresh()
    },
    onMessage: ({ message, role }) => {
      if (message.trim() === '') return
      setTurns(current => [...current, { role: role === 'agent' ? 'agent' : 'user', text: message }])
    },
    onDisconnect: details => {
      if (details.reason === 'error') setNotice(details.message)
      setPhase(current => (current === 'live' || current === 'starting' ? 'qualify' : current))
    },
    onError: message => setNotice(message),
  })

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [turns])

  async function startBrowserCall() {
    setNotice(null)
    setTurns([])
    setBooked(null)
    setPhase('starting')
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
      const response = await fetch('/api/elevenlabs/signed-url', { cache: 'no-store' })
      const data = (await response.json()) as { signedUrl?: string; error?: string }
      if (!response.ok || data.signedUrl === undefined) throw new Error(data.error ?? `Erreur ${response.status}`)
      conversation.startSession({ signedUrl: data.signedUrl, connectionType: 'websocket', dynamicVariables })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Impossible de démarrer la conversation')
      setPhase('idle')
    }
  }

  async function closeCall(outcome: CallOutcome) {
    setPhase('saving')
    const result = await postJson(`/api/prospects/${prospect.id}/calls`, {
      action: 'close',
      callId: callId.current,
      conversationId: conversationId.current,
      outcome,
      meetingSlot: booked ?? undefined,
      transcript: turns,
    })
    if (!result.ok) setNotice(result.error ?? 'Enregistrement impossible')
    callId.current = undefined
    conversationId.current = undefined
    setPhase('idle')
    router.refresh()
  }

  async function startPhoneCall() {
    setBusy('phone')
    setNotice(null)
    try {
      const result = await postJson(`/api/prospects/${prospect.id}/call`, { toNumber })
      if (!result.ok) {
        setNotice(result.error ?? 'Appel refusé')
        return
      }
      setNotice(`Appel lancé vers ${formatPhone(toNumber)}. L’issue arrivera par le webhook post-appel.`)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function simulate(outcome?: 'rdv' | 'rappel' | 'refus') {
    setBusy(`sim-${outcome ?? 'random'}`)
    setNotice(null)
    try {
      const result = await postJson(`/api/prospects/${prospect.id}/simulate`, outcome === undefined ? {} : { outcome })
      if (!result.ok) setNotice(result.error ?? 'Simulation impossible')
      else router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const live = phase === 'live'
  const connecting = phase === 'starting' || conversation.status === 'connecting'

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Appeler {prospect.firstName}</h2>
        {live
          ? <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-red"><span className="h-2 w-2 animate-blink rounded-full bg-red" />En ligne</span>
          : connecting
            ? <Stamp tone="amber">connexion</Stamp>
            : phase === 'qualify' || phase === 'saving'
              ? <Stamp tone="amber">à qualifier</Stamp>
              : <Stamp tone="muted">prêt</Stamp>}
      </div>

      <section className="mt-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Dans le navigateur · la démo est le produit</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Vous jouez {prospect.firstName} : {AGENT_NAME} vous appelle avec les signaux de {prospect.company} et tente de prendre rendez-vous.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!live && phase !== 'qualify' && phase !== 'saving' && (
            <button type="button" className="btn btn-solid" disabled={!browserReady || connecting} onClick={startBrowserCall}>
              {connecting ? 'Connexion…' : `Parler à ${AGENT_NAME}`}
            </button>
          )}
          {live && (
            <button type="button" className="btn btn-red" onClick={() => conversation.endSession()}>Raccrocher</button>
          )}
        </div>
        {!browserReady && <p className="mt-2 font-mono text-[11px] text-amber">Renseignez ELEVENLABS_API_KEY et ELEVENLABS_AGENT_ID (page Agent).</p>}

        {(live || turns.length > 0) && (
          <div className="mt-4 border border-line bg-paper-2/40 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Transcription en direct</span>
              {live && conversation.isSpeaking && <span className="bars text-red" aria-label={`${AGENT_NAME} parle`}><span /><span /><span /><span /><span /></span>}
            </div>
            <ol ref={transcriptRef} className="mt-2 max-h-56 space-y-2 overflow-auto">
              {turns.map((turn, index) => (
                <li key={index} className="grid grid-cols-[56px_1fr] gap-2 text-[13px] leading-snug">
                  <span className={`font-mono text-[10px] uppercase tracking-[0.12em] ${turn.role === 'agent' ? 'text-red' : 'text-muted'}`}>{turn.role === 'agent' ? AGENT_NAME : prospect.firstName}</span>
                  <p className={turn.role === 'user' ? 'text-ink-2' : ''}>{turn.text}</p>
                </li>
              ))}
              {turns.length === 0 && <li className="text-[13px] text-muted">En attente du premier message…</li>}
            </ol>
            {booked !== null && <p className="mt-2 font-mono text-[11px] text-green">Rendez-vous noté par l’agent : {booked}</p>}
          </div>
        )}

        {(phase === 'qualify' || phase === 'saving') && (
          <div className="mt-4 border border-amber/60 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber">Issue de l’appel</p>
            <p className="mt-1 text-[12px] text-ink-2">Le webhook post-appel la mettra à jour si l’agent l’a analysée ; sinon, choisissez :</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn" disabled={phase === 'saving'} onClick={() => closeCall('rdv')}>RDV pris{booked !== null ? ` · ${booked}` : ''}</button>
              <button type="button" className="btn" disabled={phase === 'saving'} onClick={() => closeCall('rappel')}>À rappeler</button>
              <button type="button" className="btn" disabled={phase === 'saving'} onClick={() => closeCall('refus')}>Pas intéressé</button>
              <button type="button" className="btn" disabled={phase === 'saving'} onClick={() => closeCall('inconnu')}>Sans suite</button>
            </div>
          </div>
        )}
      </section>

      <section className="rule mt-6 pt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Appel sortant réel</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">ElevenLabs compose le numéro depuis votre ligne Twilio ou SIP. Mettez votre propre numéro pour recevoir l’appel.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-[200px] flex-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Numéro (E.164)</span>
            <input className="field tabular mt-1 font-mono" value={toNumber} onChange={event => setToNumber(event.target.value)} placeholder="+33612345678" />
          </label>
          <button type="button" className="btn" disabled={!phoneReady || busy === 'phone' || live} onClick={startPhoneCall}>
            {busy === 'phone' ? 'Appel…' : 'Lancer l’appel'}
          </button>
        </div>
        {!phoneReady && <p className="mt-2 font-mono text-[11px] text-amber">Importez un numéro dans ElevenLabs et renseignez ELEVENLABS_PHONE_NUMBER_ID.</p>}
      </section>

      <section className="rule mt-6 pt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Simulation · sans ElevenLabs</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">Génère un appel terminé avec transcription et déplace la carte, pour montrer le pipeline.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={busy !== null || live} onClick={() => simulate()}>Aléatoire</button>
          <button type="button" className="btn" disabled={busy !== null || live} onClick={() => simulate('rdv')}>RDV</button>
          <button type="button" className="btn" disabled={busy !== null || live} onClick={() => simulate('rappel')}>Rappel</button>
          <button type="button" className="btn" disabled={busy !== null || live} onClick={() => simulate('refus')}>Refus</button>
        </div>
      </section>

      {notice !== null && <p className="mt-5 border-l-2 border-red pl-3 text-[13px] leading-relaxed text-ink-2">{notice}</p>}
      {conversation.status === 'error' && conversation.message !== undefined && conversation.message !== notice && (
        <p className="mt-2 border-l-2 border-red pl-3 text-[13px] leading-relaxed text-ink-2">{conversation.message}</p>
      )}
    </div>
  )
}
