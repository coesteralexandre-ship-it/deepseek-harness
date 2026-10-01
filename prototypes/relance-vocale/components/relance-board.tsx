'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import { ActorBadge, actorLabel } from '@/components/actor-badge'
import { CountUp } from '@/components/count-up'
import { LeaSheet } from '@/components/lea-sheet'
import { AGENT_NAME } from '@/core/agent-prompt'
import type { BoardView, CardView, ColumnView } from '@/core/board-view'
import type { NextActionKind } from '@/core/receivables'
import type { Tone } from '@/core/stages'
import type { InvoiceStatus } from '@/core/types'

const BAND: Record<Tone, string> = {
  neutral: 'var(--color-cobalt-vivid)',
  action: 'var(--color-blue)',
  amethyst: 'var(--color-amethyst-vivid)',
  turquoise: 'var(--color-turquoise-vivid)',
  warn: 'var(--color-ochre-vivid)',
  hot: 'var(--color-fuchsia-vivid)',
  sienna: 'var(--color-sienna-vivid)',
  ok: 'var(--color-emerald-vivid)',
  mute: 'var(--color-faint)',
}

const WASH: Record<Tone, string> = {
  neutral: '#eef5ff',
  action: 'var(--color-blue-mist)',
  amethyst: '#f8f0ff',
  turquoise: '#eefafd',
  warn: '#fdf8e4',
  hot: '#fff1f8',
  sienna: '#fef5ea',
  ok: '#f5fbea',
  mute: 'var(--color-sunk)',
}

const ACTION_ICON: Record<NextActionKind, string> = {
  email: 'M4 6h16v12H4zM4 7l8 6 8-6',
  appel: 'M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z',
  verification: 'M5 12l4 4L19 7',
  humain: 'M16 11a4 4 0 1 0-8 0M4 20a8 8 0 0 1 16 0',
}

const ACTION_COLOR: Record<NextActionKind, string> = {
  email: 'text-amethyst',
  appel: 'text-turquoise',
  verification: 'text-ochre',
  humain: 'text-sienna',
}

const AGENDA_DOT: Record<NextActionKind, string> = {
  email: 'bg-amethyst-vivid',
  appel: 'bg-turquoise-vivid',
  verification: 'bg-ochre-vivid',
  humain: 'bg-sienna-vivid',
}

