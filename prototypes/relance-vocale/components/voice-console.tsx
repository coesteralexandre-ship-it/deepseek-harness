'use client'

import { ConversationProvider, useConversation, useConversationClientTool } from '@elevenlabs/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AGENT_NAME } from '@/core/agent-prompt'
import { ANSWER_TOOL_NAME } from '@/core/answer'
import { formatPhone } from '@/core/format'
import type { DebtorAnswer, TranscriptTurn } from '@/core/types'

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
  /** Called whenever the call changed the record (answer noted, call closed), for a board that shows it live. */
  onChange?: () => void
  /** Told when a call starts or ends, so a side panel does not close in the middle of one. */
  onBusyChange?: (busy: boolean) => void
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
    { value: 'deja_regle', label: 'Déjà réglé' },
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
    { value: 'deja_regle', label: 'Déjà réglé' },
    { value: 'litige', label: 'Litige' },
    { value: 'renvoi', label: 'Facture non reçue' },
    { value: 'sans_suite', label: 'Répondeur' },
  ],
}

/** POST JSON; a network failure comes back as `ok: false` like an HTTP error, never as a rejection. */
async function postJson(url: string, body: unknown, keepalive = false): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  let response: Response
  try {
    response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive })
  } catch {
    return { ok: false, error: 'Réseau indisponible : la requête n’est pas partie.' }
  }
  const data: unknown = await response.json().catch(() => undefined)
  if (response.ok) return { ok: true, data }
  const error = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : `Erreur ${response.status}`
  return { ok: false, error }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Column change a closed call caused, as the server reports it. */
interface Move {
  from: string
  to: string
  knows: string
}

const ANSWER_LABEL: Record<DebtorAnswer['outcome'], string> = {
  promesse: 'Promesse',
  deja_regle: 'Déjà réglé',
  litige: 'Litige',
  renvoi: 'À renvoyer',
  rappel: 'Rappel',
  sans_suite: 'Sans suite',
}

