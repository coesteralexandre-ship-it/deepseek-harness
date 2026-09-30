'use client'

import { ConversationProvider, useConversation } from '@elevenlabs/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AGENT_NAME, CLIENT_TOOL } from '@/core/agent-prompt'
import type { TranscriptTurn } from '@/core/types'

interface Props {
  token: string
  firstName: string
  company: string
  callerName: string
  dynamicVariables: Record<string, string>
  browserReady: boolean
  phoneReady: boolean
  /** Public MP3 of the voice note, or null when it cannot be produced. */
  audioUrl: string | null
}

export function PublicCall(props: Props) {
  return (
    <ConversationProvider>
      <Inner {...props} />
    </ConversationProvider>
  )
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data: unknown = await response.json().catch(() => undefined)
  if (response.ok) return { ok: true, data }
  const error = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : `Erreur ${response.status}`
  return { ok: false, error }
}

function Inner({ token, firstName, callerName, dynamicVariables, browserReady, phoneReady, audioUrl }: Props) {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'live' | 'ended'>('idle')
  const [turns, setTurns] = useState<TranscriptTurn[]>([])
  const [booked, setBooked] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [phoneState, setPhoneState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const callId = useRef<string | undefined>(undefined)
  const conversationId = useRef<string | undefined>(undefined)
  const turnsRef = useRef<TranscriptTurn[]>([])
  const bookedRef = useRef<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  const conversation = useConversation({
    clientTools: {
      [CLIENT_TOOL.name]: async (parameters: { slot?: string; notes?: string }) => {
        const slot = parameters.slot?.trim()
        if (slot === undefined || slot === '') return 'Il manque le créneau : demande un jour et une heure.'
        bookedRef.current = slot
        setBooked(slot)
        return `Rendez-vous enregistré : ${slot}.`
      },
    },
    onConnect: async ({ conversationId: id }) => {
      conversationId.current = id
      setPhase('live')
      const opened = await postJson(`/api/l/${token}/calls`, { action: 'open', mode: 'navigateur', conversationId: id })
      callId.current = (opened.data as { callId?: string } | undefined)?.callId
    },
    onMessage: ({ message, role }) => {
      if (message.trim() === '') return
      const turn: TranscriptTurn = { role: role === 'agent' ? 'agent' : 'user', text: message }
      turnsRef.current = [...turnsRef.current, turn]
      setTurns(turnsRef.current)
    },
    onDisconnect: async details => {
      if (details.reason === 'error') setNotice(details.message)
      setPhase('ended')
      await postJson(`/api/l/${token}/calls`, {
        action: 'close',
        callId: callId.current,
        conversationId: conversationId.current,
        outcome: bookedRef.current !== null ? 'rdv' : 'inconnu',
        meetingSlot: bookedRef.current ?? undefined,
        transcript: turnsRef.current,
      })
    },
    onError: message => setNotice(message),
  })

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [turns])

  async function start() {
    setNotice(null)
    turnsRef.current = []
    bookedRef.current = null
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
      setNotice(error instanceof Error ? error.message : 'Impossible de démarrer')
      setPhase('idle')
    }
  }

  async function requestCall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPhoneState('sending')
    setNotice(null)
    const result = await postJson(`/api/l/${token}/call`, { toNumber: phone.replace(/[\s.-]/g, '') })
    if (!result.ok) {
      setNotice(result.error ?? 'Appel impossible')
      setPhoneState('idle')
      return
    }
    setPhoneState('sent')
  }

  const live = phase === 'live'
  const connecting = phase === 'starting' || conversation.status === 'connecting'

  return (
    <div className="mt-10 grid gap-5 md:grid-cols-2">
      <section className="card animate-rise p-6" style={{ animationDelay: '80ms' }}>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Maintenant, depuis ce navigateur</p>
        <h2 className="font-display mt-2 text-2xl">Parler à {AGENT_NAME}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">Autorisez le micro ; {AGENT_NAME} vous appelle comme elle appellerait vos clients.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!live && (
            <button type="button" className="btn btn-solid" disabled={!browserReady || connecting} onClick={start}>
              {connecting ? 'Connexion…' : phase === 'ended' ? 'Reparler à Léa' : `Parler à ${AGENT_NAME}`}
            </button>
          )}
          {live && <button type="button" className="btn btn-red" onClick={() => conversation.endSession()}>Raccrocher</button>}
          {live && <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-red"><span className="h-2 w-2 animate-blink rounded-full bg-red" />En ligne</span>}
          {live && conversation.isSpeaking && <span className="bars text-red"><span /><span /><span /><span /><span /></span>}
        </div>
        {!browserReady && <p className="mt-3 font-mono text-[11px] text-amber">La conversation en ligne n’est pas activée sur cette démo.</p>}
        {turns.length > 0 && (
          <ol ref={listRef} className="mt-4 max-h-56 space-y-2 overflow-auto border-t border-line pt-3">
            {turns.map((turn, index) => (
              <li key={index} className="grid grid-cols-[56px_1fr] gap-2 text-[13px] leading-snug">
                <span className={`font-mono text-[10px] uppercase tracking-[0.12em] ${turn.role === 'agent' ? 'text-red' : 'text-muted'}`}>{turn.role === 'agent' ? AGENT_NAME : firstName}</span>
                <p className={turn.role === 'user' ? 'text-ink-2' : ''}>{turn.text}</p>
              </li>
            ))}
          </ol>
        )}
        {booked !== null && <p className="mt-3 font-mono text-[11px] text-green">Rendez-vous noté : {booked}. {callerName} vous confirme par email.</p>}
        {phase === 'ended' && booked === null && <p className="mt-3 text-[13px] text-ink-2">Merci {firstName}. Si vous voulez aller plus loin, {callerName} vous montrera l’agent sur vos propres factures.</p>}
      </section>

      <div className="grid gap-5">
        <section className="card animate-rise p-6" style={{ animationDelay: '160ms' }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Plutôt au téléphone</p>
          <h2 className="font-display mt-2 text-2xl">Me faire rappeler</h2>
          {phoneState === 'sent'
            ? <p className="mt-3 text-[13px] leading-relaxed text-green">{AGENT_NAME} vous appelle dans quelques secondes.</p>
            : (
              <form onSubmit={requestCall} className="mt-3 flex flex-wrap items-end gap-3">
                <label className="min-w-[180px] flex-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Votre numéro</span>
                  <input className="field tabular mt-1 font-mono" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+33 6 12 34 56 78" required />
                </label>
                <button type="submit" className="btn" disabled={!phoneReady || phoneState === 'sending'}>{phoneState === 'sending' ? 'Appel…' : 'Appelez-moi'}</button>
              </form>
            )}
          {!phoneReady && <p className="mt-3 font-mono text-[11px] text-amber">Le rappel téléphonique n’est pas activé sur cette démo.</p>}
        </section>

        <section className="card animate-rise p-6" style={{ animationDelay: '240ms' }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Quarante secondes</p>
          <h2 className="font-display mt-2 text-2xl">Écouter le message de {AGENT_NAME}</h2>
          {audioUrl !== null
            ? <audio className="mt-3 w-full" controls preload="none" src={audioUrl} />
            : <p className="mt-3 font-mono text-[11px] text-amber">Le message vocal n’est pas disponible sur cette démo.</p>}
        </section>
      </div>

      {notice !== null && <p className="border-l-2 border-red pl-3 text-[13px] leading-relaxed text-ink-2 md:col-span-2">{notice}</p>}
    </div>
  )
}
