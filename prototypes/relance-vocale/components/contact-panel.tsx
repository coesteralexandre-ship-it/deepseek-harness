'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ProspectRecord } from '@/core/types'

const DAY: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }

/**
 * The prospect's record: where the data comes from, whether the information notice went out, and the
 * « ne plus contacter » switch. An opposition blocks calls, letters, campaigns and messages everywhere.
 */
export function ContactPanel({ prospectId, record }: { prospectId: string; record: ProspectRecord }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState<'opposition' | 'lever' | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function send(body: Record<string, string>) {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/prospects/${prospectId}/contact`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) setError(data.error ?? `Erreur ${response.status}`)
      else {
        setAsking(null)
        setReason('')
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  const optOut = record.optOut
  return (
    <div className={`card space-y-3 p-5 ${optOut !== undefined ? 'border-fuchsia/50 bg-fuchsia-soft/30' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="label">Contact et données</p>
        {optOut !== undefined ? <span className="pill pill-hot">Ne plus contacter</span> : <span className="pill pill-ok">Contact autorisé</span>}
      </div>
      {optOut !== undefined && (
        <p className="text-[13px] leading-relaxed text-ink">Opposition reçue le {new Date(optOut.at).toLocaleDateString('fr-FR', DAY)} : {optOut.reason}. Aucun appel, courrier, email ni message ne part vers cette fiche.</p>
      )}
      <dl className="space-y-2 text-[12.5px]">
        <div>
          <dt className="text-muted">Origine des données</dt>
          <dd className="text-ink-2">{record.source} <span className="text-faint">· relevées le {new Date(record.collectedAt).toLocaleDateString('fr-FR', DAY)}</span></dd>
        </div>
        <div>
          <dt className="text-muted">Information sur l’origine (art. 14 RGPD)</dt>
          <dd className="text-ink-2">
            {record.noticeSentAt !== undefined
              ? `Envoyée le ${new Date(record.noticeSentAt).toLocaleDateString('fr-FR', DAY)}, avec le premier courrier.`
              : <>Pas encore envoyée. La lettre la contient : <button type="button" className="font-semibold text-blue hover:underline" disabled={busy} onClick={() => void send({ action: 'notice' })}>marquer envoyée</button></>}
          </dd>
        </div>
      </dl>
      {asking === null
        ? (
          <div className="flex flex-wrap gap-2">
            {optOut === undefined
              ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setAsking('opposition')}>Ne plus contacter</button>
              : <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setAsking('lever')}>Réautoriser le contact</button>}
          </div>
        )
        : (
          <div className="rounded-lg border border-line bg-sunk p-3">
            <label className="block">
              <span className="label">{asking === 'opposition' ? 'Motif (ce que la personne a dit, et par quel canal)' : 'Pourquoi le contact redevient possible'}</span>
              <input id={`motif-${prospectId}`} className="field mt-1" value={reason} onChange={event => setReason(event.target.value)} placeholder={asking === 'opposition' ? '« Stop » par retour de courrier le 3 octobre' : 'A rappelé lui-même après le salon'} maxLength={300} />
            </label>
            <div className="mt-2 flex gap-2">
              <button type="button" className={`btn btn-sm ${asking === 'opposition' ? 'btn-ink' : 'btn-primary'}`} disabled={busy || reason.trim() === ''} onClick={() => void send({ action: asking, reason: reason.trim() })}>{asking === 'opposition' ? 'Confirmer l’opposition' : 'Réautoriser'}</button>
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setAsking(null)}>Annuler</button>
            </div>
          </div>
        )}
      {error !== null && <p className="text-[12.5px] text-fuchsia">{error}</p>}
    </div>
  )
}