const euro = (value: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(value))
const keur = (value: number) => (value >= 10_000 ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value / 1000)} k€` : euro(value))
const whole = (value: number) => String(Math.round(value))

async function send(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<unknown> {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data: unknown = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : `Erreur ${response.status}`)
  return data
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function RelanceBoard({ initial, resetAllowed = false }: { initial: BoardView; resetAllowed?: boolean }) {
  const router = useRouter()
  const [view, setView] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState<InvoiceStatus | null>(null)
  const [changed, setChanged] = useState<Set<string>>(new Set())
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  /** Invoice whose voice console is open in the side panel. */
  const [talking, setTalking] = useState<{ id: string; company: string } | null>(null)
  /** A call is in progress in the side panel: no other card may open it. */
  const [onCall, setOnCall] = useState(false)
  const stop = useRef(false)
  const nodes = useRef(new Map<string, HTMLElement>())
  const rects = useRef(new Map<string, DOMRect>())

  useEffect(() => setView(initial), [initial])

  // A call starting in the side panel stops a running replay: the autopilot must not move the invoice under Léa.
  useEffect(() => {
    if (onCall) stop.current = true
  }, [onCall])

  // FLIP: every card glides from where it was to where it lands.
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>()
    for (const [id, node] of nodes.current) {
      const rect = node.getBoundingClientRect()
      next.set(id, rect)
      const before = rects.current.get(id)
      if (before === undefined) continue
      const dx = before.left - rect.left
      const dy = before.top - rect.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      node.animate([{ transform: `translate(${dx}px, ${dy}px)`, zIndex: 20 }, { transform: 'translate(0, 0)', zIndex: 20 }], { duration: 700, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
    }
    rects.current = next
  }, [view])

  function apply(next: BoardView) {
    setView(previous => {
      const before = new Map(previous.cards.map(card => [card.id, card.updatedAt]))
      setChanged(new Set(next.cards.filter(card => before.get(card.id) !== card.updatedAt).map(card => card.id)))
      const seen = new Set(previous.feed.map(item => item.id))
      setFresh(new Set(next.feed.filter(item => !seen.has(item.id)).map(item => item.id)))
      return next
    })
  }

  async function run(key: string, task: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await task()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Action impossible')
    } finally {
      setBusy(null)
    }
  }

  const advance = (days: number) => run(`advance-${days}`, async () => apply((await send('/api/autopilot', 'POST', { action: 'advance', days })) as BoardView))
  const setMode = (autopilot: 'demo' | 'reel') => run('mode', async () => apply((await send('/api/autopilot', 'POST', { action: 'mode', autopilot })) as BoardView))
  const reset = () => run('reset', async () => {
    if (!window.confirm('Tout remettre à zéro ? Prospects, factures, appels et promesses seront remplacés par le jeu de départ.')) return
    await send('/api/reset', 'POST', {})
    apply((await (await fetch('/api/autopilot', { cache: 'no-store' })).json()) as BoardView)
  })

  async function replay() {
    if (playing) {
      stop.current = true
      return
    }
    stop.current = false
    setPlaying(true)
    setError(null)
    try {
      for (let day = 0; day < 14 && !stop.current; day += 1) {
        apply((await send('/api/autopilot', 'POST', { action: 'advance', days: 1 })) as BoardView)
        await sleep(1300)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Relecture interrompue')
    } finally {
      setPlaying(false)
    }
  }

  async function onDrop(event: DragEvent<HTMLDivElement>, status: InvoiceStatus) {
    event.preventDefault()
    setOver(null)
    const id = event.dataTransfer.getData('text/plain')
    const card = view.cards.find(entry => entry.id === id)
    if (card === undefined || card.status === status) return
    setView(current => ({ ...current, cards: current.cards.map(entry => (entry.id === id ? { ...entry, status } : entry)) }))
    await run('move', async () => {
      await send(`/api/invoices/${id}`, 'PATCH', { action: 'move', status })
      apply((await (await fetch('/api/autopilot', { cache: 'no-store' })).json()) as BoardView)
    })
  }

  /** Pull the board after the console changed an invoice, so the card flashes and glides. */
  const pull = async () => {
    try {
      const response = await fetch('/api/autopilot', { cache: 'no-store' })
      if (!response.ok) throw new Error(`Erreur ${response.status}`)
      apply((await response.json()) as BoardView)
    } catch {
      // Fall back to a server render: the board is up to date, only the flash is lost.
      router.refresh()
    }
  }

  const { kpis } = view
  // The clock and the reset wait while a call runs in the side panel: they would move the invoice under Léa.
  const locked = busy !== null || playing || onCall

  return (
    <div className="space-y-6">
      {/* Cockpit: the clock, the autopilot, and what the week holds. */}
      <section className="card grid gap-5 p-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] xl:items-center">
        <div className="flex items-center gap-4">
          <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${playing ? 'animate-ring bg-blue text-white' : 'bg-blue-mist text-blue'}`}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          </div>
          <div className="min-w-0">
            <p className="label">Horloge de l’espace{view.offsetDays > 0 ? ` · J+${view.offsetDays}` : ''}</p>
            <p className="font-display mt-1 text-[24px] leading-none">{view.nowLabel.charAt(0).toUpperCase()}{view.nowLabel.slice(1)}</p>
            <p className="mt-1.5 text-[13px] text-muted">{view.mode === 'demo' ? 'Démo : Léa appelle, les emails partent et les clients répondent selon leur profil.' : `Réel : Léa prépare, rien ne part sans vous. ${view.waiting} action${view.waiting > 1 ? 's' : ''} attend${view.waiting > 1 ? 'ent' : ''} votre feu vert.`}</p>
          </div>
        </div>

        <div className="flex items-end gap-2" role="img" aria-label="Actions prévues sur sept jours">
          {view.agenda.map((day, index) => {
            const total = day.counts.email + day.counts.appel + day.counts.verification + day.counts.humain
            return (
              <div key={day.day} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-[54px] w-full flex-col-reverse items-center gap-[3px] rounded-md bg-sunk p-1.5">
                  {(['email', 'appel', 'verification', 'humain'] as const).flatMap(kind => Array.from({ length: day.counts[kind] }, (_, n) => (
                    <span key={`${kind}-${n}`} className={`h-[5px] w-full rounded-full ${AGENDA_DOT[kind]}`} />
                  )))}
                </div>
                <span className={`text-[11px] font-semibold capitalize ${index === 0 ? 'text-blue' : 'text-muted'}`}>{day.label}</span>
                <span className="tabular text-[10.5px] text-faint">{total}</span>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <div className="flex border border-ink" role="radiogroup" aria-label="Mode de l’autopilote">
            {(['demo', 'reel'] as const).map(mode => (
              <button key={mode} type="button" role="radio" aria-checked={view.mode === mode} disabled={locked} onClick={() => setMode(mode)} className={`px-3 py-2 text-[12.5px] font-semibold ${view.mode === mode ? 'bg-ink text-white' : 'bg-card text-ink hover:bg-sunk'}`}>
                {mode === 'demo' ? 'Démo' : 'Réel'}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-sm" disabled={locked} onClick={() => advance(1)}>+1 jour</button>
          <button type="button" className={`btn btn-sm ${playing ? 'btn-ink' : 'btn-primary'}`} disabled={(busy !== null && !playing) || onCall} onClick={replay}>
            {playing ? '❚❚ Pause' : '▶ Rejouer 14 jours'}
          </button>
          {resetAllowed && <button type="button" className="btn btn-sm btn-ghost" disabled={locked} onClick={reset}>Remettre à zéro</button>}
        </div>
      </section>

      {error !== null && <p className="border-l-2 border-fuchsia bg-fuchsia-soft/40 px-3 py-2 text-[13px] text-fuchsia">{error}</p>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi band="var(--color-blue)" label="Encours échu" value={<CountUp value={kpis.overdueEur} format={keur} />} note={`${kpis.overdueCount} factures · ${view.upcoming.count} à échoir sous 14 j`} />
        <Kpi band="var(--color-ochre-vivid)" label="Promis cette semaine" value={<CountUp value={kpis.promisedThisWeekEur} format={keur} />} note={`dont ${keur(kpis.receivedThisWeekEur)} reçus`} />
        <Kpi band="var(--color-emerald-vivid)" label="Encaissé" value={<CountUp value={kpis.collectedEur} format={keur} />} note="depuis le début de la séquence" />
        <Kpi band="var(--color-turquoise-vivid)" label="Promesses tenues" value={kpis.keptRate === undefined ? '—' : <CountUp value={kpis.keptRate * 100} format={value => `${Math.round(value)} %`} />} note="parmi les dates échues" />
        <Kpi band="var(--color-amethyst-vivid)" label="Actions de Léa, 7 j" value={<CountUp value={kpis.leaActions7d} format={whole} />} note={`${kpis.waitingOnYou} dossier${kpis.waitingOnYou > 1 ? 's' : ''} à reprendre par vous`} />
      </section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="min-w-0 overflow-x-auto pb-3">
          <div className="grid min-w-[1520px] grid-cols-7 gap-3">
            {view.columns.map(column => (
              <Column
                key={column.status}
                column={column}
                cards={view.cards.filter(card => card.status === column.status)}
                over={over === column.status}
                changed={changed}
                nodes={nodes.current}
                onOver={() => setOver(column.status)}
                onLeave={() => setOver(current => (current === column.status ? null : current))}
                onDrop={event => onDrop(event, column.status)}
                talking={talking?.id}
                locked={onCall || playing || busy !== null}
                onTalk={card => setTalking({ id: card.id, company: card.company })}
              />
            ))}
          </div>
        </section>

        <aside className="card flex max-h-[860px] flex-col self-start overflow-hidden 2xl:sticky 2xl:top-6">
          <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
            <p className="flex items-center gap-2 text-[14px] font-bold text-ink">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-vivid opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-vivid" />
              </span>
              En direct
            </p>
            <Link href="/journal" className="text-[12.5px] font-semibold text-blue hover:underline">Tout le journal →</Link>
          </div>
          <ol className="flex-1 divide-y divide-line overflow-y-auto">
            {view.feed.map(item => (
              <li key={item.id} className={`flex gap-3 px-4 py-3 ${fresh.has(item.id) ? 'animate-slide bg-blue-mist/70' : ''}`}>
                <ActorBadge actor={item.actor} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug text-ink">{item.title}</p>
                  <p className="mt-0.5 truncate text-[12px] text-muted">
                    <Link href={`/factures/${item.invoiceId}`} className="font-medium text-ink-2 hover:text-blue">{item.company}</Link>
                    {' · '}{actorLabel(item.actor)} · {item.ago}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      {talking !== null && (
        <LeaSheet
          invoiceId={talking.id}
          company={talking.company}
          boardNow={view.now}
          onClose={() => {
            setTalking(null)
            setOnCall(false)
          }}
          onChange={() => void pull()}
          onBusyChange={setOnCall}
        />
      )}
    </div>
  )
}

function Kpi({ band, label, value, note }: { band: string; label: string; value: React.ReactNode; note: string }) {
  return (
    <div className="card p-4" style={{ boxShadow: `inset 0 3px 0 ${band}, 0 1px 2px rgba(2,13,35,.05)` }}>
      <p className="label">{label}</p>
      <p className="font-display tabular mt-2 text-[28px] leading-none">{value}</p>
      <p className="mt-2 text-[12.5px] text-muted">{note}</p>
    </div>
  )
}

interface ColumnProps {
  column: ColumnView
  cards: CardView[]
  over: boolean
  changed: Set<string>
  nodes: Map<string, HTMLElement>
  onOver: () => void
  onLeave: () => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  /** Invoice whose console is open. */
  talking?: string
  /** A call is in progress: the other cards' mic buttons are off. */
  locked: boolean
  onTalk: (card: CardView) => void
}

function Column({ column, cards, over, changed, nodes, onOver, onLeave, onDrop, talking, locked, onTalk }: ColumnProps) {
  return (
    <div
      className={`flex min-h-[560px] flex-col rounded-lg border border-line transition-colors ${over ? 'column-over' : ''}`}
      style={{ background: over ? undefined : WASH[column.tone] }}
      onDragOver={event => {
        event.preventDefault()
        onOver()
      }}
      onDragLeave={onLeave}
      onDrop={onDrop}
    >
      <header className="rounded-t-lg border-b border-line/80 bg-card/70 px-3 pb-2.5 pt-3" style={{ boxShadow: `inset 0 3px 0 ${BAND[column.tone]}` }} title={column.hint}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold text-ink">{column.label}</h2>
          <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1.5 text-[11px] font-bold text-white">{column.count}</span>
        </div>
        <p className="tabular mt-1 text-[12px] font-medium text-muted">{column.totalEur === 0 ? '—' : euro(column.totalEur)}</p>
      </header>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {cards.map(card => (
          <div
            key={card.id}
            ref={node => {
              if (node === null) nodes.delete(card.id)
              else nodes.set(card.id, node)
            }}
            draggable
            className="card-drag"
            onDragStart={event => {
              event.dataTransfer.setData('text/plain', card.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            <Card card={card} flash={changed.has(card.id)} tone={column.tone} active={talking === card.id} locked={locked && talking !== card.id} navLocked={locked} onTalk={() => onTalk(card)} />
          </div>
        ))}
        {cards.length === 0 && <div className="grid flex-1 place-items-center rounded-md border border-dashed border-line-2 text-[11.5px] font-medium text-faint">Déposer ici</div>}
      </div>
    </div>
  )
}

function Card({ card, flash, tone, active, locked, navLocked, onTalk }: { card: CardView; flash: boolean; tone: Tone; active: boolean; locked: boolean; navLocked: boolean; onTalk: () => void }) {
  return (
    <div className={`card block p-3 transition-[border-color,transform,box-shadow] hover:-translate-y-px hover:border-blue ${flash ? 'animate-flash' : ''} ${active ? 'border-blue shadow-[0_0_0_3px_var(--color-blue-mist)]' : ''}`}>
      {/* Leaving the board during a call would cut it before Léa's answer is saved. */}
      <Link
        href={`/factures/${card.id}`}
        className="block"
        aria-disabled={navLocked || undefined}
        onClick={event => {
          if (navLocked) event.preventDefault()
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-[13.5px] font-bold leading-tight text-ink">{card.company}</p>
          <p className="tabular shrink-0 text-[13.5px] font-bold text-ink">{euro(card.amountEur)}</p>
        </div>
        <p className="tabular mt-1 font-mono text-[10.5px] text-muted">
          {card.number} · {card.status === 'encaissee' ? `réglée le ${card.paidDay ?? '—'}` : `${card.daysLate} j de retard`}
        </p>

        {card.status === 'litige'
          ? <p className="mt-2 line-clamp-2 rounded-sm bg-fuchsia-soft/60 px-2 py-1.5 text-[11.5px] leading-snug text-fuchsia">{card.knows}</p>
          : <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-ink-2">{card.knows}</p>}
        {card.quote !== undefined && card.status !== 'litige' && (
          <p className="mt-1.5 line-clamp-2 border-l-2 border-line-2 pl-2 text-[11.5px] italic leading-snug text-muted">« {card.quote} »</p>
        )}

        {(card.promise !== undefined || card.drafts > 0 || card.broken > 0) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {card.promise !== undefined && card.status === 'promesse' && (
              <span className="pill pill-warn !py-1 !text-[10.5px]">{card.promise.day}{card.promise.confirmed ? ' · confirmée' : ''}</span>
            )}
            {card.drafts > 0 && <span className="pill pill-amethyst !py-1 !text-[10.5px]">{card.drafts} brouillon{card.drafts > 1 ? 's' : ''}</span>}
            {card.broken > 0 && card.status !== 'encaissee' && <span className="pill pill-hot !py-1 !text-[10.5px]">{card.broken} rompue{card.broken > 1 ? 's' : ''}</span>}
          </div>
        )}
      </Link>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2">
        {card.next !== undefined
          ? (
            <span className={`flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold ${card.next.due ? 'text-blue' : ACTION_COLOR[card.next.kind]}`}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ACTION_ICON[card.next.kind]} /></svg>
              <span className="truncate">{card.next.due ? 'À lancer' : card.next.when}</span>
            </span>
          )
          : <span className="text-[11.5px] font-semibold" style={{ color: BAND[tone] }}>{card.status === 'encaissee' ? '✓ Clos' : card.status === 'litige' ? 'Pièce à envoyer' : 'À votre équipe'}</span>}
        <span className="flex shrink-0 items-center gap-1.5">
          {card.status !== 'encaissee' && (
            <button
              type="button"
              onClick={onTalk}
              disabled={locked}
              draggable={false}
              title={`Parler à ${AGENT_NAME} : vous jouez ${card.contact}`}
              aria-label={`Parler à ${AGENT_NAME} au sujet de ${card.company}`}
              className={`grid h-6 w-6 place-items-center rounded-full border transition-colors ${active ? 'animate-ring border-blue bg-blue text-white' : 'border-line-2 bg-card text-blue hover:border-blue hover:bg-blue hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card disabled:hover:text-blue'}`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            </button>
          )}
          {card.lastActor !== undefined && <ActorBadge actor={card.lastActor} size="sm" />}
        </span>
      </div>
      <div className="mt-2 flex gap-[3px]" aria-label={`Séquence : ${card.progress} étapes sur 6`}>
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} className={`h-[3px] flex-1 rounded-full ${index < card.progress ? 'bg-ink' : 'bg-line'}`} />
        ))}
      </div>
    </div>
  )
}
