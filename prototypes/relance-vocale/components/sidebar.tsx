'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Brand } from '@/components/brand'
import { AGENT_NAME } from '@/core/agent-prompt'

interface NavLink {
  href: string
  label: string
  /** Path prefixes that keep the link active on detail pages. */
  also?: string[]
  icon: string
}

const GROUPS: { label: string; links: NavLink[] }[] = [
  {
    label: 'Relance',
    links: [
      { href: '/', label: 'Pipeline', also: ['/factures'], icon: 'M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z' },
      { href: '/promesses', label: 'Promesses', icon: 'M5 12l4 4L19 7' },
      { href: '/journal', label: 'Journal', icon: 'M5 6h14M5 12h14M5 18h9' },
      { href: '/automatisations', label: 'Automatisations', icon: 'M13 3L5 14h6l-1 7 8-11h-6z' },
      { href: '/importer', label: 'Importer', icon: 'M12 4v11M7 10l5 5 5-5M5 20h14' },
      { href: '/rapprochement', label: 'Rapprochement', icon: 'M4 7h13l-3-3M20 17H7l3 3' },
    ],
  },
  {
    label: 'Prospection',
    links: [
      { href: '/pipeline', label: 'Prospects', also: ['/prospects'], icon: 'M16 11a4 4 0 1 0-8 0M4 20a8 8 0 0 1 16 0' },
      { href: '/signaux', label: 'Signaux', icon: 'M4 18a8 8 0 0 1 16 0M8 18a4 4 0 0 1 8 0M12 18h.01' },
    ],
  },
  {
    label: 'Agent et réglages',
    links: [
      { href: '/agent', label: AGENT_NAME, icon: 'M12 4v10M8 8v4M16 8v4M6 18h12' },
      { href: '/reglages', label: 'Réglages', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2' },
    ],
  },
]

function isActive(pathname: string, link: NavLink): boolean {
  if (link.href === '/') return pathname === '/' || (link.also ?? []).some(prefix => pathname.startsWith(prefix))
  return pathname.startsWith(link.href) || (link.also ?? []).some(prefix => pathname.startsWith(prefix))
}

interface Props {
  storeKind: 'memoire' | 'redis'
  /** Both agents and the API key are configured. */
  voiceReady: boolean
  /** An access code protects the app: show the sign-out action. */
  gated: boolean
  /** The reset wipes everything: shown only where it is allowed (development, or ALLOW_RESET=1). */
  resetAllowed: boolean
}

export function Sidebar({ storeKind, voiceReady, gated, resetAllowed }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function reset() {
    if (!window.confirm('Tout remettre à zéro ? Prospects, factures, appels et promesses seront remplacés par le jeu de départ.')) return
    setBusy('reset')
    try {
      await fetch('/api/reset', { method: 'POST' })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function signOut() {
    setBusy('out')
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/connexion')
  }

  return (
    <aside className="print-hidden bg-ink text-[#c9cfe3] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <div className="flex items-center justify-between gap-4 px-5 py-4 lg:px-6 lg:py-7">
        <Link href="/"><Brand inverted /></Link>
        <span className={`pill lg:hidden ${voiceReady ? 'pill-ok' : 'pill-warn'}`}>{voiceReady ? `${AGENT_NAME} prête` : 'À configurer'}</span>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:gap-6 lg:overflow-visible lg:px-4 lg:pb-0">
        {GROUPS.map(group => (
          <div key={group.label} className="flex gap-1 lg:flex-col lg:gap-0.5">
            <p className="hidden px-2.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#8f98b8] lg:block">{group.label}</p>
            {group.links.map(link => {
              const active = isActive(pathname, link)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 whitespace-nowrap px-2.5 py-2 text-[14px] font-medium transition-colors ${active ? 'bg-blue font-semibold text-white' : 'text-[#c9cfe3] hover:bg-white/5 hover:text-white'}`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={link.icon} />
                  </svg>
                  {link.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="hidden space-y-3 border-t border-white/10 px-6 py-5 lg:block">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 rounded-full ${voiceReady ? 'bg-emerald-vivid shadow-[0_0_10px_2px_rgba(1,165,76,0.55)]' : 'bg-ochre-vivid'}`} />
          <div>
            <p className="text-[12px] font-semibold text-white">{voiceReady ? `${AGENT_NAME} en ligne` : `${AGENT_NAME} à configurer`}</p>
            <p className="text-[11px] text-[#8f98b8]">{storeKind === 'redis' ? 'Données : Redis' : 'Données : mémoire, jeu de test'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
          {resetAllowed && <button type="button" onClick={reset} disabled={busy !== null} className="text-[#8f98b8] hover:text-white disabled:opacity-40">{busy === 'reset' ? 'Remise à zéro…' : 'Réinitialiser'}</button>}
          {gated && <button type="button" onClick={signOut} disabled={busy !== null} className="text-[#8f98b8] hover:text-white disabled:opacity-40">Se déconnecter</button>}
        </div>
      </div>
    </aside>
  )
}
