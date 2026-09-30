'use client'

import { ConversationProvider, useConversation } from '@elevenlabs/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AGENT_NAME } from '@/core/agent-prompt'
import { formatPhone } from '@/core/format'
import type { TranscriptTurn } from '@/core/types'

/** What the console drives: a prospecting call to an agency, or a reminder call about an invoice. */
type Kind = 'prospect' | 'invoice'

interface Props {
  kind: Kind
  id: string
  title: string
  /** One sentence telling the user whom they play in the browser call. */
  roleHint: string
  /** Name shown on the user's side of the transcript. */
  userName: string
  phone: string
  /** API key and the matching agent id are set: the browser can talk to the agent. */
  browserReady: boolean
  /** A phone number is imported too: real outbound calls are possible. */
  phoneReady: boolean
  dynamicVariables: Record<string, string>
  /** Invoice amount, prefilled when a promise is qualified by hand. */
  defaultAmountEur?: number
}

export function VoiceConsole(props: Props) {
  return (
    <ConversationProvider>
      <Console {...props} />
    </ConversationProvider>
  )
}

type Mode = 'navigateur' | 'telephone' | 'simulation'
type Phase = 'idle' | 'starting' | 'live' | 'analyzing' | 'qualify' | 'saving'

const MODES: { id: Mode; label: string }[] = [
  { id: 'navigateur', label: 'Navigateur' },
  { id: 'telephone', label: 'Téléphone' },
  { id: 'simulation', label: 'Simulation' },
]

const OUTCOMES: Record<Kind, { value: string; label: string }[]> = {
  prospect: [
    { value: 'rdv', label: 'RDV pris' },
    { value: 'rappel', label: 'À rappeler' },
    { value: 'refus', label: 'Pas intéressé' },
    { value: 'inconnu', label: 'Sans suite' },
  ],
  invoice: [
    { value: 'promesse', label: 'Promesse' },
    { value: 'litige', label: 'Litige' },
    { value: 'renvoi', label: 'À renvoyer' },
    { value: 'rappel', label: 'Rappel' },
    { value: 'sans_suite', label: 'Sans suite' },
  ],
}

