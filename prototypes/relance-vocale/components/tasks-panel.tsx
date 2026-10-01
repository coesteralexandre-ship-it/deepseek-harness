'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { TASK_KIND_LABEL } from '@/core/tasks'
import type { Task, TaskKind } from '@/core/types'

const PARIS: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }

function tomorrowTen(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(10, 0, 0, 0)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Dated tasks of one prospect: a short form to add one, the open ones to tick, the done ones folded. */
export function TasksPanel({ prospectId, tasks }: { prospectId: string; tasks: Task[] }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<TaskKind>('appel')
  const [when, setWhen] = useState(tomorrowTen)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const open = tasks.filter(task => task.doneAt === undefined).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const done = tasks.filter(task => task.doneAt !== undefined).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
  const now = Date.now()

  async function call(method: 'POST' | 'PATCH', body: unknown, key: string) {
    setBusy(key)
    setError(null)
    try {
      const response = await fetch(`/api/prospects/${prospectId}/taches`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) setError(data.error ?? `Erreur ${response.status}`)
      else {
        if (method === 'POST') setTitle('')
        router.refresh()
      }
    } catch {
      setError('Réseau indisponible, réessayez.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mt-8">
      <p className="eyebrow">Tâches · {open.length}</p>
      <div className="card mt-3 p-5">
        <form
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_200px_auto]"
          onSubmit={event => {
            event.preventDefault()
            if (title.trim() === '' || when === '') return
            void call('POST', { title: title.trim(), kind, dueAt: new Date(when).toISOString() }, 'add')
          }}
        >
          <input id={`tache-titre-${prospectId}`} className="field" placeholder="Rappeler après le courrier, envoyer la plaquette…" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} />
          <select id={`tache-type-${prospectId}`} className="field" value={kind} onChange={event => setKind(event.target.value as TaskKind)}>
            {(Object.keys(TASK_KIND_LABEL) as TaskKind[]).map(key => <option key={key} value={key}>{TASK_KIND_LABEL[key]}</option>)}
          </select>
          <input id={`tache-date-${prospectId}`} type="datetime-local" className="field" value={when} onChange={event => setWhen(event.target.value)} />
          <button type="submit" className="btn btn-sm btn-primary" disabled={busy !== null || title.trim() === ''}>{busy === 'add' ? 'Ajout…' : 'Ajouter'}</button>
        </form>
        {error !== null && <p className="mt-2 text-[12.5px] text-fuchsia">{error}</p>}
        <ul className="mt-4 divide-y divide-line">
          {open.length === 0 && <li className="py-2 text-[13px] text-faint">Aucune tâche en attente.</li>}
          {open.map(task => {
            const late = Date.parse(task.dueAt) < now
            return (
              <li key={task.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <button type="button" aria-label={`Marquer « ${task.title} » comme faite`} disabled={busy !== null} onClick={() => void call('PATCH', { taskId: task.id, action: 'faite' }, task.id)} className="grid h-5 w-5 place-items-center rounded-full border border-line-2 bg-card hover:border-emerald hover:bg-emerald/10" />
                <span className="min-w-0 flex-1">
                  <span className="text-[14px] font-semibold text-ink">{task.title}</span>
                  <span className="ml-2 rounded-sm bg-sunk px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{TASK_KIND_LABEL[task.kind]}</span>
                  {task.note !== undefined && <span className="block text-[12.5px] text-muted">{task.note}</span>}
                </span>
                <span className={`tabular font-mono text-[12px] ${late ? 'font-semibold text-fuchsia' : 'text-muted'}`}>{late ? 'En retard · ' : ''}{new Date(task.dueAt).toLocaleString('fr-FR', PARIS)}</span>
                <button type="button" className="text-[12px] text-faint hover:text-fuchsia" disabled={busy !== null} onClick={() => void call('PATCH', { taskId: task.id, action: 'supprimer' }, task.id)}>Retirer</button>
              </li>
            )
          })}
        </ul>
        {done.length > 0 && (
          <details className="mt-3">
            <summary className="text-[12px] font-semibold text-muted">{done.length} faite{done.length > 1 ? 's' : ''}</summary>
            <ul className="mt-2 divide-y divide-line">
              {done.map(task => (
                <li key={task.id} className="flex flex-wrap items-center gap-3 py-2 text-[13px] text-muted">
                  <span className="line-through">{task.title}</span>
                  <span className="font-mono text-[11px]">{new Date(task.doneAt ?? task.dueAt).toLocaleDateString('fr-FR')}</span>
                  <button type="button" className="text-[12px] text-faint hover:text-blue" disabled={busy !== null} onClick={() => void call('PATCH', { taskId: task.id, action: 'rouvrir' }, task.id)}>Rouvrir</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  )
}
