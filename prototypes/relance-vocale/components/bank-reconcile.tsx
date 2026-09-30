'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { BankCredit, Match } from '@/core/reconcile'

const SAMPLE = `Date;Libellé;Débit;Crédit
05/10/2026;VIR SEPA PLASTURGIE DE L AIN F-2026-0958;;5 912,40
05/10/2026;PRLV URSSAF;18 240,00;
06/10/2026;VIR EMBAL SUD EST REGLEMENT;;6 450,00
06/10/2026;VIR SEPA BATI RHONE SAS F20260912 ACOMPTE;;9 800,00
07/10/2026;VIR INCONNU REF 88213;;1 200,00`

const euro = (value: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
const TONE = { sure: 'pill-ok', probable: 'pill-warn', faible: 'pill-mute' } as const
const LABEL = { sure: 'Sûr', probable: 'Probable', faible: 'À vérifier' } as const

/** Paste a bank statement, review the proposed matches, apply the ones you tick. */
export function BankReconcile() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [credits, setCredits] = useState<BankCredit[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [ticked, setTicked] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function analyze() {
    setBusy('analyze')
    setNotice(null)
    try {
      const response = await fetch('/api/reconcile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'analyze', text }) })
      const data = (await response.json().catch(() => ({}))) as { credits?: BankCredit[]; matches?: Match[]; error?: string }
      if (!response.ok) {
        setNotice({ tone: 'error', text: data.error ?? `Erreur ${response.status}` })
        return
      }
      const read = data.credits ?? []
      const applied = new Set(read.filter(credit => credit.alreadyApplied !== undefined).map(credit => credit.id))
      const proposed = (data.matches ?? []).filter(match => !applied.has(match.creditId))
      setCredits(read)
      setMatches(proposed)
      setTicked(new Set(proposed.filter(match => match.confidence === 'sure').map(match => match.creditId)))
    } finally {
      setBusy(null)
    }
  }

  async function apply() {
    setBusy('apply')
    setNotice(null)
    try {
      const items = matches.flatMap(match => {
        const credit = credits.find(entry => entry.id === match.creditId)
        return ticked.has(match.creditId) && credit !== undefined && credit.alreadyApplied === undefined ? [{ credit, invoiceId: match.invoiceId }] : []
      })
      const response = await fetch('/api/reconcile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'apply', items }) })
      const data = (await response.json().catch(() => ({}))) as { applied?: number; paid?: number; skipped?: number; error?: string }
      if (!response.ok) {
        setNotice({ tone: 'error', text: data.error ?? `Erreur ${response.status}` })
        return
      }
      const skipped = data.skipped ?? 0
      const already = skipped > 0 ? ` ${skipped} virement${skipped > 1 ? 's' : ''} déjà rapproché${skipped > 1 ? 's' : ''} auparavant, ignoré${skipped > 1 ? 's' : ''}.` : ''
      setNotice({ tone: 'ok', text: `${data.applied ?? 0} virement${(data.applied ?? 0) > 1 ? 's' : ''} rapproché${(data.applied ?? 0) > 1 ? 's' : ''}, ${data.paid ?? 0} facture${(data.paid ?? 0) > 1 ? 's' : ''} close${(data.paid ?? 0) > 1 ? 's' : ''}.${already}` })
      setMatches([])
      setCredits([])
      setTicked(new Set())
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const matchOf = (id: number) => matches.find(match => match.creditId === id)

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className="card card-emerald p-5">
        <p className="label">1 · Votre relevé</p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">Exportez le relevé de votre banque en CSV (colonnes date, libellé, montant ou crédit) et collez-le ici. Seuls les crédits sont lus.</p>
        <textarea id="bank-text" className="field mt-4 min-h-[240px] resize-y font-mono text-[12.5px] leading-relaxed" placeholder="Collez ici votre relevé…" value={text} onChange={event => setText(event.target.value)} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null || text.trim() === ''} onClick={analyze}>{busy === 'analyze' ? 'Analyse…' : 'Rapprocher'}</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setText(SAMPLE)}>Essayer avec un exemple</button>
        </div>
      </section>

      <section className="card p-5">
        <p className="label">2 · Virements et factures</p>
        {credits.length === 0
          ? <p className="mt-2 text-[13.5px] text-muted">Les crédits du relevé et la facture qu’ils règlent apparaîtront ici. Les rapprochements sûrs sont cochés d’office ; rien n’est appliqué sans votre validation.</p>
          : (
            <>
              <ul className="mt-3 divide-y divide-line rounded-md border border-line">
                {credits.map(credit => {
                  const done = credit.alreadyApplied
                  const match = done === undefined ? matchOf(credit.id) : undefined
                  return (
                    <li key={credit.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                      <input type="checkbox" aria-label="Appliquer ce rapprochement" disabled={match === undefined} checked={ticked.has(credit.id)} onChange={event => setTicked(current => { const next = new Set(current); if (event.target.checked) next.add(credit.id); else next.delete(credit.id); return next })} className="h-4 w-4 accent-[var(--color-blue)]" />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-ink-2"><span className="tabular font-bold text-ink">{euro(credit.amountEur)}</span> · {credit.label}</p>
                        {done !== undefined
                          ? <p className="mt-1 text-[12.5px] text-muted">Déjà rapproché de <Link href={`/factures/${done.invoiceId}`} className="font-semibold text-blue hover:underline">{done.company} · {done.number}</Link> lors d’un collage précédent : il ne sera pas compté deux fois.</p>
                          : match !== undefined
                          ? <p className="mt-1 text-[12.5px] text-muted">→ <Link href={`/factures/${match.invoiceId}`} className="font-semibold text-blue hover:underline">{match.company} · {match.number}</Link> ({match.settles === 'promesse' ? 'règle une promesse' : match.partial ? 'acompte sur la facture' : 'règle la facture'}) · {match.reasons.join(', ')}</p>
                          : <p className="mt-1 text-[12.5px] text-faint">Aucune facture ouverte ne correspond.</p>}
                      </div>
                      {done !== undefined
                        ? <span className="pill pill-mute justify-self-start">Déjà rapproché</span>
                        : match !== undefined && <span className={`pill ${TONE[match.confidence]} justify-self-start`}>{LABEL[match.confidence]}</span>}
                    </li>
                  )
                })}
              </ul>
              <button type="button" className="btn btn-success mt-4" disabled={busy !== null || ticked.size === 0} onClick={apply}>{busy === 'apply' ? 'Application…' : `Valider ${ticked.size} rapprochement${ticked.size > 1 ? 's' : ''}`}</button>
            </>
          )}
        {notice !== null && <p className={`mt-3 text-[13.5px] font-semibold ${notice.tone === 'ok' ? 'text-emerald' : 'text-fuchsia'}`}>{notice.text}</p>}
      </section>
    </div>
  )
}
