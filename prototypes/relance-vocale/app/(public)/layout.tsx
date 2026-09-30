import type { ReactNode } from 'react'
import { PRODUCT_NAME } from '@/core/agent-prompt'

/** Prospect-facing pages: wordmark only, no navigation into the pipeline. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="mx-auto max-w-[880px] px-5 pt-8 sm:px-8">
        <div className="rule flex items-baseline justify-between pb-3">
          <span className="font-display text-3xl leading-none tracking-tight">
            {PRODUCT_NAME}
            <span className="text-red">.</span>
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Vous parlez à une IA</span>
        </div>
      </header>
      <main className="mx-auto max-w-[880px] px-5 pb-24 sm:px-8">{children}</main>
    </>
  )
}
