'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { PRODUCT_NAME } from '@/core/agent-prompt'

interface Props {
  prospectId: string
  company: string
  initialText: string
  /** True when the text comes from a saved edit rather than the template. */
  saved: boolean
  /** Inline SVG of the QR code pointing to the public page. */
  qrSvg: string
  landingUrl: string
  /** DEEPSEEK_API_KEY is set: the rewrite button is enabled. */
  llm: boolean
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data: unknown = await response.json().catch(() => undefined)
  if (response.ok) return { ok: true, data }
  const error = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : `Erreur ${response.status}`
  return { ok: false, error }
}

export function LetterBuilder({ prospectId, company, initialText, saved, qrSvg, landingUrl, llm }: Props) {
  const router = useRouter()
  const [text, setText] = useState(initialText)
  const [persisted, setPersisted] = useState(saved ? initialText : null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const paragraphs = text.split(/\n{2,}/).map(block => block.trim()).filter(block => block !== '')
  const dirty = persisted !== text

  async function save() {
    setBusy('save')
    setNotice(null)
    try {
      const response = await fetch(`/api/prospects/${prospectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ letter: text }),
      })
      if (!response.ok) {
        setNotice(`Enregistrement refusé (${response.status})`)
        return
      }
      setPersisted(text)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function regenerate(action: 'generate' | 'polish') {
    setBusy(action)
    setNotice(null)
    try {
      const result = await postJson(`/api/prospects/${prospectId}/letter`, { action, text })
      const data = result.data as { text?: string } | undefined
      if (!result.ok || data?.text === undefined) {
        setNotice(result.error ?? 'Génération impossible')
        return
      }
      setText(data.text)
    } finally {
      setBusy(null)
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(text)
    setNotice('Texte copié.')
  }

  return (
    <div>
      <div className="print-hidden flex flex-wrap items-end justify-between gap-5 pb-8 pt-2">
        <div className="min-w-0 max-w-2xl">
          <Link href={`/prospects/${prospectId}`} className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint hover:text-ink">← {company}</Link>
          <h1 className="font-display mt-4 text-[34px] leading-[1.05] sm:text-[44px]">La lettre qui <span className="accent">se fait entendre.</span></h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
            Le QR code ouvre <span className="break-all font-mono text-[12px] text-blue">{landingUrl}</span> : le prospect parle à Léa ou se fait rappeler, et son scan devient un signal dans le pipeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => regenerate('generate')}>Modèle</button>
          <button type="button" className="btn btn-sm" disabled={busy !== null || !llm} title={llm ? '' : 'Renseigner DEEPSEEK_API_KEY'} onClick={() => regenerate('polish')}>
            {busy === 'polish' ? 'Réécriture…' : 'Réécrire avec l’IA'}
          </button>
          <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={copy}>Copier</button>
          <button type="button" className="btn btn-sm" disabled={busy !== null || !dirty} onClick={save}>{busy === 'save' ? 'Enregistrement…' : dirty ? 'Enregistrer' : 'Enregistrée'}</button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>Imprimer / PDF</button>
        </div>
      </div>
      {notice !== null && <p className="print-hidden mb-4 rounded-lg border border-line bg-sunk px-3 py-2 text-[13px] text-ink-2">{notice}</p>}

      <div className="grid gap-8 xl:grid-cols-[minmax(320px,0.8fr)_auto]">
        <label className="print-hidden block">
          <span className="label">Texte, un paragraphe par bloc</span>
          <textarea
            id="letter-text"
            className="field mt-2 min-h-[560px] resize-y font-mono text-[12.5px] leading-relaxed"
            value={text}
            onChange={event => setText(event.target.value)}
          />
        </label>

        <div className="overflow-auto pb-6">
          <article id="letter-sheet" className="sheet-a4 relative animate-rise">
            <header className="flex items-start justify-between">
              <div>
                <p className="flex items-center gap-[3mm] text-[22px] font-extrabold leading-none tracking-tight">
                  <svg viewBox="0 0 32 32" className="h-[9mm] w-[9mm]" aria-hidden="true">
                    <rect width="32" height="32" rx="8" fill="#1634ef" />
                    <path d="M9 10h14M9 16h10M9 22h14" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
                    <circle cx="23.5" cy="16" r="2.2" fill="#01a54c" />
                  </svg>
                  {PRODUCT_NAME}
                </p>
                <p className="mt-[2.5mm] font-mono text-[8.5px] uppercase tracking-[0.18em] text-[#5d6373]">relance vocale · agences d’intérim</p>
              </div>
              <div className="w-[34mm] text-center">
                <div className="mx-auto w-[30mm]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.14em] text-[#1634ef]">Scannez pour m’entendre</p>
              </div>
            </header>
            <div className="mt-[14mm] space-y-[5mm]">
              {paragraphs.map((paragraph, index) => (
                <p key={index} className={`whitespace-pre-line ${index === 0 ? 'text-[10.5pt] text-[#212b44]' : ''} ${paragraph.startsWith('Objet') ? 'font-bold' : ''}`}>
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}
