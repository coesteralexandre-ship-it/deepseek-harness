import type { ReactNode } from 'react'
import { Brand } from '@/components/brand'

/** Pages seen from outside (prospect, debtor): wordmark only, no way into the app. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="mx-auto flex max-w-[920px] items-center justify-between gap-4 px-5 pt-7 sm:px-8">
        <Brand />
        <span className="pill pill-neutral">Vous parlez à une IA</span>
      </header>
      <main className="mx-auto max-w-[920px] px-5 pb-24 sm:px-8">{children}</main>
    </>
  )
}
