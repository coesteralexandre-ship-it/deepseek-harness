'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { PRODUCT_NAME } from '@/core/agent-prompt'

const LINKS = [
  { href: '/', label: 'Pipeline' },
  { href: '/signaux', label: 'Signaux' },
  { href: '/agent', label: 'Agent' },
] as const

export function Masthead({ storeKind }: { storeKind: 'memoire' | 'redis' }) {
  const pathname = usePathname()
  const router = useRouter()
  const [resetting, setResetting] = useState(false)

  async function reset() {
    setResetting(true)
    try {
      await fetch('/api/reset', { method: 'POST' })
      router.refresh()
    } finally {
      setResetting(false)
    }
  }

  return (
    <header className="mx-auto max-w-[1440px] px-5 pt-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
        <Link href="/" className="group flex items-baseline gap-3">
          <span className="font-display text-4xl leading-none tracking-tight">
            {PRODUCT_NAME}
            <span className="text-red">.</span>
          </span>
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-muted sm:inline">
            relance vocale · agences d’intérim
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em]">
          {LINKS.map(link => {
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 transition-colors ${active ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'}`}
              >
                {link.label}
              </Link>
            )
          })}
          <button type="button" onClick={reset} disabled={resetting} className="ml-3 px-3 py-2 text-muted hover:text-red disabled:opacity-40">
            {resetting ? 'Remise à zéro…' : 'Réinitialiser'}
          </button>
        </nav>
      </div>
      <div className="rule flex items-center justify-between pt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
        <span>{storeKind === 'redis' ? 'Données : Upstash Redis' : 'Données : mémoire (jeu de test, non persistant)'}</span>
        <span className="hidden sm:inline">Signal → Pipeline → Appel</span>
      </div>
    </header>
  )
}
