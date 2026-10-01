'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { WatchRun } from '@/core/types'

export interface SourceState {
  key: string
  label: string
  unavailable: string | null
  paid: boolean
}

const SOURCE_LABEL: Record<string, string> = { bodacc: 'BODACC', pappers: 'Comptes INPI', rne: 'Registre', sirene: 'Sirene', garantie: 'Garantie', offre_emploi: 'Offres d’emploi', presse: 'Presse', linkedin: 'LinkedIn', avis: 'Avis' }

/** Réglages section: state of the ten watch sources, the last run, and the button that runs it now. */
export function VeillePanel({ sources, lastRun }: { sources: SourceState[]; lastRun?: WatchRun }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [paid, setPaid] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'ko'; text: string } | null>(null)

  async function run() {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/veille', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paid }) })
      const data = (await response.json().catch(() => ({}))) as { error?: string; created?: number; prospects?: number; errors?: string[]; costUsd?: number }
      if (!response.ok) setMessage({ tone: 'ko', text: data.error ?? `Erreur ${response.status}` })
      else {
        setMessage({ tone: 'ok', text: `${data.created ?? 0} signal${(data.created ?? 0) > 1 ? 'aux' : ''} nouveau${(data.created ?? 0) > 1 ? 'x' : ''} sur ${data.prospects ?? 0} prospects${(data.errors?.length ?? 0) > 0 ? `, ${data.errors?.length} source${(data.errors?.length ?? 0) > 1 ? 's' : ''} en erreur` : ''}${(data.costUsd ?? 0) > 0 ? `, ${data.costUsd} $` : ''}.` })
        router.refresh()
      }
    } catch {
      setMessage({ tone: 'ko', text: 'Réseau indisponible, réessayez.' })
    } finally {
      setBusy(false)
    }
  }

  const paidReady = sources.some(source => source.paid && source.unavailable === null)
  return (
    <section className="mt-10">
      <p className="eyebrow">Veille · dix signaux</p>
      <div className="card mt-3 p-5">
        <p className="text-[14px] leading-relaxed text-ink-2">Chaque matin de semaine, la veille relit les sources publiques pour chaque prospect et ajoute un signal quand quelque chose a bougé : annonce BODACC, nouveau dirigeant, agence ouverte, offre d’emploi recouvrement, dérive du délai client, calendrier de la garantie financière, défaillances clientes du département, presse. Les sources payantes (équipe LinkedIn via Exa, avis Google via SerpApi) tournent le lundi, sous le plafond du jour.</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {sources.map(source => (
            <li key={source.key} className="flex items-start gap-2.5 rounded-md border border-line px-3 py-2">
              <span aria-hidden className={`mt-1.5 inline-block size-2 shrink-0 rounded-full ${source.unavailable === null ? 'bg-green' : 'bg-ochre'}`} />
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-ink">{source.label}{source.paid && <span className="ml-1.5 font-mono text-[10.5px] font-normal text-faint">payant</span>}</p>
                <p className="text-[12px] text-muted">{source.unavailable ?? 'Prête'}</p>
              </div>
            </li>
          ))}
        </ul>
        {lastRun !== undefined && (
          <div className="mt-4 rounded-md bg-paper-2 px-3 py-2.5 text-[12.5px] text-ink-2">
            <p><span className="font-semibold text-ink">Dernier passage</span> le {new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(lastRun.at))} ({lastRun.trigger}) : {lastRun.created} signal{lastRun.created > 1 ? 'aux' : ''} sur {lastRun.prospects} prospects{lastRun.costUsd > 0 ? `, ${lastRun.costUsd} $` : ''}.</p>
            {Object.keys(lastRun.bySource).length > 0 && <p className="mt-1 font-mono text-[11.5px] text-muted">{Object.entries(lastRun.bySource).map(([source, count]) => `${SOURCE_LABEL[source] ?? source} ${count}`).join(' · ')}</p>}
            {lastRun.errors.length > 0 && <details className="mt-1.5"><summary className="cursor-pointer text-ochre">{lastRun.errors.length} erreur{lastRun.errors.length > 1 ? 's' : ''}</summary><ul className="mt-1 space-y-0.5 font-mono text-[11px] text-muted">{lastRun.errors.map(error => <li key={error}>{error}</li>)}</ul></details>}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void run()}>{busy ? 'Veille en cours…' : 'Lancer la veille maintenant'}</button>
          <label className={`flex items-center gap-2 text-[13px] ${paidReady ? 'text-ink-2' : 'text-faint'}`}>
            <input type="checkbox" checked={paid} disabled={!paidReady || busy} onChange={event => setPaid(event.target.checked)} />
            Inclure les sources payantes
          </label>
        </div>
        {busy && <p className="mt-2 font-mono text-[11px] text-muted">Quelques requêtes publiques par prospect : comptez une à deux minutes.</p>}
        {message !== null && <p className={`mt-3 rounded-md border px-3 py-2 text-[13px] ${message.tone === 'ok' ? 'border-green/30 bg-green/10 text-green' : 'border-fuchsia/30 bg-fuchsia/10 text-fuchsia'}`}>{message.text}</p>}
      </div>
    </section>
  )
}
