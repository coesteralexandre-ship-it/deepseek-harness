'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import type { Enrichment, TeamGroup } from '@/core/types'

const GROUP_LABEL: Record<TeamGroup, string> = { finance: 'Finance', direction: 'Direction', agence: 'Agences', rh: 'RH', autre: 'Autres' }

/** Website, business numbers, LinkedIn and the team map of a prospect, with the buttons that fetch them. */
export function EnrichPanel({ prospectId, enrichment, ready }: { prospectId: string; enrichment?: Enrichment; ready: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'contacts' | 'equipe' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState<TeamGroup | 'tous'>('tous')
  const [localOnly, setLocalOnly] = useState(false)
  const team = enrichment?.team ?? []
  const shown = useMemo(() => team.filter(member => (group === 'tous' || member.group === group) && (!localOnly || member.local === true)), [team, group, localOnly])
  const counts = useMemo(() => team.reduce<Record<string, number>>((acc, member) => ({ ...acc, [member.group]: (acc[member.group] ?? 0) + 1 }), {}), [team])
  const locals = team.filter(member => member.local === true).length

  async function run(what: 'contacts' | 'equipe') {
    setBusy(what)
    setError(null)
    try {
      const response = await fetch(`/api/prospects/${prospectId}/enrich`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ what }) })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) setError(data.error ?? `Erreur ${response.status}`)
      else router.refresh()
    } catch {
      setError('Réseau indisponible, réessayez.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="eyebrow">Coordonnées et équipe</p>
        {enrichment !== undefined && <span className="font-mono text-[11px] text-faint">Exa + Serper · {enrichment.costUsd.toFixed(3)} $ dépensés</span>}
      </div>

      <div className="card mt-3 p-5">
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="label">Site</dt>
            <dd className="mt-1.5 text-[14px]">{enrichment?.website !== undefined ? <a href={enrichment.website} target="_blank" rel="noreferrer" className="font-semibold text-blue hover:underline">{enrichment.website.replace(/^https?:\/\//u, '').replace(/\/$/u, '')} ↗</a> : <span className="text-faint">—</span>}</dd>
          </div>
          <div>
            <dt className="label">LinkedIn de la société</dt>
            <dd className="mt-1.5 text-[14px]">{enrichment?.linkedinCompany !== undefined ? <a href={enrichment.linkedinCompany} target="_blank" rel="noreferrer" className="font-semibold text-blue hover:underline">Page entreprise ↗</a> : <span className="text-faint">—</span>}</dd>
          </div>
          <div>
            <dt className="label">Numéros publiés</dt>
            <dd className="mt-1.5 space-y-1">
              {(enrichment?.phones ?? []).length === 0 && <span className="text-[14px] text-faint">—</span>}
              {(enrichment?.phones ?? []).map(phone => (
                <div key={phone.value} className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
                  <a href={`tel:${phone.value.replace(/\s/gu, '')}`} className="tabular font-mono font-semibold text-ink hover:text-blue">{phone.value}</a>
                  <span className="text-[12px] text-muted">{phone.url !== undefined ? <a href={phone.url} target="_blank" rel="noreferrer" className="hover:underline">{phone.label}</a> : phone.label}</span>
                </div>
              ))}
            </dd>
          </div>
          <div>
            <dt className="label">Emails publiés</dt>
            <dd className="mt-1.5 space-y-1">
              {(enrichment?.emails ?? []).length === 0 && <span className="text-[14px] text-faint">—</span>}
              {(enrichment?.emails ?? []).map(email => <div key={email.value} className="select-all font-mono text-[13px] text-ink">{email.value}</div>)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="label">LinkedIn du dirigeant</dt>
            <dd className="mt-1.5 text-[14px]">
              {enrichment?.linkedinPerson !== undefined
                ? <><a href={enrichment.linkedinPerson.url} target="_blank" rel="noreferrer" className="font-semibold text-blue hover:underline">Profil ↗</a>{enrichment.linkedinPerson.headline !== undefined && <span className="ml-2 text-muted">{enrichment.linkedinPerson.headline}</span>}</>
                : <span className="text-faint">—</span>}
            </dd>
          </div>
        </dl>
        {enrichment !== undefined && enrichment.gaps.length > 0 && <p className="mt-4 text-[12.5px] text-ochre">Manque : {enrichment.gaps.join(' · ')}</p>}
        <p className="mt-4 text-[12px] leading-relaxed text-muted">Numéros et emails publiés par l’entreprise, jamais de mobile personnel. Appel par une personne de votre équipe : Léa n’appelle une agence que si elle le demande.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-primary" disabled={!ready || busy !== null} onClick={() => void run('contacts')}>{busy === 'contacts' ? 'Recherche…' : enrichment?.enrichedAt !== undefined ? 'Relancer site, numéros, LinkedIn' : 'Trouver site, numéros, LinkedIn'}</button>
          <button type="button" className="btn btn-sm" disabled={!ready || busy !== null} onClick={() => void run('equipe')}>{busy === 'equipe' ? 'Cartographie…' : team.length > 0 ? 'Refaire la carto d’équipe' : 'Cartographier l’équipe'}</button>
        </div>
        {!ready && <p className="mt-2 font-mono text-[11px] text-ochre">Renseignez EXA_API_KEY (et SERPER_API_KEY) pour lancer une recherche.</p>}
        {error !== null && <p className="mt-3 rounded-md border border-fuchsia/30 bg-fuchsia/10 px-3 py-2 text-[13px] text-fuchsia">{error}</p>}
      </div>

      {team.length > 0 && (
        <div className="card mt-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] font-semibold text-ink">Équipe sur LinkedIn · {team.length}</p>
            <span className="font-mono text-[11px] text-faint">Carto du {new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(enrichment?.teamMappedAt ?? Date.now()))}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrer l’équipe">
            {(['tous', 'finance', 'direction', 'agence', 'rh', 'autre'] as const).filter(key => key === 'tous' || (counts[key] ?? 0) > 0).map(key => (
              <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)} className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${group === key ? 'border-ink bg-ink text-white' : 'border-line-2 bg-card text-ink-2 hover:border-ink'}`}>
                {key === 'tous' ? `Tous ${team.length}` : `${GROUP_LABEL[key]} ${counts[key]}`}
              </button>
            ))}
            {locals > 0 && (
              <button type="button" aria-pressed={localOnly} onClick={() => setLocalOnly(value => !value)} className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${localOnly ? 'border-blue bg-blue text-white' : 'border-line-2 bg-card text-blue hover:border-blue'}`}>Même ville {locals}</button>
            )}
          </div>
          <ul className="mt-3 divide-y divide-line">
            {shown.map(member => (
              <li key={member.linkedin} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                <div className="min-w-0">
                  <a href={member.linkedin} target="_blank" rel="noreferrer" className="text-[14px] font-semibold text-ink hover:text-blue">{member.name} ↗</a>
                  <span className="ml-2 rounded-sm bg-sunk px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{GROUP_LABEL[member.group]}</span>
                  {member.local === true && <span className="ml-1.5 rounded-sm bg-blue-mist px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-blue">même ville</span>}
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted">{member.title}</p>
                </div>
                <div className="text-[12px] text-faint sm:text-right">
                  <div>{member.location}</div>
                  {member.since !== undefined && <div>en poste depuis {member.since}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
