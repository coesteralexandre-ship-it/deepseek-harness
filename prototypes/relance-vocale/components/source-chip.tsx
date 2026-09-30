import { SOURCE_META } from '@/core/signals'
import type { SignalSource } from '@/core/types'

export function SourceChip({ source }: { source: SignalSource }) {
  const meta = SOURCE_META[source]
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-2">
      <span className="grid h-4 min-w-4 place-items-center border border-ink-2 px-1 text-[9px] leading-none">{meta.glyph}</span>
      {meta.label}
    </span>
  )
}

/** Five dots, `weight` of them filled. */
export function WeightDots({ weight }: { weight: number }) {
  return (
    <span className="font-mono text-[10px] tracking-[0.2em] text-ink-2" aria-label={`poids ${weight} sur 5`}>
      {'●'.repeat(weight)}
      <span className="text-line">{'●'.repeat(5 - weight)}</span>
    </span>
  )
}
