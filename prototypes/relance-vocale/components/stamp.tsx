import type { Tone } from '@/core/stages'

export function Stamp({ tone, children, animate = false, className = '' }: { tone: Tone; children: React.ReactNode; animate?: boolean; className?: string }) {
  return (
    <span className={`stamp stamp-${tone} ${animate ? 'animate-stamp' : ''} ${className}`}>{children}</span>
  )
}
