'use client'

import { useState, type FormEvent } from 'react'

export function LoginForm({ next }: { next: string }) {
  const [code, setCode] = useState('')
  const [state, setState] = useState<'idle' | 'sending'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('sending')
    setError(null)
    const response = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) })
    if (!response.ok) {
      const data = (await response.json().catch(() => undefined)) as { error?: string } | undefined
      setError(data?.error ?? `Erreur ${response.status}`)
      setState('idle')
      return
    }
    window.location.assign(next)
  }

  return (
    <form onSubmit={submit} className="card card-blue mt-8 p-6">
      <label className="block">
        <span className="label">Code d’accès</span>
        <input id="access-code" type="password" autoComplete="current-password" required autoFocus className="field mt-1.5 font-mono" value={code} onChange={event => setCode(event.target.value)} />
      </label>
      <button type="submit" className="btn btn-primary mt-4 w-full" disabled={state === 'sending'}>{state === 'sending' ? 'Vérification…' : 'Entrer'}</button>
      {error !== null && <p className="mt-3 text-[13px] text-fuchsia">{error}</p>}
    </form>
  )
}