const SIMULATIONS: Record<Kind, { value: string; label: string }[]> = {
  prospect: [
    { value: 'rdv', label: 'RDV pris' },
    { value: 'rappel', label: 'Rappel demandé' },
    { value: 'refus', label: 'Refus' },
  ],
  invoice: [
    { value: 'promesse', label: 'Promesse de règlement' },
    { value: 'litige', label: 'Litige' },
    { value: 'renvoi', label: 'Facture non reçue' },
    { value: 'sans_suite', label: 'Répondeur' },
  ],
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data: unknown = await response.json().catch(() => undefined)
  if (response.ok) return { ok: true, data }
  const error = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : `Erreur ${response.status}`
  return { ok: false, error }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

function Console({ kind, id, title, roleHint, userName, phone, browserReady, phoneReady, dynamicVariables, defaultAmountEur }: Props) {
  const router = useRouter()
  const base = kind === 'invoice' ? `/api/invoices/${id}` : `/api/prospects/${id}`
  const [mode, setMode] = useState<Mode>('navigateur')
  const [phase, setPhase] = useState<Phase>('idle')
  const [turns, setTurns] = useState<TranscriptTurn[]>([])
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null)
  const [toNumber, setToNumber] = useState(phone)
  const [busy, setBusy] = useState<string | null>(null)
  const [watching, setWatching] = useState(false)
  const [promiseDate, setPromiseDate] = useState(() => inDays(4))
  const [promiseAmount, setPromiseAmount] = useState(defaultAmountEur !== undefined ? String(defaultAmountEur) : '')
  const callId = useRef<string | undefined>(undefined)
  const conversationId = useRef<string | undefined>(undefined)
  const turnsRef = useRef<TranscriptTurn[]>([])
  const alive = useRef(true)
  /** Bumped whenever a pending browser call is abandoned, so a late microphone grant starts nothing. */
  const attempt = useRef(0)
  const transcriptRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /** Ask the server to read the agent's analysis back; true once the call record is closed with it. */
  async function analyze(conversation: string, call: string | undefined, tries: number, delayMs: number): Promise<boolean> {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      await sleep(delayMs)
      if (!alive.current) return false
      const result = await postJson(`${base}/calls`, { action: 'analyze', conversationId: conversation, callId: call })
      if (!result.ok) return false
      if ((result.data as { pending?: boolean } | undefined)?.pending !== true) return true
    }
    return false
  }

  const conversation = useConversation({
    onConnect: async ({ conversationId: started }) => {
      conversationId.current = started
      setPhase('live')
      const opened = await postJson(`${base}/calls`, { action: 'open', mode: 'navigateur', conversationId: started })
      callId.current = (opened.data as { call?: { id: string } } | undefined)?.call?.id
      router.refresh()
    },
    onMessage: ({ message, role }) => {
      if (message.trim() === '') return
      turnsRef.current = [...turnsRef.current, { role: role === 'agent' ? 'agent' : 'user', text: message }]
      setTurns(turnsRef.current)
    },
    onDisconnect: async details => {
      if (details.reason === 'error') setNotice({ tone: 'error', text: details.message })
      const ended = conversationId.current
      if (ended === undefined) {
        setPhase('idle')
        return
      }
      setPhase('analyzing')
      const analyzed = await analyze(ended, callId.current, 8, 2500)
      if (!alive.current) return
      if (analyzed) {
        callId.current = undefined
        conversationId.current = undefined
        setPhase('idle')
        setNotice({ tone: 'ok', text: `${AGENT_NAME} a analysé l’appel : la fiche est à jour.` })
        router.refresh()
      } else {
        setPhase('qualify')
      }
    },
    onError: message => setNotice({ tone: 'error', text: message }),
  })

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [turns])

  /** Give up on a browser call that has not connected yet. */
  function abandonStart(text?: string) {
    attempt.current += 1
    setPhase(current => (current === 'starting' ? 'idle' : current))
    if (text !== undefined) setNotice({ tone: 'error', text })
  }

  async function startBrowserCall() {
    const mine = attempt.current + 1
    attempt.current = mine
    setNotice(null)
    turnsRef.current = []
    setTurns([])
    setPhase('starting')
    // An unanswered microphone prompt never settles: stop waiting after 25 seconds.
    const giveUp = setTimeout(() => {
      if (attempt.current === mine) abandonStart(`Le micro n’a pas été autorisé. Autorisez-le dans la barre d’adresse, ou passez par l’onglet Téléphone ou Simulation.`)
    }, 25_000)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // The permission is what matters; the SDK opens its own stream.
      stream.getTracks().forEach(track => track.stop())
      if (attempt.current !== mine) return
      const response = await fetch(`/api/elevenlabs/signed-url${kind === 'invoice' ? '?agent=relance' : ''}`, { cache: 'no-store' })
      const data = (await response.json()) as { signedUrl?: string; error?: string }
      if (!response.ok || data.signedUrl === undefined) throw new Error(data.error ?? `Erreur ${response.status}`)
      if (attempt.current !== mine) return
      conversation.startSession({ signedUrl: data.signedUrl, connectionType: 'websocket', dynamicVariables })
    } catch (error) {
      if (attempt.current !== mine) return
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'NotFoundError')
      setNotice({
        tone: 'error',
        text: denied
          ? 'Micro refusé ou introuvable. Autorisez-le dans la barre d’adresse, ou passez par l’onglet Téléphone ou Simulation.'
          : error instanceof Error ? error.message : 'Impossible de démarrer la conversation',
      })
      setPhase('idle')
    } finally {
      clearTimeout(giveUp)
    }
  }

  function selectMode(next: Mode) {
    if (phase === 'starting') abandonStart()
    setMode(next)
  }

  async function closeCall(outcome: string) {
    setPhase('saving')
    const amount = Number(promiseAmount.replace(',', '.'))
    const result = await postJson(`${base}/calls`, {
      action: 'close',
      callId: callId.current,
      conversationId: conversationId.current,
      outcome,
      transcript: turnsRef.current,
      ...(kind === 'invoice' && outcome === 'promesse' ? { promiseDate, promiseAmountEur: Number.isFinite(amount) && amount > 0 ? amount : undefined } : {}),
    })
    if (!result.ok) setNotice({ tone: 'error', text: result.error ?? 'Enregistrement impossible' })
    callId.current = undefined
    conversationId.current = undefined
    setPhase('idle')
    router.refresh()
  }

  async function startPhoneCall() {
    setBusy('phone')
    setNotice(null)
    try {
      const result = await postJson(`${base}/call`, { toNumber: toNumber.replace(/[\s.-]/g, '') })
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error ?? 'Appel refusé' })
        return
      }
      const call = (result.data as { call?: { id: string; conversationId?: string } } | undefined)?.call
      setNotice({ tone: 'info', text: `${AGENT_NAME} appelle le ${formatPhone(toNumber)}. L’issue s’affiche ici à la fin de l’appel.` })
      router.refresh()
      if (call?.conversationId !== undefined) {
        setWatching(true)
        const analyzed = await analyze(call.conversationId, call.id, 40, 6000)
        if (!alive.current) return
        setWatching(false)
        setNotice(analyzed
          ? { tone: 'ok', text: `Appel terminé et analysé par ${AGENT_NAME} : la fiche est à jour.` }
          : { tone: 'info', text: 'L’appel n’est pas encore analysé ; l’issue arrivera par le webhook post-appel.' })
        router.refresh()
      }
    } finally {
      setBusy(null)
    }
  }

  async function simulate(outcome: string) {
    setBusy(`sim-${outcome}`)
    setNotice(null)
    try {
      const result = await postJson(`${base}/simulate`, { outcome })
      if (!result.ok) setNotice({ tone: 'error', text: result.error ?? 'Simulation impossible' })
      else router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const live = phase === 'live'
  const connecting = phase === 'starting' || conversation.status === 'connecting'
  // Only a call in progress pins the console to its tab.
  const locked = live || phase === 'saving'

  return (
    <div className="card card-blue p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label">Console vocale</p>
          <h2 className="font-display mt-1.5 text-[22px] leading-tight">{title}</h2>
        </div>
        {live
          ? <span className="pill pill-hot"><span className="animate-blink">En ligne</span></span>
          : connecting
            ? <span className="pill pill-warn">Connexion</span>
            : phase === 'analyzing'
              ? <span className="pill pill-neutral">Analyse</span>
              : phase === 'qualify' || phase === 'saving'
                ? <span className="pill pill-warn">À qualifier</span>
                : <span className="pill pill-ok">Prête</span>}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-1 rounded-lg border border-line bg-sunk p-1" role="tablist" aria-label="Mode d’appel">
        {MODES.map(option => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={mode === option.id}
            disabled={locked}
            onClick={() => selectMode(option.id)}
            className={`rounded-md px-2 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${mode === option.id ? 'bg-blue text-ink' : 'text-ink-2 hover:bg-sunk hover:text-ink'}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === 'navigateur' && (
        <section className="mt-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label={live ? 'Raccrocher' : `Parler à ${AGENT_NAME}`}
              disabled={(!browserReady && !live) || connecting || phase === 'analyzing' || phase === 'qualify' || phase === 'saving'}
              onClick={live ? () => conversation.endSession() : startBrowserCall}
              className={`grid h-[68px] w-[68px] shrink-0 place-items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${live ? 'animate-ring border-fuchsia/60 bg-fuchsia/15 text-fuchsia' : 'border-blue-2/60 bg-blue text-ink shadow-[0_0_40px_-6px_rgba(22,52,239,0.9)] hover:bg-blue-2'}`}
            >
              {live
                ? <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                : <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}
            </button>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink">
                {live ? `${AGENT_NAME} est en ligne` : connecting ? 'Connexion…' : phase === 'analyzing' ? `${AGENT_NAME} rédige son compte rendu…` : `Parler à ${AGENT_NAME}`}
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted">{roleHint}</p>
            </div>
          </div>
          {!browserReady && <p className="mt-3 font-mono text-[11px] leading-relaxed text-ochre">Agent non configuré : voir la page {AGENT_NAME}.</p>}

          {(live || turns.length > 0) && (
            <div className="mt-4 rounded-lg border border-line bg-sunk p-3">
              <div className="flex items-center justify-between">
                <span className="label">Transcription en direct</span>
                {live && conversation.isSpeaking && <span className="bars text-blue" aria-label={`${AGENT_NAME} parle`}><span /><span /><span /><span /><span /></span>}
              </div>
              <ol ref={transcriptRef} className="mt-2 max-h-60 space-y-2 overflow-auto">
                {turns.map((turn, index) => (
                  <li key={index} className="grid grid-cols-[52px_1fr] gap-2 text-[13px] leading-snug">
                    <span className={`pt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${turn.role === 'agent' ? 'text-blue' : 'text-faint'}`}>{turn.role === 'agent' ? AGENT_NAME : userName}</span>
                    <p className={turn.role === 'user' ? 'text-muted' : 'text-ink-2'}>{turn.text}</p>
                  </li>
                ))}
                {turns.length === 0 && <li className="text-[13px] text-faint">En attente du premier message…</li>}
              </ol>
            </div>
          )}

          {(phase === 'qualify' || phase === 'saving') && (
            <div className="mt-4 rounded-lg border border-ochre/40 bg-ochre/5 p-3">
              <p className="label text-ochre">Issue de l’appel</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">L’analyse automatique n’est pas revenue. Choisissez l’issue :</p>
              {kind === 'invoice' && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label>
                    <span className="label">Date promise</span>
                    <input id={`promise-date-${id}`} type="date" className="field mt-1" value={promiseDate} onChange={event => setPromiseDate(event.target.value)} />
                  </label>
                  <label>
                    <span className="label">Montant (€)</span>
                    <input id={`promise-amount-${id}`} inputMode="decimal" className="field tabular mt-1" value={promiseAmount} onChange={event => setPromiseAmount(event.target.value)} />
                  </label>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {OUTCOMES[kind].map(option => (
                  <button key={option.value} type="button" className="btn btn-sm" disabled={phase === 'saving'} onClick={() => closeCall(option.value)}>{option.label}</button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {mode === 'telephone' && (
        <section className="mt-5">
          <p className="text-[13px] leading-relaxed text-muted">{AGENT_NAME} compose le numéro depuis votre ligne. Mettez votre propre numéro pour recevoir l’appel et l’entendre.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-[180px] flex-1">
              <span className="label">Numéro à appeler</span>
              <input id={`to-number-${id}`} className="field tabular mt-1 font-mono text-[13px]" value={toNumber} onChange={event => setToNumber(event.target.value)} placeholder="+33612345678" />
            </label>
            <button type="button" className="btn btn-primary" disabled={!phoneReady || busy === 'phone' || watching} onClick={startPhoneCall}>
              {busy === 'phone' && !watching ? 'Lancement…' : watching ? 'Appel en cours…' : 'Lancer l’appel'}
            </button>
          </div>
          {!phoneReady && <p className="mt-3 font-mono text-[11px] leading-relaxed text-ochre">Aucun numéro d’appel configuré : voir la page {AGENT_NAME}.</p>}
        </section>
      )}

      {mode === 'simulation' && (
        <section className="mt-5">
          <p className="text-[13px] leading-relaxed text-muted">Rejoue un appel terminé, avec sa transcription, sans consommer de minutes.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SIMULATIONS[kind].map(option => (
              <button key={option.value} type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => simulate(option.value)}>{option.label}</button>
            ))}
          </div>
        </section>
      )}

      {notice !== null && (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-[13px] leading-relaxed ${notice.tone === 'ok' ? 'border-emerald/30 bg-emerald/10 text-emerald' : notice.tone === 'error' ? 'border-fuchsia/30 bg-fuchsia/10 text-fuchsia' : 'border-line bg-sunk text-ink-2'}`}>{notice.text}</p>
      )}
    </div>
  )
}
