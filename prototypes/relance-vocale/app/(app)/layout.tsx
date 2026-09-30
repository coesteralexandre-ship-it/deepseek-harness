import type { ReactNode } from 'react'
import { Sidebar } from '@/components/sidebar'
import { accessCode, elevenLabsEnv } from '@/core/env'
import { getStore } from '@/core/store'

/** Internal pages: navigation on the left, hidden when printing a letter. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const env = elevenLabsEnv()
  const voiceReady = env.apiKey !== undefined && env.agentId !== undefined && env.relanceAgentId !== undefined
  return (
    <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <Sidebar storeKind={getStore().kind} voiceReady={voiceReady} gated={accessCode() !== undefined} />
      <main className="mx-auto w-full max-w-[1720px] px-5 pb-24 pt-8 sm:px-8 lg:px-10 lg:pt-10">{children}</main>
    </div>
  )
}
