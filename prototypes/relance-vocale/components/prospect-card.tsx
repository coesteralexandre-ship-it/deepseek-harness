import Link from 'next/link'
import { Pill } from '@/components/pill'
import { SourceChip } from '@/components/source-chip'
import { formatKeur, relativeDay } from '@/core/format'
import type { Tone } from '@/core/stages'
import type { ProspectView, Temperature } from '@/core/types'

const TEMPERATURE_TONE: Record<Temperature, Tone> = { chaud: 'hot', tiede: 'warn', froid: 'mute' }
const TEMPERATURE_LABEL: Record<Temperature, string> = { chaud: 'chaud', tiede: 'tiède', froid: 'froid' }

export function ProspectCard({ prospect, index = 0 }: { prospect: ProspectView; index?: number }) {
  const top = prospect.signals.find(signal => signal.status !== 'ignore')
  return (
    <article className="card animate-rise p-4 transition-colors hover:border-blue-2/50" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
      <div className="flex items-center justify-between gap-3">
        <Pill tone={TEMPERATURE_TONE[prospect.temperature]}>{TEMPERATURE_LABEL[prospect.temperature]}</Pill>
        <span className="tabular font-mono text-[12px] text-ink">{prospect.score}<span className="text-faint">/100</span></span>
      </div>
      <h3 className="mt-3 text-[17px] font-bold leading-tight tracking-tight text-ink">
        <Link href={`/prospects/${prospect.id}`} className="hover:text-blue">{prospect.company}</Link>
      </h3>
      <p className="mt-0.5 text-[12px] text-faint">{prospect.city} · {prospect.headcount}</p>
      <p className="mt-2 text-[13px] text-ink-2">
        {`${prospect.contact.firstName} ${prospect.contact.lastName}`.trim() || 'Dirigeant non publié'} <span className="text-faint">· {prospect.contact.role}</span>
      </p>
      {top !== undefined && (
        <div className="mt-3 rounded-lg border border-line bg-sunk/70 p-2.5">
          <SourceChip source={top.source} />
          <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-ink-2">{top.title}</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
        <span className="tabular whitespace-nowrap">{prospect.estimatedUnpaidKeur !== undefined ? `≈ ${formatKeur(prospect.estimatedUnpaidKeur)} en retard` : `${prospect.signals.length} ${prospect.signals.length > 1 ? 'signaux' : 'signal'}`}</span>
        <span className="whitespace-nowrap">{prospect.calls.length > 0 ? `${prospect.calls.length} appel${prospect.calls.length > 1 ? 's' : ''}` : relativeDay(prospect.updatedAt)}</span>
      </div>
    </article>
  )
}
