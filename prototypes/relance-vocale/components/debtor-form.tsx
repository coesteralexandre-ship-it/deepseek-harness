'use client'

import { useState, type FormEvent } from 'react'

type Answer = 'promesse' | 'litige' | 'contact' | 'rappel'

const OPTIONS: { id: Answer; title: string; hint: string }[] = [
  { id: 'promesse', title: 'Je paie à une date précise', hint: 'Choisissez le jour. Vous recevez un rappel la veille.' },
  { id: 'litige', title: 'Il manque une pièce ou je conteste', hint: 'Relevé d’heures, contrat, montant : dites-nous ce qui bloque.' },
  { id: 'contact', title: 'Ce n’est pas moi', hint: 'Indiquez la bonne personne, on ne vous rappellera plus.' },
  { id: 'rappel', title: 'Rappelez-moi', hint: 'Donnez le créneau qui vous convient.' },
]

/** `day` (AAAA-MM-JJ) moved `days` ahead, in UTC like the server's bounds. */
function dayPlus(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * The debtor's one-minute answer: no account, one choice, one field.
 * `dates` are the payment days the server accepts, from the workspace clock.
 */
export function DebtorForm({ token, creditor, promise, dates }: { token: string; creditor: string; promise?: { id: string; amount: string; day: string }; dates: { min: string; max: string } }) {
  const [answer, setAnswer] = useState<Answer>('promesse')
  const [date, setDate] = useState(() => dayPlus(dates.min, 3))
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [other, setOther] = useState(false)

  async function confirm() {
    if (promise === undefined) return
    setState('sending')
    const response = await fetch(`/api/f/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: 'confirmer', promiseId: promise.id }) })
    setState('idle')
    if (response.ok) setConfirmed(true)
    else setError('La confirmation n’a pas pu être enregistrée.')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('sending')
    setError(null)
    const body = answer === 'promesse' ? { answer, date }
      : answer === 'litige' ? { answer, reason: text }
        : answer === 'contact' ? { answer, contact: text }
          : { answer, when: text }
    const response = await fetch(`/api/f/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!response.ok) {
      const data = (await response.json().catch(() => undefined)) as { error?: string } | undefined
      setError(data?.error ?? `Erreur ${response.status}`)
      setState('idle')
      return
    }
    setState('sent')
  }

  if (state === 'sent') {
    return (
      <div className="card card-emerald p-6">
        <p className="label text-emerald">Réponse transmise</p>
        <p className="font-display mt-2 text-[22px] leading-tight">Merci. {creditor} a bien reçu votre réponse.</p>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          {answer === 'promesse' ? 'La date est notée : plus aucun appel d’ici là, et un rappel la veille.' : answer === 'litige' ? 'Un membre de l’équipe vous rappelle avec la pièce qui manque.' : answer === 'contact' ? 'Nous contactons la personne indiquée.' : 'Nous vous rappelons au créneau indiqué.'}
        </p>
      </div>
    )
  }

  if (promise !== undefined && !other) {
    return (
      <div className="card card-ochre p-6">
        <p className="label">Ce que nous avons noté</p>
        <p className="font-display mt-2 text-[24px] leading-tight">{promise.amount} le {promise.day}</p>
        {confirmed
          ? <p className="mt-3 text-[14.5px] font-semibold text-emerald">Merci, c’est confirmé. Plus aucune relance d’ici là.</p>
          : (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" disabled={state === 'sending'} onClick={confirm}>C’est exact, je confirme</button>
              <button type="button" className="btn" onClick={() => { setError(null); setOther(true) }}>Ce n’est pas ça</button>
            </div>
          )}
        {error !== null && <p className="mt-3 text-[13px] text-fuchsia">{error}</p>}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <fieldset className="grid gap-2.5 sm:grid-cols-2">
        <legend className="sr-only">Votre réponse</legend>
        {OPTIONS.map(option => (
          <label key={option.id} className={`card cursor-pointer p-4 transition-colors ${answer === option.id ? 'card-blue bg-blue/10' : 'hover:border-line-2'}`}>
            <input type="radio" name="answer" value={option.id} checked={answer === option.id} onChange={() => { setAnswer(option.id); setText('') }} className="sr-only" />
            <span className="flex items-center gap-2.5">
              <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${answer === option.id ? 'border-blue' : 'border-line-2'}`}>
                {answer === option.id && <span className="h-2 w-2 rounded-full bg-blue" />}
              </span>
              <span className="text-[15px] font-semibold text-ink">{option.title}</span>
            </span>
            <span className="mt-1.5 block pl-[26px] text-[13px] leading-snug text-muted">{option.hint}</span>
          </label>
        ))}
      </fieldset>

      <div className="card p-4">
        {answer === 'promesse' && (
          <label className="block">
            <span className="label">Date du virement</span>
            <input id="debtor-date" type="date" required min={dates.min} max={dates.max} className="field tabular mt-1.5" value={date} onChange={event => setDate(event.target.value)} />
          </label>
        )}
        {answer === 'litige' && (
          <label className="block">
            <span className="label">Ce qui bloque</span>
            <textarea id="debtor-reason" required minLength={3} rows={3} className="field mt-1.5 resize-y" placeholder="Exemple : le relevé d’heures de la semaine 36 n’est pas signé." value={text} onChange={event => setText(event.target.value)} />
          </label>
        )}
        {answer === 'contact' && (
          <label className="block">
            <span className="label">La bonne personne</span>
            <input id="debtor-contact" required minLength={3} className="field mt-1.5" placeholder="Nom, fonction ou adresse email" value={text} onChange={event => setText(event.target.value)} />
          </label>
        )}
        {answer === 'rappel' && (
          <label className="block">
            <span className="label">Quand vous rappeler</span>
            <input id="debtor-when" required minLength={2} className="field mt-1.5" placeholder="Exemple : jeudi entre 14 h et 16 h" value={text} onChange={event => setText(event.target.value)} />
          </label>
        )}
        <button type="submit" className="btn btn-primary mt-4 w-full sm:w-auto" disabled={state === 'sending'}>{state === 'sending' ? 'Envoi…' : `Envoyer à ${creditor}`}</button>
        {error !== null && <p className="mt-3 text-[13px] text-fuchsia">{error}</p>}
      </div>
    </form>
  )
}
