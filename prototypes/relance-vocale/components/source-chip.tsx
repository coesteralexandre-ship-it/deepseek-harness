import { SOURCE_META } from '@/core/signals'
import type { SignalSource } from '@/core/types'

export function SourceChip({ source }: { source: SignalSource }) {
  const meta = SOURCE_META[source]
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
      <span className="grid h-[18px] min-w-[18px] place-items-center rounded border border-line-2 bg-sunk px-1 text-[9px] leading-none text-blue">{meta.glyph}</span>
      {meta.label}
    </span>
  )
}

/** Five dots, `weight` of them filled. */
export function WeightDots({ weight }: { weight: number }) {
  return (
    <span className="inline-flex gap-[3px]" aria-label={`poids ${weight} sur 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={`h-1.5 w-1.5 rounded-full ${index < weight ? 'bg-blue' : 'bg-line-2'}`} />
      ))}
    </span>
  )
}
