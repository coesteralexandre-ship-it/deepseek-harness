'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CopyButton } from '@/components/copy-button'
import { AGENT_NAME } from '@/core/agent-prompt'
import type { AudioFormat } from '@/core/types'

interface Props {
  prospectId: string
  firstName: string
  email?: string
  phone: string
  landingUrl: string
  letterUrl: string
  script: string
  audioReady: Record<AudioFormat, boolean>
  publicAudioUrl: Record<AudioFormat, string>
  capabilities: { tts: boolean; llm: boolean; lemlist: boolean; whatsapp: boolean }
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data: unknown = await response.json().catch(() => undefined)
  if (response.ok) return { ok: true, data }
  const error = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : `Erreur ${response.status}`
  return { ok: false, error }
}

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rule pt-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{hint}</p>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function OutreachPanel({ prospectId, firstName, email, phone, landingUrl, letterUrl, script: initialScript, audioReady, publicAudioUrl, capabilities }: Props) {
  const router = useRouter()
  const [script, setScript] = useState(initialScript)
  const [ready, setReady] = useState(audioReady)
  const [playerKey, setPlayerKey] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [leadEmail, setLeadEmail] = useState(email ?? '')
  const [waNumber, setWaNumber] = useState(phone)
  const [waLink, setWaLink] = useState<string | null>(null)

  async function generate(format: AudioFormat) {
    setBusy(`audio-${format}`)
    setNotice(null)
    try {
      const result = await postJson(`/api/prospects/${prospectId}/outreach/audio`, { format, script: script !== initialScript ? script : undefined, regenerate: true })
      if (!result.ok) {
        setNotice(result.error ?? 'Génération impossible')
        return
      }
      setReady(current => ({ ...current, [format]: true }))
      setPlayerKey(key => key + 1)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function exportLemlist() {
    setBusy('lemlist')
    setNotice(null)
    try {
      const result = await postJson(`/api/prospects/${prospectId}/outreach/lemlist`, leadEmail !== '' ? { email: leadEmail } : {})
      setNotice(result.ok ? `Ajouté à la campagne lemlist (${leadEmail}).` : result.error ?? 'Export impossible')
      if (result.ok) router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function whatsapp(send: boolean) {
    setBusy(send ? 'wa-send' : 'wa-link')
    setNotice(null)
    try {
      const result = await postJson(`/api/prospects/${prospectId}/outreach/whatsapp`, { to: waNumber.replace(/[\s.-]/g, ''), send })
      const data = result.data as { sent?: boolean; link?: string; messageId?: string } | undefined
      if (!result.ok) {
        setNotice(result.error ?? 'WhatsApp indisponible')
        return
      }
      if (data?.sent === true) setNotice(`Note vocale envoyée par WhatsApp${data.messageId !== undefined ? ` (${data.messageId})` : ''}.`)
      else if (data?.link !== undefined) {
        setWaLink(data.link)
        window.open(data.link, '_blank', 'noopener')
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card mt-6 p-5">
      <h2 className="font-display text-2xl">Outreach</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">La lettre, la note vocale et le lien public partagent le même QR code : chaque ouverture devient un signal.</p>

      <div className="mt-5 space-y-6">
        <Row title="Lien public (QR code)" hint={`Page où ${firstName} parle à ${AGENT_NAME} ou se fait rappeler.`}>
          <p className="break-all font-mono text-[12px]">{landingUrl}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <CopyButton text={landingUrl} label="Copier le lien" />
            <a href={landingUrl} target="_blank" rel="noreferrer" className="btn">Ouvrir ↗</a>
          </div>
        </Row>

        <Row title="Lettre" hint="Une page, un QR code, un modèle réécrit à partir du signal le plus fort.">
          <Link href={letterUrl.replace(/^https?:\/\/[^/]+/, '')} className="btn btn-solid">Ouvrir le letter builder</Link>
        </Row>

        <Row title="Note vocale" hint={`Script lu par la voix de ${AGENT_NAME} (ElevenLabs). MP3 pour l’email et lemlist, OGG pour WhatsApp.`}>
          <textarea className="field min-h-[120px] resize-y border border-line p-2 text-[12px] leading-relaxed" value={script} onChange={event => setScript(event.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={busy !== null || !capabilities.tts} onClick={() => generate('mp3')}>{busy === 'audio-mp3' ? 'Synthèse…' : 'Générer le MP3'}</button>
            <button type="button" className="btn" disabled={busy !== null || !capabilities.tts} onClick={() => generate('ogg')}>{busy === 'audio-ogg' ? 'Synthèse…' : 'Générer l’OGG (WhatsApp)'}</button>
          </div>
          {!capabilities.tts && <p className="mt-2 font-mono text-[11px] text-amber">Renseignez ELEVENLABS_API_KEY et ELEVENLABS_VOICE_ID.</p>}
          {ready.mp3 && (
            <div className="mt-3">
              <audio key={playerKey} className="w-full" controls preload="none" src={`/api/prospects/${prospectId}/audio?format=mp3`} />
              <div className="mt-2 flex flex-wrap gap-2">
                <a className="btn" href={`/api/prospects/${prospectId}/audio?format=mp3`} download>Télécharger le MP3</a>
                {ready.ogg && <a className="btn" href={`/api/prospects/${prospectId}/audio?format=ogg`} download>Télécharger l’OGG</a>}
                <CopyButton text={publicAudioUrl.mp3} label="Copier l’URL publique" />
              </div>
            </div>
          )}
        </Row>

        <Row title="lemlist" hint="Ajoute le contact à la campagne avec {{landingUrl}}, {{audioUrl}}, {{angle}} et {{signal}} en variables.">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[200px] flex-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Email</span>
              <input className="field mt-1" value={leadEmail} onChange={event => setLeadEmail(event.target.value)} placeholder="prenom@entreprise.fr" />
            </label>
            <button type="button" className="btn" disabled={busy !== null || !capabilities.lemlist || leadEmail === ''} onClick={exportLemlist}>{busy === 'lemlist' ? 'Export…' : 'Ajouter à la campagne'}</button>
          </div>
          {!capabilities.lemlist && <p className="mt-2 font-mono text-[11px] text-amber">Renseignez LEMLIST_API_KEY et LEMLIST_CAMPAIGN_ID.</p>}
        </Row>

        <Row title="WhatsApp" hint="Le lien ouvre la conversation avec le texte prérempli ; joignez l’OGG à la main, ou envoyez-le par l’API Cloud dans une fenêtre de 24 h.">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[180px] flex-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Numéro</span>
              <input className="field tabular mt-1 font-mono" value={waNumber} onChange={event => setWaNumber(event.target.value)} />
            </label>
            <button type="button" className="btn" disabled={busy !== null} onClick={() => whatsapp(false)}>{busy === 'wa-link' ? '…' : 'Ouvrir WhatsApp'}</button>
            <button type="button" className="btn" disabled={busy !== null || !capabilities.whatsapp || !capabilities.tts} onClick={() => whatsapp(true)}>{busy === 'wa-send' ? 'Envoi…' : 'Envoyer par l’API'}</button>
          </div>
          {waLink !== null && <p className="mt-2 break-all font-mono text-[11px] text-ink-2">{waLink}</p>}
          {!capabilities.whatsapp && <p className="mt-2 font-mono text-[11px] text-amber">API Cloud : renseignez WHATSAPP_TOKEN et WHATSAPP_PHONE_NUMBER_ID.</p>}
        </Row>
      </div>

      {notice !== null && <p className="mt-5 border-l-2 border-red pl-3 text-[13px] leading-relaxed text-ink-2">{notice}</p>}
    </div>
  )
}
