import type { Actor } from '@/core/types'

const ACTORS: Record<Actor, { label: string; initial: string; className: string }> = {
  lea: { label: 'Léa', initial: 'L', className: 'bg-blue text-white' },
  autopilote: { label: 'Autopilote', initial: '⚡', className: 'bg-ink text-ochre-vivid' },
  vous: { label: 'Vous', initial: 'V', className: 'bg-ochre-vivid text-ink' },
  client: { label: 'Client', initial: 'C', className: 'bg-emerald-soft text-emerald' },
}

export function actorLabel(actor: Actor): string {
  return ACTORS[actor].label
}

/** Round avatar of whoever acted: Léa, the autopilot, your team, or the debtor. */
export function ActorBadge({ actor, size = 'md' }: { actor: Actor; size?: 'sm' | 'md' }) {
  const meta = ACTORS[actor]
  return (
    <span title={meta.label} className={`inline-grid shrink-0 place-items-center rounded-full font-bold leading-none ${size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-7 w-7 text-[12px]'} ${meta.className}`}>
      {meta.initial}
    </span>
  )
}
