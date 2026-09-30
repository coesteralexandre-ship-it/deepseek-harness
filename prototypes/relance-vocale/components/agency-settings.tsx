'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import type { Agency } from '@/core/types'

/** The agency whose name Léa speaks in, and whose payroll the promises are measured against. */
export function AgencySettings({ agency }: { agency: Agency }) {
  const router = useRouter()
  const [form, setForm] = useState({ ...agency, weeklyPayrollEur: String(agency.weeklyPayrollEur) })
  const [state, setState] = useState<{ busy: boolean; notice?: { tone: 'ok' | 'error'; text: string } }>({ busy: false })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState({ busy: true })
    const payroll = Number(form.weeklyPayrollEur.replace(/[\s  €]/gu, '').replace(',', '.'))
    try {
      const response = await fetch('/api/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agency: { company: form.company, city: form.city, team: form.team, weeklyPayrollEur: payroll } }) })
      const data = (await response.json().catch(() => ({}))) as { updated?: number; error?: string }
      setState({ busy: false, notice: response.ok ? { tone: 'ok', text: `Enregistré. ${data.updated ?? 0} facture${(data.updated ?? 0) > 1 ? 's' : ''} ouverte${(data.updated ?? 0) > 1 ? 's' : ''} ${(data.updated ?? 0) > 1 ? 'portent' : 'porte'} désormais ce nom.` } : { tone: 'error', text: data.error ?? `Erreur ${response.status}` } })
      if (response.ok) router.refresh()
    } catch {
      setState({ busy: false, notice: { tone: 'error', text: 'Réseau indisponible, l’enregistrement n’a pas pu être confirmé. Réessayez.' } })
    }
  }

  const field = (key: 'company' | 'city' | 'team' | 'weeklyPayrollEur', label: string, hint: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input id={`agency-${key}`} className="field mt-1.5" required value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />
      <span className="mt-1 block text-[12px] text-faint">{hint}</span>
    </label>
  )

  return (
    <form onSubmit={submit} className="card card-blue grid gap-4 p-5 sm:grid-cols-2">
      {field('company', 'Nom de l’agence', 'Léa appelle et signe en son nom.')}
      {field('city', 'Ville', 'Dans la signature des emails.')}
      {field('team', 'Signature des emails', 'Par exemple « Service comptabilité clients ».')}
      {field('weeklyPayrollEur', 'Paie hebdomadaire (€)', 'La ligne rouge du registre des promesses.')}
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={state.busy}>{state.busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        {state.notice !== undefined && <span className={`text-[13.5px] font-semibold ${state.notice.tone === 'ok' ? 'text-emerald' : 'text-fuchsia'}`}>{state.notice.text}</span>}
      </div>
    </form>
  )
}
