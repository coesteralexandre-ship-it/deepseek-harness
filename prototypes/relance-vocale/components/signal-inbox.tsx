'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { RadarScan } from '@/components/radar-scan'
import { SourceChip, WeightDots } from '@/components/source-chip'
import { relativeDay } from '@/core/format'
import { SOURCE_META } from '@/core/signals'
import { SIGNAL_SOURCES, type Signal, type SignalSource } from '@/core/types'

export interface SignalItem extends Signal {
  company: string
}

interface ProspectOption {
  id: string
  company: string
}

export function SignalInbox({ items, prospects }: { items: SignalItem[]; prospects: ProspectOption[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setStatus(id: string, status: Signal['status']) {
    setBusy(id)
    try {
      const response = await fetch(`/api/signals/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) setError(`Mise à jour refusée (${response.status})`)
      else router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const prospectId = String(form.get('prospectId') ?? '')
    const base = {
      source: String(form.get('source')) as SignalSource,
      title: String(form.get('title') ?? ''),
      excerpt: String(form.get('excerpt') ?? ''),
      weight: Number(form.get('weight') ?? 3),
    }
    const body = prospectId !== ''
      ? { prospectId, ...base }
      : {
          prospect: {
            company: String(form.get('company') ?? ''),
            city: String(form.get('city') ?? ''),
            contact: {
              firstName: String(form.get('firstName') ?? ''),
              lastName: String(form.get('lastName') ?? ''),
              role: String(form.get('role') ?? ''),
              phone: String(form.get('phone') ?? ''),
            },
          },
          ...base,
        }
    setBusy('form')
    try {
      const response = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        setError(payload.error ?? `Refusé (${response.status})`)
        return
      }
      setError(null)
      setShowForm(false)
      event.currentTarget.reset()
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const groups: { key: Signal['status']; label: string }[] = [
    { key: 'nouveau', label: 'À trier' },
    { key: 'qualifie', label: 'Qualifiés' },
    { key: 'ignore', label: 'Ignorés' },
  ]

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
      <div>
        <div className="flex items-center justify-between">
          <p className="eyebrow">Signaux reçus</p>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowForm(value => !value)}>
            {showForm ? 'Fermer' : '+ Ajouter un signal'}
          </button>
        </div>
        {error !== null && <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-fuchsia">{error}</p>}

        {showForm && (
          <form onSubmit={submit} className="card card-blue mt-5 grid gap-3 p-5 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="label">Entreprise connue</span>
              <select name="prospectId" className="field mt-1" defaultValue="">
                <option value="">— Nouvelle entreprise (remplir ci-dessous) —</option>
                {prospects.map(prospect => (
                  <option key={prospect.id} value={prospect.id}>{prospect.company}</option>
                ))}
              </select>
            </label>
            <input name="company" placeholder="Raison sociale" className="field" />
            <input name="city" placeholder="Ville" className="field" />
            <input name="firstName" placeholder="Prénom du contact" className="field" />
            <input name="lastName" placeholder="Nom" className="field" />
            <input name="role" placeholder="Fonction (DAF, gérant…)" className="field" />
            <input name="phone" placeholder="Téléphone E.164 : +33612345678" className="field" />
            <label>
              <span className="label">Source</span>
              <select name="source" className="field mt-1" defaultValue="linkedin">
                {SIGNAL_SOURCES.map(source => (
                  <option key={source} value={source}>{SOURCE_META[source].label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Poids (1–5)</span>
              <input name="weight" type="number" min={1} max={5} defaultValue={3} className="field mt-1" />
            </label>
            <input name="title" required placeholder="Titre du signal (ex : « Encore un client qui règle à 90 jours »)" className="field sm:col-span-2" />
            <textarea name="excerpt" placeholder="Extrait ou contexte" className="field sm:col-span-2" rows={2} />
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-primary" disabled={busy === 'form'}>
                {busy === 'form' ? 'Envoi…' : 'Enregistrer le signal'}
              </button>
            </div>
          </form>
        )}

        {groups.map(group => {
          const rows = items.filter(item => item.status === group.key)
          if (rows.length === 0) return null
          return (
            <section key={group.key} className="mt-7">
              <h3 className="label">
                {group.label} <span className="tabular">· {rows.length}</span>
              </h3>
              <ul className="card mt-3 divide-y divide-line">
                {rows.map((item, index) => (
                  <li key={item.id} className="animate-rise grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto]" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <SourceChip source={item.source} />
                        <WeightDots weight={item.weight} />
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{relativeDay(item.detectedAt)}</span>
                      </div>
                      <p className="mt-2 text-[16px] font-semibold leading-snug text-ink">{item.title}</p>
                      {item.excerpt !== '' && <p className="mt-1 text-[13px] leading-relaxed text-muted">{item.excerpt}</p>}
                      <p className="mt-2 text-[12px] text-faint">
                        <Link href={`/prospects/${item.prospectId}`} className="font-medium text-blue hover:text-ink">{item.company}</Link>
                        {item.url !== undefined && (
                          <>
                            {' · '}
                            <a href={item.url} target="_blank" rel="noreferrer" className="underline decoration-line-2 underline-offset-4 hover:text-ink">source ↗</a>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-start gap-2 sm:flex-col">
                      {item.status !== 'qualifie' && (
                        <button type="button" className="btn btn-sm btn-success" disabled={busy === item.id} onClick={() => setStatus(item.id, 'qualifie')}>Qualifier</button>
                      )}
                      {item.status !== 'ignore' && (
                        <button type="button" className="btn btn-sm" disabled={busy === item.id} onClick={() => setStatus(item.id, 'ignore')}>Ignorer</button>
                      )}
                      {item.status === 'ignore' && (
                        <button type="button" className="btn btn-sm" disabled={busy === item.id} onClick={() => setStatus(item.id, 'nouveau')}>Restaurer</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <aside className="card self-start p-5">
        <RadarScan />
        <p className="eyebrow mt-6">Sources surveillées</p>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Un signal vaut de 1 à 5 selon qu’il est de première main et explicite. Le score d’un prospect additionne ses signaux, pondérés par leur fraîcheur.
        </p>
        <ul className="mt-5 space-y-4">
          {SIGNAL_SOURCES.map(source => (
            <li key={source}>
              <SourceChip source={source} />
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{SOURCE_META[source].how}</p>
            </li>
          ))}
        </ul>
        <div className="mt-6 rounded-lg border border-line bg-sunk p-4">
          <p className="label text-blue">Ingestion automatique</p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Un outil d’enrichissement (Clay, n8n, un scraper) pousse ses trouvailles sur <code className="font-mono text-[12px] text-blue">POST /api/signals</code>. La page de l’agent documente le format.
          </p>
        </div>
      </aside>
    </div>
  )
}
