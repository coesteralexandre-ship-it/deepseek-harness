'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { TASK_KIND_LABEL, type DueTask } from '@/core/tasks'

const TIME: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }
const DAY: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }

function groupLabel(inDays: number): string {
  if (inDays < 0) return 'En retard'
  if (inDays === 0) return 'Aujourd’hui'
  if (inDays === 1) return 'Demain'
  return 'Cette semaine'
}

/** Due tasks across prospects, grouped by day, each one tickable without leaving the page. */
export function TodayList({ tasks }: { tasks: DueTask[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const groups: { label: string; tasks: DueTask[] }[] = []
  for (const task of tasks) {
    const label = groupLabel(task.inDays)
    const group = groups.find(entry => entry.label === label)
    if (group !== undefined) group.tasks.push(task)
    else groups.push({ label, tasks: [task] })
  }

  async function done(task: DueTask) {
    setBusy(task.id)
    try {
      await fetch(`/api/prospects/${task.prospectId}/taches`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: task.id, action: 'faite' }) })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  if (tasks.length === 0) {
    return (
      <section className="card p-8 text-center">
        <p className="font-display text-[22px] leading-tight">Rien à faire aujourd’hui.</p>
        <p className="mt-2 text-[13.5px] text-muted">Ajoutez une tâche depuis une fiche, ou passez un prospect « À rappeler » avec une date.</p>
        <Link href="/pipeline" className="btn btn-sm mt-4 inline-flex">Voir les prospects</Link>
      </section>
    )
  }

  return (
    <div className="space-y-5">
      {groups.map(group => (
        <section key={group.label}>
          <p className={`eyebrow ${group.label === 'En retard' ? 'text-fuchsia' : ''}`}>{group.label} · {group.tasks.length}</p>
          <ul className="card mt-3 divide-y divide-line">
            {group.tasks.map(task => (
              <li key={task.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button type="button" aria-label={`Marquer « ${task.title} » comme faite`} disabled={busy !== null} onClick={() => void done(task)} className="grid h-5 w-5 place-items-center rounded-full border border-line-2 bg-card hover:border-emerald hover:bg-emerald/10" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold text-ink">
                    {task.title}
                    <span className="ml-2 rounded-sm bg-sunk px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{TASK_KIND_LABEL[task.kind]}</span>
                  </p>
                  <p className="text-[12.5px] text-muted">
                    <Link href={`/prospects/${task.prospectId}`} className="font-medium text-ink-2 hover:text-blue">{task.company}</Link>
                    {task.contact !== '' && <> · {task.contact}</>}
                    {task.note !== undefined && <> · {task.note}</>}
                  </p>
                </div>
                <span className={`tabular whitespace-nowrap font-mono text-[12px] ${task.inDays < 0 ? 'font-semibold text-fuchsia' : 'text-muted'}`}>
                  {task.inDays < 0 || task.inDays > 1 ? `${new Date(task.dueAt).toLocaleDateString('fr-FR', DAY)} · ` : ''}{new Date(task.dueAt).toLocaleTimeString('fr-FR', TIME)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
