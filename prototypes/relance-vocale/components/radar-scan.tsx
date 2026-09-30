'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** Scan one département's public accounts for staffing agencies whose customer credit runs long. */
export function RadarScan() {
  const router = useRouter()
  const [departement, setDepartement] = useState('69')
  const [minDays, setMinDays] = useState('80')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function scan() {
    setBusy(true)
    setNotice(null)
    try {
      const response = await fetch('/api/radar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ departement: departement.trim().toUpperCase(), minDsoDays: Number(minDays), maxCompanies: 100 }) })
      const data = (await response.json().catch(() => ({}))) as { scanned?: number; withAccounts?: number; medianDays?: number; kept?: number; added?: number; networks?: { brand: string; count: number }[]; error?: string }
      if (!response.ok) {
        setNotice({ tone: 'error', text: data.error ?? `Erreur ${response.status}` })
        return
      }
      setNotice({ tone: 'ok', text: `${data.scanned} agences regardées, ${data.withAccounts} aux comptes publiés (médiane ${data.medianDays ?? '—'} j). ${data.kept} au-dessus de ${minDays} j, ${data.added} nouvelle${(data.added ?? 0) > 1 ? 's' : ''} dans le pipeline.${(data.networks ?? []).length > 0 ? ` Réseaux regroupés : ${(data.networks ?? []).map(entry => `${entry.brand} (${entry.count})`).join(', ')}.` : ''}` })
      router.refresh()
    } catch (error) {
      // fetch rejects when the network drops or the connection closes during the long scan.
      setNotice({ tone: 'error', text: `Balayage interrompu : ${error instanceof Error && error.name === 'TimeoutError' ? 'délai dépassé' : 'réseau indisponible'}, réessayez.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-line bg-blue-mist/60 p-4">
      <p className="label text-blue">Radar open data</p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">Agences d’intérim (NAF 78.20Z) d’un département, délai client lu dans les comptes publiés (ratios INPI). Gratuit, sans clé.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label><span className="label">Département</span><input id="radar-dep" className="field mt-1 !py-2" value={departement} onChange={event => setDepartement(event.target.value)} /></label>
        <label><span className="label">Délai min. (j)</span><input id="radar-min" inputMode="numeric" className="field mt-1 !py-2" value={minDays} onChange={event => setMinDays(event.target.value)} /></label>
      </div>
      <button type="button" className="btn btn-sm btn-primary mt-3" disabled={busy} onClick={scan}>{busy ? 'Balayage… (30 s)' : 'Balayer'}</button>
      {notice !== null && <p className={`mt-3 text-[13px] leading-relaxed ${notice.tone === 'ok' ? 'text-emerald' : 'text-fuchsia'}`}>{notice.text}</p>}
    </div>
  )
}
