'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { InvoiceStatus } from '@/core/types'

async function patch(id: string, body: unknown): Promise<string | null> {
  const response = await fetch(`/api/invoices/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (response.ok) return null
  const data = (await response.json().catch(() => undefined)) as { error?: string } | undefined
  return data?.error ?? `Erreur ${response.status}`
}

/** Decisions the client's team keeps: cash received, take the invoice over, hand it back to Léa. */
export function InvoiceDecisions({ invoiceId, status }: { invoiceId: string; status: InvoiceStatus }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: 'paid' | 'takeover' | 'resume') {
    setBusy(action)
    setError(await patch(invoiceId, { action }))
    setBusy(null)
    router.refresh()
  }

  if (status === 'encaissee') return <p className="text-[13.5px] font-semibold text-emerald">Facture réglée : plus aucune relance.</p>
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm btn-success" disabled={busy !== null} onClick={() => run('paid')}>{busy === 'paid' ? 'Enregistrement…' : 'Règlement reçu'}</button>
        {status === 'a_vous' || status === 'litige'
          ? <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => run('resume')}>Rendre à Léa</button>
          : <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => run('takeover')}>Reprendre la main</button>}
      </div>
      {error !== null && <p className="mt-2 text-[12.5px] text-fuchsia">{error}</p>}
    </div>
  )
}

/** Settle one promise by hand, until bank reconciliation does it. */
export function PromiseButtons({ invoiceId, promiseId }: { invoiceId: string; promiseId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function set(status: 'tenue' | 'rompue') {
    setBusy(true)
    await patch(invoiceId, { action: 'promise', promiseId, status })
    setBusy(false)
    router.refresh()
  }

  return (
    <span className="inline-flex gap-1.5">
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => set('tenue')}>Virement reçu</button>
      <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => set('rompue')}>Non tenue</button>
    </span>
  )
}

/** Run the invoice's next action now instead of waiting for its date. */
export function RunNextAction({ invoiceId, label }: { invoiceId: string; label: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(await patch(invoiceId, { action: 'advance' }))
    setBusy(false)
    router.refresh()
  }

  return (
    <div>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={run}>{busy ? 'En cours…' : label}</button>
      {error !== null && <p className="mt-2 text-[12.5px] text-fuchsia">{error}</p>}
    </div>
  )
}
