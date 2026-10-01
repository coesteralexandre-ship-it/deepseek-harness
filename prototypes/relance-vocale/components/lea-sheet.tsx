'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { VoiceConsole } from '@/components/voice-console'
import { AGENT_NAME } from '@/core/agent-prompt'

/** Props the console route returns for one invoice. */
interface ConsoleProps {
  id: string
  title: string
  roleHint: string
  userName: string
  phone: string
  browserReady: boolean
  phoneReady: boolean
  dynamicVariables: Record<string, string>
  defaultAmountEur: number
}

/**
 * Side panel of the board: the voice console of one invoice, with the board still in view,
 * so the card is seen changing column when the call closes.
 */
/**
 * @param boardNow - the board's workspace clock: when it moves (+1 jour, reset), the console reloads the date Léa reasons from.
 */
export function LeaSheet({ invoiceId, company, boardNow, onClose, onChange, onBusyChange }: { invoiceId: string; company: string; boardNow: number; onClose: () => void; onChange: () => void; onBusyChange: (busy: boolean) => void }) {
  const [props, setProps] = useState<ConsoleProps | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** A call is starting, live or being saved: the panel stays open until it ends. */
  const [busy, setBusy] = useState(false)
  /** Bumped after each change, so the next call starts with what Léa just learned. */
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    setProps(null)
  }, [invoiceId])

  useEffect(() => {
    let current = true
    setError(null)
    fetch(`/api/invoices/${invoiceId}/console`, { cache: 'no-store' })
      .then(async response => {
        const data = (await response.json()) as ConsoleProps & { error?: string }
        if (!current) return
        if (!response.ok) setError(data.error ?? `Erreur ${response.status}`)
        else setProps(data)
      })
      .catch(() => {
        if (current) setError('Console indisponible')
      })
    return () => {
      current = false
    }
  }, [invoiceId, revision, boardNow])

  useEffect(() => {
    onBusyChange(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[440px] flex-col border-l border-line bg-canvas shadow-[-24px_0_60px_-30px_rgba(2,13,35,0.45)] animate-slide" role="dialog" aria-label={`Parler à ${AGENT_NAME} : ${company}`}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="label">Relance en direct</p>
          <p className="font-display mt-1 truncate text-[20px] leading-tight">{company}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {busy
            ? <span className="btn btn-sm btn-ghost pointer-events-none opacity-40" aria-disabled="true">Fiche</span>
            : <Link href={`/factures/${invoiceId}`} className="btn btn-sm btn-ghost">Fiche</Link>}
          <button type="button" className="btn btn-sm" onClick={onClose} disabled={busy} title={busy ? 'Raccrochez d’abord' : undefined} aria-label="Fermer">✕</button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        {error !== null && <p className="rounded-lg border border-fuchsia/30 bg-fuchsia/10 px-3 py-2 text-[13px] text-fuchsia">{error}</p>}
        {props === null && error === null && <div className="h-[280px] animate-pulse rounded-lg bg-sunk" />}
        {props !== null && (
          <VoiceConsole
            key={props.id}
            kind="invoice"
            {...props}
            onChange={() => {
              onChange()
              setRevision(value => value + 1)
            }}
            onBusyChange={setBusy}
          />
        )}
        <p className="mt-4 text-[12px] leading-relaxed text-muted">Le tableau reste visible derrière : la réponse s’inscrit sur la carte pendant l’appel, et la carte change de colonne quand vous raccrochez.</p>
      </div>
    </aside>
  )
}