const ANSWER_TONE: Record<DebtorAnswer['outcome'], string> = {
  promesse: 'pill-ok',
  deja_regle: 'pill-turquoise',
  litige: 'pill-hot',
  renvoi: 'pill-neutral',
  rappel: 'pill-warn',
  sans_suite: 'pill-mute',
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

function Console({ kind, id, title, roleHint, userName, phone, browserReady, phoneReady, dynamicVariables, defaultAmountEur, onChange, onBusyChange }: Props) {
  const router = useRouter()
  const changed = useRef(onChange)
  changed.current = onChange
  /** Tell the board when there is one (it pulls its own view, with the card animation); re-render the server page otherwise. */
  const refresh = () => {
    if (changed.current !== undefined) changed.current()
    else router.refresh()
  }
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
  /** Answer Léa noted live through her tool, with its one-line wording; `noting` while the note is being saved. */
  const [captured, setCaptured] = useState<{ answer: DebtorAnswer; line: string } | null>(null)
  const [noting, setNoting] = useState(false)
  const [moved, setMoved] = useState<Move | null>(null)
  const liveRef = useRef<DebtorAnswer | null>(null)
  /** The note request in flight, awaited before a hang-up decides how to close the call. */
  const notePending = useRef<Promise<unknown> | null>(null)
  /** Resolves once the server opened the call record, so a tool call right after connect finds it. */
  const opening = useRef<Promise<void> | null>(null)
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
      // Unmounted in the middle of a call (panel closed, page left): close the record anyway so nothing stays « en cours ».
      const ended = conversationId.current
      if (ended === undefined) return
      const body = liveRef.current !== null
        ? { action: 'close', callId: callId.current, conversationId: ended, transcript: turnsRef.current }
        : { action: 'analyze', callId: callId.current, conversationId: ended }
      void postJson(`${base}/calls`, body, true)
    }
    // `base` is fixed for the life of the console (the panel remounts it per invoice).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Ask the server to read the agent's analysis back; true once the call record is closed with it.
   * `report` shows the column change; a background read after a live close stays silent.
   */
  async function analyze(conversation: string, call: string | undefined, tries: number, delayMs: number, report = true): Promise<boolean> {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      await sleep(delayMs)
      if (!alive.current) return false
      const result = await postJson(`${base}/calls`, { action: 'analyze', conversationId: conversation, callId: call })
      if (!result.ok) return false
      const data = result.data as { pending?: boolean; move?: Move } | undefined
      if (data?.pending !== true) {
        if (report && data?.move !== undefined) setMoved(data.move)
        return true
      }
    }
    return false
  }

  const conversation = useConversation({
    onConnect: ({ conversationId: started }) => {
      conversationId.current = started
      setPhase('live')
      opening.current = (async () => {
        const opened = await postJson(`${base}/calls`, { action: 'open', mode: 'navigateur', conversationId: started })
        if (!opened.ok) {
          setNotice({ tone: 'error', text: `L’appel n’a pas pu être enregistré : ${opened.error ?? 'erreur'}. La fiche sera mise à jour à la fin, par l’analyse.` })
          return
        }
        callId.current = (opened.data as { call?: { id: string } } | undefined)?.call?.id
        refresh()
      })()
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
      await opening.current
      // A note Léa was still saving when the line dropped counts.
      await notePending.current
      if (liveRef.current !== null) {
        await closeWithLiveAnswer()
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
        refresh()
      } else {
        setPhase('qualify')
      }
    },
    onError: message => setNotice({ tone: 'error', text: message }),
  })

  /**
   * Close the call with the answer Léa noted: it decides the column now, the analysis adds the summary later.
   * On failure the ids stay, and the qualify panel offers to retry.
   */
  async function closeWithLiveAnswer() {
    const ended = conversationId.current
    setPhase('saving')
    const closed = await postJson(`${base}/calls`, { action: 'close', callId: callId.current, conversationId: ended, transcript: turnsRef.current })
    if (!alive.current) return
    if (!closed.ok) {
      setNotice({ tone: 'error', text: `La réponse de ${AGENT_NAME} n’a pas pu être enregistrée : ${closed.error ?? 'erreur'}. Réessayez ou choisissez l’issue.` })
      setPhase('qualify')
      return
    }
    const call = callId.current
    callId.current = undefined
    conversationId.current = undefined
    setPhase('idle')
    setMoved((closed.data as { move?: Move } | undefined)?.move ?? null)
    refresh()
    if (ended !== undefined) {
      void analyze(ended, call, 8, 4000, false).then(done => {
        if (done && alive.current) refresh()
      })
    }
  }

  // Léa's `noter_reponse` tool: the debtor's answer lands in the invoice while the call goes on.
  useConversationClientTool(ANSWER_TOOL_NAME, async (parameters: Record<string, unknown>) => {
    if (kind !== 'invoice') return 'Outil indisponible pendant cet appel.'
    setNoting(true)
    const task = (async () => {
      await opening.current
      const noted = await postJson(`${base}/calls`, { action: 'note', callId: callId.current, conversationId: conversationId.current, answer: parameters })
      if (!noted.ok) return `Impossible de noter la réponse : ${noted.error ?? 'erreur'}. Continue l’appel normalement.`
      const data = noted.data as { answer: DebtorAnswer; line: string; message: string }
      liveRef.current = data.answer
      if (alive.current) setCaptured({ answer: data.answer, line: data.line })
      refresh()
      return data.message
    })()
    notePending.current = task
    try {
      return await task
    } finally {
      if (notePending.current === task) notePending.current = null
      if (alive.current) setNoting(false)
    }
  })

  // A side panel must not close while a call is starting, live or being saved.
  // « qualify » counts: the call record stays open until someone gives its outcome.
  const busyNow = phase === 'starting' || phase === 'live' || phase === 'saving' || phase === 'analyzing' || phase === 'qualify' || watching || busy === 'phone'
  const reportBusy = useRef(onBusyChange)
  reportBusy.current = onBusyChange
  useEffect(() => {
    reportBusy.current?.(busyNow)
  }, [busyNow])

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
    liveRef.current = null
    setCaptured(null)
    setMoved(null)
    opening.current = null
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
    else setMoved((result.data as { move?: Move } | undefined)?.move ?? null)
    callId.current = undefined
    conversationId.current = undefined
    setPhase('idle')
    refresh()
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
      refresh()
      if (call?.conversationId !== undefined) {
        setWatching(true)
        const analyzed = await analyze(call.conversationId, call.id, 40, 6000)
        if (!alive.current) return
        setWatching(false)
        setNotice(analyzed
          ? { tone: 'ok', text: `Appel terminé et analysé par ${AGENT_NAME} : la fiche est à jour.` }
          : { tone: 'info', text: 'L’appel n’est pas encore analysé ; l’issue arrivera par le webhook post-appel.' })
        refresh()
      }
    } finally {
      setBusy(null)
    }
  }

  async function simulate(outcome: string) {
    setBusy(`sim-${outcome}`)
    setNotice(null)
    try {
      setMoved(null)
      const result = await postJson(`${base}/simulate`, { outcome })
      if (!result.ok) setNotice({ tone: 'error', text: result.error ?? 'Simulation impossible' })
      else {
        setMoved((result.data as { move?: Move } | undefined)?.move ?? null)
        refresh()
      }
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

          {kind === 'invoice' && (live || noting || captured !== null) && (
            <div className={`mt-4 rounded-lg border p-3 transition-colors ${captured !== null ? 'border-blue/40 bg-blue-mist' : 'border-dashed border-line-2 bg-card'}`} aria-live="polite">
              <div className="flex items-center justify-between gap-2">
                <span className="label">Fiche en direct</span>
                {noting
                  ? <span className="pill pill-action"><span className="animate-blink">{AGENT_NAME} note…</span></span>
                  : captured !== null
                    ? <span className={`pill ${ANSWER_TONE[captured.answer.outcome]}`}>{ANSWER_LABEL[captured.answer.outcome]}</span>
                    : <span className="text-[11.5px] text-faint">En attente de la réponse</span>}
              </div>
              {captured !== null
                ? (
                  <div key={captured.answer.notedAt} className="animate-rise">
                    <p className="font-display mt-2 text-[17px] leading-snug text-ink">{captured.line}</p>
                    {captured.answer.quote !== undefined && <p className="mt-1.5 text-[13px] italic leading-relaxed text-ink-2">« {captured.answer.quote} »</p>}
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
                      {captured.answer.delayReason !== undefined && <><dt className="text-muted">Cause du retard</dt><dd className="text-ink-2">{captured.answer.delayReason}</dd></>}
                      {captured.answer.missingDocument !== undefined && <><dt className="text-muted">Pièce attendue</dt><dd className="text-ink-2">{captured.answer.missingDocument}</dd></>}
                      {captured.answer.rightContact !== undefined && <><dt className="text-muted">Bon interlocuteur</dt><dd className="text-ink-2">{captured.answer.rightContact}</dd></>}
                    </dl>
                    <p className="mt-2 text-[11.5px] text-muted">{live ? 'La carte change de colonne dès que vous raccrochez.' : 'Enregistré dans le CRM.'}</p>
                  </div>
                )
                : <p className="mt-2 text-[12.5px] leading-relaxed text-muted">Dites par exemple « le virement part demain », « elle est déjà payée » ou « le relevé d’heures n’est pas signé » : {AGENT_NAME} le note dans la fiche pendant l’appel.</p>}
            </div>
          )}

          {(phase === 'qualify' || (phase === 'saving' && captured === null)) && (
            <div className="mt-4 rounded-lg border border-ochre/40 bg-ochre/5 p-3">
              <p className="label text-ochre">Issue de l’appel</p>
              {captured !== null && phase === 'qualify' && (
                <button type="button" className="btn btn-sm btn-primary mt-2" onClick={() => void closeWithLiveAnswer()}>Enregistrer la réponse de {AGENT_NAME} : {captured.line}</button>
              )}
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{captured !== null ? 'Ou choisissez l’issue vous-même :' : 'L’analyse automatique n’est pas revenue. Choisissez l’issue :'}</p>
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

      {moved !== null && (
        <div className="mt-4 animate-rise rounded-lg border border-emerald/30 bg-emerald/10 px-3 py-2.5" aria-live="polite">
          <p className="label text-emerald">CRM mis à jour</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink">
            <span>{moved.from}</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-emerald" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            <span>{moved.to}</span>
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{moved.knows}</p>
        </div>
      )}

      {notice !== null && (
        <p className={`mt-4 rounded-lg border px-3 py-2 text-[13px] leading-relaxed ${notice.tone === 'ok' ? 'border-emerald/30 bg-emerald/10 text-emerald' : notice.tone === 'error' ? 'border-fuchsia/30 bg-fuchsia/10 text-fuchsia' : 'border-line bg-sunk text-ink-2'}`}>{notice.text}</p>
      )}
    </div>
  )
}
