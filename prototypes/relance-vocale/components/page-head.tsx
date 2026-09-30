import type { ReactNode } from 'react'

/** Top of an internal page: eyebrow, headline, one line of context, actions on the right. */
export function PageHead({ eyebrow, title, lead, children }: { eyebrow: string; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="animate-rise flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pb-8 pt-2">
      <div className="min-w-0 max-w-3xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="font-display mt-4 text-[36px] leading-[1.02] sm:text-[48px]">{title}</h1>
        {lead !== undefined && <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-muted">{lead}</p>}
      </div>
      {children !== undefined && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}
