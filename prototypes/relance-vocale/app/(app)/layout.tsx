import type { ReactNode } from 'react'
import { Masthead } from '@/components/masthead'
import { getStore } from '@/core/store'

/** Internal pages: masthead with navigation, hidden when printing a letter. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Masthead storeKind={getStore().kind} />
      <main className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-8">{children}</main>
    </>
  )
}
