import { PRODUCT_NAME } from '@/core/agent-prompt'

/** Wordmark: three ledger lines, the middle one cut short by an ochre dot (the promise). */
export function Brand({ size = 'md', inverted = false }: { size?: 'md' | 'lg'; inverted?: boolean }) {
  const box = size === 'lg' ? 'h-9 w-9' : 'h-7 w-7'
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className={`${box} shrink-0`} aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#1634ef" />
        <path d="M9 10h14M9 16h9M9 22h14" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="23" cy="16" r="2.4" fill="#ffd468" />
      </svg>
      <span className={`font-display leading-none ${size === 'lg' ? 'text-[24px]' : 'text-[19px]'} ${inverted ? 'text-white' : ''}`} style={inverted ? { color: '#fff' } : undefined}>{PRODUCT_NAME}</span>
    </span>
  )
}
