import { newId } from './ids.ts'
import type { Prospect, ProspectEvent, Task, TaskKind } from './types.ts'

export const TASK_KIND_LABEL: Record<TaskKind, string> = { appel: 'Appel', courrier: 'Courrier', email: 'Email', autre: 'À faire' }

/** Append one line to the prospect's history. */
export function logProspect(prospect: Prospect, title: string, detail: string | undefined, now: number): Prospect {
  const event: ProspectEvent = { id: newId('pe'), at: new Date(now).toISOString(), title, ...(detail !== undefined ? { detail } : {}) }
  return { ...prospect, history: [...(prospect.history ?? []), event], updatedAt: event.at }
}

/** Add a dated task; `fromStage` marks the one the « À rappeler » stage keeps in step with its date. */
export function addTask(prospect: Prospect, input: { title: string; kind: TaskKind; dueAt: string; note?: string; fromStage?: boolean }, now: number): Prospect {
  const task: Task = { id: newId('t'), title: input.title, kind: input.kind, dueAt: input.dueAt, createdAt: new Date(now).toISOString(), ...(input.note !== undefined && input.note !== '' ? { note: input.note } : {}), ...(input.fromStage ? { fromStage: true } : {}) }
  // The stage's own reminder is unique: a new date replaces the old one rather than piling up.
  const kept = input.fromStage ? (prospect.tasks ?? []).filter(entry => !(entry.fromStage && entry.doneAt === undefined)) : prospect.tasks ?? []
  return logProspect({ ...prospect, tasks: [...kept, task] }, `Tâche ajoutée : ${task.title}`, `${TASK_KIND_LABEL[task.kind]} · ${new Date(task.dueAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium', timeStyle: 'short' })}`, now)
}

export function completeTask(prospect: Prospect, taskId: string, now: number): Prospect {
  const task = (prospect.tasks ?? []).find(entry => entry.id === taskId)
  if (task === undefined || task.doneAt !== undefined) return prospect
  const tasks = (prospect.tasks ?? []).map(entry => (entry.id === taskId ? { ...entry, doneAt: new Date(now).toISOString() } : entry))
  return logProspect({ ...prospect, tasks }, `Tâche faite : ${task.title}`, undefined, now)
}

export function reopenTask(prospect: Prospect, taskId: string, now: number): Prospect {
  const tasks = (prospect.tasks ?? []).map(entry => (entry.id === taskId ? { ...entry, doneAt: undefined } : entry))
  return { ...prospect, tasks, updatedAt: new Date(now).toISOString() }
}

export function deleteTask(prospect: Prospect, taskId: string, now: number): Prospect {
  const task = (prospect.tasks ?? []).find(entry => entry.id === taskId)
  if (task === undefined) return prospect
  return logProspect({ ...prospect, tasks: (prospect.tasks ?? []).filter(entry => entry.id !== taskId) }, `Tâche retirée : ${task.title}`, undefined, now)
}

/** The next open task of a prospect, soonest first. */
export function nextTask(prospect: Prospect): Task | undefined {
  return [...(prospect.tasks ?? [])].filter(task => task.doneAt === undefined).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]
}

export interface DueTask extends Task {
  prospectId: string
  company: string
  contact: string
  /** Negative when overdue. */
  inDays: number
}

/** Open tasks of every prospect, overdue first, then by date. `horizonDays` bounds how far ahead to look. */
export function dueTasks(prospects: readonly Prospect[], now: number, horizonDays = 7): DueTask[] {
  const paris = (iso: string) => new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const today = paris(new Date(now).toISOString())
  today.setHours(0, 0, 0, 0)
  const out: DueTask[] = []
  for (const prospect of prospects) {
    for (const task of prospect.tasks ?? []) {
      if (task.doneAt !== undefined) continue
      const day = paris(task.dueAt)
      day.setHours(0, 0, 0, 0)
      const inDays = Math.round((day.getTime() - today.getTime()) / 86_400_000)
      if (inDays > horizonDays) continue
      out.push({ ...task, prospectId: prospect.id, company: prospect.company, contact: `${prospect.contact.firstName} ${prospect.contact.lastName}`.trim(), inDays })
    }
  }
  return out.sort((a, b) => a.dueAt.localeCompare(b.dueAt))
}
