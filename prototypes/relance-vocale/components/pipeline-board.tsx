'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, type DragEvent } from 'react'
import { ProspectCard } from '@/components/prospect-card'
import { STAGE_META, type Tone } from '@/core/stages'
import { STAGES, type ProspectView, type Stage } from '@/core/types'

const DOT: Record<Tone, string> = { neutral: 'bg-cobalt-vivid', action: 'bg-blue', warn: 'bg-ochre-vivid', ok: 'bg-emerald-vivid', hot: 'bg-fuchsia-vivid', mute: 'bg-faint', amethyst: 'bg-amethyst-vivid', turquoise: 'bg-turquoise-vivid', sienna: 'bg-sienna-vivid' }

export function PipelineBoard({ prospects }: { prospects: ProspectView[] }) {
  const router = useRouter()
  const [items, setItems] = useState(prospects)
  const [over, setOver] = useState<Stage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setItems(prospects), [prospects])

  function onDragStart(event: DragEvent<HTMLDivElement>, id: string) {
    event.dataTransfer.setData('text/plain', id)
    event.dataTransfer.effectAllowed = 'move'
  }

  async function onDrop(event: DragEvent<HTMLDivElement>, stage: Stage) {
    event.preventDefault()
    setOver(null)
    const id = event.dataTransfer.getData('text/plain')
    const current = items.find(item => item.id === id)
    if (current === undefined || current.stage === stage) return
    // « À rappeler » needs a date: it becomes the task the « Aujourd’hui » page shows.
    let nextCallAt: string | undefined
    if (stage === 'a_rappeler') {
      const tomorrow = new Date(Date.now() + 86_400_000)
      const pad = (value: number) => String(value).padStart(2, '0')
      const answer = window.prompt('Rappeler quand ? (AAAA-MM-JJ HH:MM)', `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())} 10:00`)
      if (answer === null) return
      const parsed = new Date(answer.trim().replace(' ', 'T'))
      if (Number.isNaN(parsed.getTime())) {
        setError('Date de rappel illisible : attendu AAAA-MM-JJ HH:MM.')
        return
      }
      nextCallAt = parsed.toISOString()
    }
    const previous = items
    setItems(items.map(item => (item.id === id ? { ...item, stage } : item)))
    const response = await fetch(`/api/prospects/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage, ...(nextCallAt !== undefined ? { nextCallAt } : {}) }),
    })
    if (!response.ok) {
      setItems(previous)
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      setError(data.error ?? `Déplacement refusé (${response.status})`)
      return
    }
    setError(null)
    router.refresh()
  }

  return (
    <section>
      {error !== null && <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-fuchsia">{error}</p>}
      <div className="grid auto-cols-[minmax(232px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-6">
        {STAGES.map(stage => {
          const meta = STAGE_META[stage]
          const column = items.filter(item => item.stage === stage)
          return (
            <div
              key={stage}
              className={`flex min-h-[420px] flex-col gap-3 rounded-xl border border-line/70 bg-card/60 p-2.5 transition-colors ${over === stage ? 'column-over' : ''}`}
              onDragOver={event => {
                event.preventDefault()
                if (over !== stage) setOver(stage)
              }}
              onDragLeave={() => setOver(current => (current === stage ? null : current))}
              onDrop={event => onDrop(event, stage)}
            >
              <header className="px-1.5 pt-1.5">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink">
                    <span className={`h-1.5 w-1.5 rounded-full ${DOT[meta.tone]}`} />
                    {meta.label}
                  </h2>
                  <span className="tabular font-mono text-[11px] text-faint">{column.length}</span>
                </div>
                <p className="mt-1 text-[11.5px] text-faint">{meta.hint}</p>
              </header>
              {column.map((item, index) => (
                <div key={item.id} draggable className="card-drag" onDragStart={event => onDragStart(event, item.id)}>
                  <ProspectCard prospect={item} index={index} />
                </div>
              ))}
              {column.length === 0 && (
                <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-line font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                  Déposer ici
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
