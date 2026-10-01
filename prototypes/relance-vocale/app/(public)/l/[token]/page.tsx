import { notFound } from 'next/navigation'
import { LandingVisit } from '@/components/landing-visit'
import { PublicCall } from '@/components/public-call'
import { AGENT_NAME, PRODUCT_NAME, dynamicVariablesFor } from '@/core/agent-prompt'
import { callerName, elevenLabsEnv, publicCallbackEnabled } from '@/core/env'
import { getStore } from '@/core/store'
import { ttsConfigured } from '@/core/tts'

export const dynamic = 'force-dynamic'

/** Page behind the letter's QR code and the voice note. Opening it is itself a signal. */
export default async function LandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const store = getStore()
  const prospect = await store.findProspectByToken(token)
  if (prospect === undefined) notFound()
  // The visit is logged by the browser (LandingVisit), not here: link previewers render this page without a person.
  const signals = await store.listSignals()
  const own = signals.filter(signal => signal.prospectId === prospect.id)
  const env = elevenLabsEnv()
  const browserReady = env.apiKey !== undefined && env.agentId !== undefined
  const phoneReady = browserReady && env.phoneNumberId !== undefined && publicCallbackEnabled()
  const audioReady = (await store.getAudio(prospect.id, 'mp3')) !== undefined || ttsConfigured()

  return (
    <div className="py-10">
      <LandingVisit token={token} />
      <div className="animate-rise max-w-2xl">
        <p className="eyebrow">{`${prospect.contact.firstName} ${prospect.contact.lastName}`.trim() !== '' ? `Pour ${prospect.contact.firstName} ${prospect.contact.lastName} · ` : 'Pour '}{prospect.company}</p>
        <h1 className="font-display mt-4 text-[36px] leading-[1.04] sm:text-[50px]">
          Deux minutes pour entendre ce que <span className="accent">vos clients entendraient.</span>
        </h1>
        <p className="mt-5 text-[15.5px] leading-relaxed text-muted">
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

      <p className="mt-12 max-w-2xl text-[12px] leading-relaxed text-faint">
        Vous parlez à une intelligence artificielle ; la conversation peut être transcrite pour préparer le rendez-vous. Pour ne plus être contacté, dites « stop » à {AGENT_NAME} ou répondez « stop » au message reçu.
      </p>
    </div>
  )
}
