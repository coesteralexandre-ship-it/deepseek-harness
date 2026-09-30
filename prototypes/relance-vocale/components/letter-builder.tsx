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
    <div className="py-8">
      <div className="print-hidden flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/prospects/${prospectId}`} className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted hover:text-ink">← {company}</Link>
          <h1 className="font-display mt-2 text-[36px] leading-[0.95] tracking-tight">Lettre + QR code</h1>
          <p className="mt-2 max-w-xl text-[14px] text-ink-2">
            Le QR code ouvre <span className="font-mono text-[12px]">{landingUrl}</span> : le prospect parle à Léa ou se fait rappeler, et son scan devient un signal dans le pipeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={busy !== null} onClick={() => regenerate('generate')}>Modèle</button>
          <button type="button" className="btn" disabled={busy !== null || !llm} title={llm ? '' : 'Renseigner DEEPSEEK_API_KEY'} onClick={() => regenerate('polish')}>
            {busy === 'polish' ? 'Réécriture…' : 'Réécrire avec l’IA'}
          </button>
          <button type="button" className="btn" disabled={busy !== null} onClick={copy}>Copier</button>
          <button type="button" className="btn" disabled={busy !== null || !dirty} onClick={save}>{busy === 'save' ? 'Enregistrement…' : dirty ? 'Enregistrer' : 'Enregistrée'}</button>
          <button type="button" className="btn btn-solid" onClick={() => window.print()}>Imprimer / PDF</button>
        </div>
      </div>
      {notice !== null && <p className="print-hidden mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-red">{notice}</p>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(320px,0.8fr)_auto]">
        <label className="print-hidden block">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Texte (un paragraphe par bloc)</span>
          <textarea
            className="field mt-2 min-h-[560px] resize-y border border-line p-3 font-mono text-[12px] leading-relaxed"
            value={text}
            onChange={event => setText(event.target.value)}
          />
        </label>

        <div className="overflow-auto">
          <article id="letter-sheet" className="sheet-a4 relative animate-rise">
            <header className="flex items-start justify-between">
              <div>
                <p className="font-display text-[28px] leading-none tracking-tight">
                  {PRODUCT_NAME}
                  <span className="text-red">.</span>
                </p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted">relance vocale · agences d’intérim</p>
              </div>
              <div className="w-[34mm] text-center">
                <div className="mx-auto w-[30mm]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.14em] text-ink-2">Scannez pour m’entendre</p>
              </div>
            </header>
            <div className="mt-[14mm] space-y-[5mm]">
              {paragraphs.map((paragraph, index) => (
                <p key={index} className={`whitespace-pre-line ${index === 0 ? 'text-[10.5pt] text-ink-2' : ''} ${paragraph.startsWith('Objet') ? 'font-semibold' : ''}`}>
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
