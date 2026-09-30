'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** Switch between the demo autopilot and the real one, which only prepares. */
export function AutopilotMode({ mode }: { mode: 'demo' | 'reel' }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function set(next: 'demo' | 'reel') {
    setBusy(true)
    await fetch('/api/autopilot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'mode', autopilot: next }) })
    setBusy(false)
    router.refresh()
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Mode de l’autopilote">
      {([
        { id: 'demo', title: 'Démo', text: 'Tout s’exécute seul : Léa « appelle », les emails « partent » et les clients répondent selon leur profil. Rien ne sort de l’application.' },
        { id: 'reel', title: 'Réel', text: 'Léa prépare les brouillons et la file d’appels à l’heure dite. Rien ne part sans vous : vous envoyez, vous lancez l’appel, vous confirmez le virement.' },
      ] as const).map(option => (
        <button key={option.id} type="button" role="radio" aria-checked={mode === option.id} disabled={busy} onClick={() => set(option.id)} className={`card p-4 text-left transition-colors ${mode === option.id ? 'card-blue !border-blue' : 'hover:border-line-2'}`}>
          <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
            <span className={`grid h-4 w-4 place-items-center rounded-full border ${mode === option.id ? 'border-blue' : 'border-line-2'}`}>{mode === option.id && <span className="h-2 w-2 rounded-full bg-blue" />}</span>
            {option.title}
          </span>
          <span className="mt-2 block text-[13px] leading-relaxed text-muted">{option.text}</span>
        </button>
      ))}
    </div>
  )
}
