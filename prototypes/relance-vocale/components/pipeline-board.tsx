'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, type DragEvent } from 'react'
import { ProspectCard } from '@/components/prospect-card'
import { STAGE_META } from '@/core/stages'
import { STAGES, type ProspectView, type Stage } from '@/core/types'

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
    const previous = items
    setItems(items.map(item => (item.id === id ? { ...item, stage } : item)))
    const response = await fetch(`/api/prospects/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
    if (!response.ok) {
      setItems(previous)
      setError(`Déplacement refusé (${response.status})`)
      return
    }
    setError(null)
    router.refresh()
  }

  return (
    <section>
      {error !== null && <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-red">{error}</p>}
      <div className="grid auto-cols-[minmax(218px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-6">
        {STAGES.map(stage => {
          const meta = STAGE_META[stage]
          const column = items.filter(item => item.stage === stage)
          return (
            <div
              key={stage}
              className={`flex min-h-[420px] flex-col gap-3 rounded-sm p-2 transition-colors ${over === stage ? 'column-over' : ''}`}
              onDragOver={event => {
                event.preventDefault()
                if (over !== stage) setOver(stage)
              }}
              onDragLeave={() => setOver(current => (current === stage ? null : current))}
              onDrop={event => onDrop(event, stage)}
            >
              <header className="rule px-1 pt-3">
                <div className="flex items-baseline justify-between">
                  <h2 className={`font-mono text-[11px] uppercase tracking-[0.16em] ${meta.tone === 'red' ? 'text-red' : meta.tone === 'green' ? 'text-green' : meta.tone === 'amber' ? 'text-amber' : 'text-ink'}`}>
                    {meta.label}
                  </h2>
                  <span className="tabular font-mono text-[11px] text-muted">{column.length}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">{meta.hint}</p>
              </header>
              {column.map((item, index) => (
                <div key={item.id} draggable className="card-drag" onDragStart={event => onDragStart(event, item.id)}>
                  <ProspectCard prospect={item} index={index} />
                </div>
              ))}
              {column.length === 0 && (
                <div className="grid flex-1 place-items-center border border-dashed border-line font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
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
