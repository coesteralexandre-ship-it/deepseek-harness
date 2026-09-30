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
      // Then let the agent's own analysis replace the provisional outcome.
      const ended = conversationId.current
      for (let attempt = 0; ended !== undefined && attempt < 6; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 3000))
        const analyzed = await postJson(`/api/l/${token}/calls`, { action: 'analyze', conversationId: ended, callId: callId.current })
        if (!analyzed.ok || (analyzed.data as { pending?: boolean } | undefined)?.pending !== true) break
      }
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
    // An unanswered microphone prompt never settles: free the button after 25 seconds.
    const giveUp = setTimeout(() => {
      setPhase(current => (current === 'starting' ? 'idle' : current))
      setNotice('Le micro n’a pas été autorisé : autorisez-le dans la barre d’adresse, puis réessayez.')
    }, 25_000)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      const response = await fetch(`/api/l/${token}/signed-url`, { cache: 'no-store' })
      const data = (await response.json()) as { signedUrl?: string; error?: string }
      if (!response.ok || data.signedUrl === undefined) throw new Error(data.error ?? `Erreur ${response.status}`)
      conversation.startSession({ signedUrl: data.signedUrl, connectionType: 'websocket', dynamicVariables })
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'NotFoundError')
      setNotice(denied ? 'Micro refusé ou introuvable : autorisez-le dans la barre d’adresse, puis réessayez.' : error instanceof Error ? error.message : 'Impossible de démarrer')
      setPhase('idle')
    } finally {
      clearTimeout(giveUp)
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
    <div className="mt-9 grid gap-4 md:grid-cols-2">
      <section className="card card-blue animate-rise p-6" style={{ animationDelay: '80ms' }}>
        <p className="label">Maintenant, depuis ce navigateur</p>
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            aria-label={live ? 'Raccrocher' : `Parler à ${AGENT_NAME}`}
            disabled={(!browserReady && !live) || connecting}
            onClick={live ? () => conversation.endSession() : start}
            className={`grid h-[76px] w-[76px] shrink-0 place-items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${live ? 'animate-ring border-fuchsia/60 bg-fuchsia/15 text-fuchsia' : 'border-blue-2/60 bg-blue text-ink shadow-[0_0_44px_-6px_rgba(22,52,239,0.95)] hover:bg-blue-2'}`}
          >
            {live
              ? <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              : <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}
          </button>
          <div className="min-w-0">
            <h2 className="font-display text-[22px] leading-tight">{live ? `${AGENT_NAME} vous écoute` : connecting ? 'Connexion…' : phase === 'ended' ? `Reparler à ${AGENT_NAME}` : `Parler à ${AGENT_NAME}`}</h2>
            <p className="mt-1 text-[13px] leading-snug text-muted">Autorisez le micro : {AGENT_NAME} vous appelle comme elle appellerait vos clients.</p>
          </div>
        </div>
        {live && conversation.isSpeaking && <p className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-blue"><span className="bars"><span /><span /><span /><span /><span /></span>{AGENT_NAME} parle</p>}
        {!browserReady && <p className="mt-4 font-mono text-[11px] text-ochre">La conversation en ligne n’est pas activée sur cette démo.</p>}
        {turns.length > 0 && (
          <ol ref={listRef} className="mt-4 max-h-56 space-y-2 overflow-auto rounded-lg border border-line bg-sunk p-3">
            {turns.map((turn, index) => (
              <li key={index} className="grid grid-cols-[52px_1fr] gap-2 text-[13px] leading-snug">
                <span className={`pt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${turn.role === 'agent' ? 'text-blue' : 'text-faint'}`}>{turn.role === 'agent' ? AGENT_NAME : firstName}</span>
                <p className={turn.role === 'user' ? 'text-muted' : 'text-ink-2'}>{turn.text}</p>
              </li>
            ))}
          </ol>
        )}
        {booked !== null && <p className="mt-3 font-mono text-[11px] text-emerald">Rendez-vous noté : {booked}. {callerName} vous confirme par email.</p>}
        {phase === 'ended' && booked === null && <p className="mt-3 text-[13px] leading-relaxed text-muted">Merci {firstName}. Si vous voulez aller plus loin, {callerName} vous montrera l’agent sur vos propres factures.</p>}
      </section>

      <div className="grid content-start gap-4">
        {phoneReady && (
        <section className="card animate-rise p-6" style={{ animationDelay: '160ms' }}>
          <p className="label">Plutôt au téléphone</p>
          <h2 className="font-display mt-2 text-[20px] leading-tight">Me faire rappeler</h2>
          {phoneState === 'sent'
            ? <p className="mt-3 text-[13.5px] leading-relaxed text-emerald">{AGENT_NAME} vous appelle dans quelques secondes.</p>
            : (
              <form onSubmit={requestCall} className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-[180px] flex-1">
                  <span className="label">Votre numéro</span>
                  <input id="callback-number" className="field tabular mt-1.5 font-mono text-[13px]" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+33 6 12 34 56 78" required />
                </label>
                <button type="submit" className="btn" disabled={!phoneReady || phoneState === 'sending'}>{phoneState === 'sending' ? 'Appel…' : 'Appelez-moi'}</button>
              </form>
            )}
        </section>
        )}

        {audioUrl !== null && (
        <section className="card animate-rise p-6" style={{ animationDelay: '240ms' }}>
          <p className="label">Quarante secondes</p>
          <h2 className="font-display mt-2 text-[20px] leading-tight">Écouter le message de {AGENT_NAME}</h2>
          <audio className="mt-3 w-full" controls preload="none" src={audioUrl} />
        </section>
        )}
        <section className="card animate-rise p-6" style={{ animationDelay: '320ms' }}>
          <p className="label">Ce que vous allez entendre</p>
          <ul className="mt-3 space-y-2 text-[13.5px] leading-snug text-muted">
            <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" />Un rappel courtois à J+3, jamais de pression.</li>
            <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" />Une date et un montant de règlement, confirmés par écrit.</li>
            <li className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" />Un humain de votre équipe dès qu’un litige apparaît.</li>
          </ul>
        </section>
      </div>

      {notice !== null && <p className="rounded-lg border border-fuchsia/30 bg-fuchsia/10 px-3 py-2 text-[13px] leading-relaxed text-fuchsia md:col-span-2">{notice}</p>}
    </div>
  )
}
