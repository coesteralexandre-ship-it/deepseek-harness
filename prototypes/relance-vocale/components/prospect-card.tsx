import Link from 'next/link'
import { SourceChip } from '@/components/source-chip'
import { Stamp } from '@/components/stamp'
import { formatKeur, relativeDay } from '@/core/format'
import type { Tone } from '@/core/stages'
import type { ProspectView, Temperature } from '@/core/types'

const TEMPERATURE_TONE: Record<Temperature, Tone> = { chaud: 'red', tiede: 'amber', froid: 'muted' }
const TEMPERATURE_LABEL: Record<Temperature, string> = { chaud: 'chaud', tiede: 'tiède', froid: 'froid' }

export function ProspectCard({ prospect, index = 0 }: { prospect: ProspectView; index?: number }) {
  const top = prospect.signals.find(signal => signal.status !== 'ignore')
  return (
    <article className="card animate-rise p-4" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <Stamp tone={TEMPERATURE_TONE[prospect.temperature]}>{TEMPERATURE_LABEL[prospect.temperature]}</Stamp>
        <span className="tabular font-mono text-[11px] text-muted">{prospect.score}<span className="text-line">/100</span></span>
      </div>
      <h3 className="font-display mt-3 text-[20px] leading-tight">
        <Link href={`/prospects/${prospect.id}`} className="hover:text-red">{prospect.company}</Link>
      </h3>
      <p className="mt-0.5 text-[12px] text-muted">{prospect.city} · {prospect.headcount}</p>
      <p className="mt-2 text-[13px] text-ink-2">
        {prospect.contact.firstName} {prospect.contact.lastName} <span className="text-muted">· {prospect.contact.role}</span>
      </p>
      {top !== undefined && (
        <div className="mt-3 border-l-2 border-red pl-3">
          <SourceChip source={top.source} />
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug">{top.title}</p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        <span className="tabular whitespace-nowrap">{prospect.estimatedUnpaidKeur !== undefined ? `${formatKeur(prospect.estimatedUnpaidKeur)} en retard` : `${prospect.signals.length} signal${prospect.signals.length > 1 ? 'x' : ''}`}</span>
        <span className="whitespace-nowrap">{prospect.calls.length > 0 ? `${prospect.calls.length} appel${prospect.calls.length > 1 ? 's' : ''}` : relativeDay(prospect.updatedAt)}</span>
      </div>
    </article>
  )
}
