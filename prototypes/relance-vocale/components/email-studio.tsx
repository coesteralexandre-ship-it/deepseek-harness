'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { EmailDraft, EmailKind } from '@/core/types'

interface Props {
  invoiceId: string
  emails: EmailDraft[]
  kinds: { kind: EmailKind; label: string; hint: string }[]
  /** DEEPSEEK_API_KEY is set: the rewrite button works. */
  llm: boolean
}

async function call(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<string | null> {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (response.ok) return null
  const data = (await response.json().catch(() => undefined)) as { error?: string } | undefined
  return data?.error ?? `Erreur ${response.status}`
}

function when(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/**
 * Drafts and sent emails of one invoice. Nothing leaves from here: the person
 * sends from their own mailbox (the button opens it prefilled), then marks it sent.
 */
export function EmailStudio({ invoiceId, emails, kinds, llm }: Props) {
  const router = useRouter()
  const ordered = [...emails].reverse()
  const [selected, setSelected] = useState<string | undefined>(ordered.find(email => email.status === 'brouillon')?.id ?? ordered[0]?.id)
  const current = emails.find(email => email.id === selected)
  const [subject, setSubject] = useState(current?.subject ?? '')
  const [body, setBody] = useState(current?.body ?? '')
  const [kind, setKind] = useState<EmailKind>(kinds[0]?.kind ?? 'rappel')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    setSubject(current?.subject ?? '')
    setBody(current?.body ?? '')
  }, [current?.id, current?.subject, current?.body])

  useEffect(() => {
    if (selected === undefined || !emails.some(email => email.id === selected)) setSelected([...emails].reverse().find(email => email.status === 'brouillon')?.id ?? emails[emails.length - 1]?.id)
  }, [emails, selected])

  async function act(key: string, task: () => Promise<string | null>, success?: string) {
    setBusy(key)
    setNotice(null)
    const error = await task()
    setBusy(null)
    setNotice(error !== null ? { tone: 'error', text: error } : success !== undefined ? { tone: 'ok', text: success } : null)
    if (error === null) router.refresh()
  }

  const draft = current?.status === 'brouillon'
  const dirty = draft && (subject !== current.subject || body !== current.body)
  const mailto = current === undefined ? '#' : `mailto:${current.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="label">Emails</p>
          <h2 className="font-display mt-1 text-[20px] leading-tight">Brouillons prêts à partir</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select id={`email-kind-${invoiceId}`} className="field !w-auto !py-2 text-[13px]" value={kind} onChange={event => setKind(event.target.value as EmailKind)} aria-label="Type d’email">
            {kinds.map(option => <option key={option.kind} value={option.kind}>{option.label}</option>)}
          </select>
          <button type="button" className="btn btn-sm btn-ink" disabled={busy !== null} onClick={() => act('new', () => call(`/api/invoices/${invoiceId}/emails`, 'POST', { kind }), 'Brouillon préparé.')}>
            {busy === 'new' ? 'Préparation…' : 'Préparer'}
          </button>
        </div>
      </div>

      {emails.length === 0
        ? <p className="px-5 py-6 text-[13.5px] text-muted">Aucun email pour l’instant. La séquence en prépare un le lendemain de l’échéance.</p>
        : (
          <div className="grid md:grid-cols-[250px_minmax(0,1fr)]">
            <ol className="max-h-[440px] divide-y divide-line overflow-y-auto border-b border-line md:border-b-0 md:border-r">
              {ordered.map(email => (
                <li key={email.id}>
                  <button type="button" onClick={() => setSelected(email.id)} className={`block w-full px-4 py-3 text-left transition-colors ${email.id === selected ? 'bg-blue-mist' : 'hover:bg-sunk'}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`pill !py-[3px] !text-[10px] ${email.status === 'brouillon' ? 'pill-amethyst' : 'pill-ok'}`}>{email.status === 'brouillon' ? 'Brouillon' : email.simulated === true ? 'Envoyé · démo' : 'Envoyé'}</span>
                      <span className="text-[11px] text-faint">{when(email.sentAt ?? email.createdAt)}</span>
                    </span>
                    <span className="mt-1.5 line-clamp-2 block text-[13px] font-semibold leading-snug text-ink">{email.subject}</span>
                  </button>
                </li>
              ))}
            </ol>

            {current !== undefined && (
              <div className="min-w-0 p-5">
                <p className="text-[12.5px] text-muted">À <span className="font-mono text-[12px] text-ink-2">{current.to}</span></p>
                {draft
                  ? (
                    <>
                      <input id={`email-subject-${current.id}`} className="field mt-3 font-semibold" value={subject} onChange={event => setSubject(event.target.value)} aria-label="Objet" />
                      <textarea id={`email-body-${current.id}`} className="field mt-2 min-h-[260px] resize-y text-[13.5px] leading-relaxed" value={body} onChange={event => setBody(event.target.value)} aria-label="Message" />
                    </>
                  )
                  : (
                    <>
                      <p className="mt-3 text-[15px] font-semibold text-ink">{current.subject}</p>
                      <p className="mt-2 whitespace-pre-line rounded-md bg-sunk p-4 text-[13.5px] leading-relaxed text-ink-2">{current.body}</p>
                    </>
                  )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {draft && (
                    <>
                      <a href={mailto} className="btn btn-sm btn-primary">Ouvrir dans ma messagerie</a>
                      <button type="button" className="btn btn-sm btn-success" disabled={busy !== null} onClick={() => act('sent', () => call(`/api/invoices/${invoiceId}/emails`, 'PATCH', { emailId: current.id, action: 'sent', subject, body }), 'Marqué comme envoyé : la carte avance.')}>Marquer comme envoyé</button>
                      {dirty && <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => act('save', () => call(`/api/invoices/${invoiceId}/emails`, 'PATCH', { emailId: current.id, action: 'save', subject, body }), 'Enregistré.')}>Enregistrer</button>}
                      <button type="button" className="btn btn-sm" disabled={busy !== null || !llm} title={llm ? '' : 'Renseigner DEEPSEEK_API_KEY'} onClick={() => act('polish', () => call(`/api/invoices/${invoiceId}/emails`, 'PATCH', { emailId: current.id, action: 'polish', subject, body }))}>{busy === 'polish' ? 'Réécriture…' : 'Réécrire avec l’IA'}</button>
                      <button type="button" className="btn btn-sm btn-danger" disabled={busy !== null} onClick={() => act('delete', () => call(`/api/invoices/${invoiceId}/emails`, 'PATCH', { emailId: current.id, action: 'delete' }))}>Supprimer</button>
                    </>
                  )}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={async () => { await navigator.clipboard.writeText(`${subject}\n\n${body}`); setNotice({ tone: 'ok', text: 'Copié.' }) }}>Copier</button>
                </div>
                {notice !== null && <p className={`mt-3 text-[13px] ${notice.tone === 'ok' ? 'text-emerald' : 'text-fuchsia'}`}>{notice.text}</p>}
                {draft && <p className="mt-3 text-[12px] leading-relaxed text-faint">Rien ne part d’ici : l’email s’ouvre dans votre messagerie, vous l’envoyez, puis vous le marquez envoyé.</p>}
              </div>
            )}
          </div>
        )}
    </div>
  )
}
