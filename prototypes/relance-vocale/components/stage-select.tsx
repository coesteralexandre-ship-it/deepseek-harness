'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { STAGE_META } from '@/core/stages'
import { STAGES, type Stage } from '@/core/types'

/** Tomorrow 10:00 local, as the value of a datetime-local input. */
function tomorrowTen(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(10, 0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Stage of the prospect; « À rappeler » asks for the date, which becomes a task. */
export function StageSelect({ prospectId, stage, nextCallAt }: { prospectId: string; stage: Stage; nextCallAt?: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [asking, setAsking] = useState(false)
  const [when, setWhen] = useState(tomorrowTen)
  const [error, setError] = useState<string | null>(null)

  async function save(next: Stage, callAt?: string) {
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/prospects/${prospectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage: next, ...(callAt !== undefined ? { nextCallAt: callAt } : {}) }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) setError(data.error ?? `Erreur ${response.status}`)
      else {
        setAsking(false)
        router.refresh()
      }
    } finally {
      setPending(false)
    }
  }

  function change(next: Stage) {
    if (next === 'a_rappeler') {
      setAsking(true)
      return
    }
    void save(next)
  }

  return (
    <div>
      <label className="block">
        <span className="label">Étape du pipeline</span>
        <select className="field mt-1.5" value={asking ? 'a_rappeler' : stage} disabled={pending} onChange={event => change(event.target.value as Stage)}>
          {STAGES.map(option => (
            <option key={option} value={option}>{STAGE_META[option].label}</option>
          ))}
        </select>
      </label>
      {asking && (
        <div className="mt-3 rounded-lg border border-ochre/40 bg-ochre/5 p-3">
          <label className="block">
            <span className="label">Rappeler le</span>
            <input id={`rappel-${prospectId}`} type="datetime-local" className="field mt-1" value={when} onChange={event => setWhen(event.target.value)} />
          </label>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-sm btn-primary" disabled={pending || when === ''} onClick={() => void save('a_rappeler', new Date(when).toISOString())}>Programmer le rappel</button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={() => setAsking(false)}>Annuler</button>
          </div>
        </div>
      )}
      {!asking && nextCallAt !== undefined && stage === 'a_rappeler' && (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ochre">Rappel le {new Date(nextCallAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium', timeStyle: 'short' })}</p>
      )}
      {error !== null && <p className="mt-2 text-[12.5px] text-fuchsia">{error}</p>}
    </div>
  )
}
