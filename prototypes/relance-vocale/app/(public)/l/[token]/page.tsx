import { notFound } from 'next/navigation'
import { PublicCall } from '@/components/public-call'
import { AGENT_NAME, PRODUCT_NAME, dynamicVariablesFor } from '@/core/agent-prompt'
import { callerName, elevenLabsEnv } from '@/core/env'
import { LANDING_VISIT_TITLE, recordLandingSignal } from '@/core/landing'
import { getStore } from '@/core/store'
import { ttsConfigured } from '@/core/tts'

export const dynamic = 'force-dynamic'

/** Page behind the letter's QR code and the voice note. Opening it is itself a signal. */
export default async function LandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const store = getStore()
  const found = await store.findProspectByToken(token)
  if (found === undefined) notFound()
  const signals = await store.listSignals()
  const prospect = await recordLandingSignal(store, found, signals, LANDING_VISIT_TITLE, 'Ouverture de la page publique liée au QR code de la lettre ou au message vocal.')
  const own = signals.filter(signal => signal.prospectId === prospect.id)
  const env = elevenLabsEnv()
  const browserReady = env.apiKey !== undefined && env.agentId !== undefined
  const phoneReady = browserReady && env.phoneNumberId !== undefined
  const audioReady = (await store.getAudio(prospect.id, 'mp3')) !== undefined || ttsConfigured()

  return (
    <div className="py-10">
      <div className="animate-rise max-w-2xl">
        <h1 className="font-display text-[40px] leading-[0.98] tracking-tight sm:text-[52px]">
          Bonjour {prospect.contact.firstName},
          <br />
          <em className="text-red">deux minutes</em> pour entendre ce que vos clients entendraient.
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
          {AGENT_NAME} est l’agent vocal d’{PRODUCT_NAME}. C’est une intelligence artificielle : elle relance les factures échues des agences d’intérim, poliment, et passe la main à un humain dès qu’un litige apparaît. Ici, c’est vous qu’elle appelle.
        </p>
      </div>

      <PublicCall
        token={token}
        firstName={prospect.contact.firstName}
        company={prospect.company}
        callerName={callerName()}
        dynamicVariables={dynamicVariablesFor(prospect, own)}
        browserReady={browserReady}
        phoneReady={phoneReady}
        audioUrl={audioReady ? `/api/l/${token}/audio?format=mp3` : null}
      />

      <p className="mt-12 max-w-2xl text-[12px] leading-relaxed text-muted">
        Vous parlez à une intelligence artificielle ; la conversation peut être transcrite pour préparer le rendez-vous. Pour ne plus être contacté, dites « stop » à {AGENT_NAME} ou répondez « stop » au message reçu.
      </p>
    </div>
  )
}
