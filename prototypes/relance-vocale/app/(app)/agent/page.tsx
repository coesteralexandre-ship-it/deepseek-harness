import { CopyButton } from '@/components/copy-button'
import { PageHead } from '@/components/page-head'
import { Pill } from '@/components/pill'
import { AGENT_NAME, DATA_COLLECTION, FIRST_MESSAGE, SYSTEM_PROMPT, type CollectedField } from '@/core/agent-prompt'
import { accessCode, appUrl, elevenLabsEnv, publicCallbackEnabled, redisEnv, toolSecret } from '@/core/env'
import { outreachCapabilities } from '@/core/outreach'
import { RELANCE_DATA_COLLECTION, RELANCE_FIRST_MESSAGE, RELANCE_SYSTEM_PROMPT } from '@/core/relance-prompt'

export const dynamic = 'force-dynamic'

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-emerald shadow-[0_0_8px_1px_rgba(1,165,76,0.6)]' : 'bg-ochre'}`} />
      <div className="min-w-0">
        <p className="break-all font-mono text-[12px] text-ink">{label}</p>
        <p className="text-[12.5px] leading-snug text-faint">{hint}</p>
      </div>
    </li>
  )
}

function AgentCard({ title, role, ready, prompt, firstMessage, fields }: { title: string; role: string; ready: boolean; prompt: string; firstMessage: string; fields: CollectedField[] }) {
  return (
    <section className={`card p-5 ${ready ? 'card-emerald' : 'card-ochre'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label">{role}</p>
          <h2 className="font-display mt-1.5 text-[22px] leading-tight">{title}</h2>
        </div>
        <Pill tone={ready ? 'ok' : 'warn'}>{ready ? 'En ligne' : 'À créer'}</Pill>
      </div>

      <p className="label mt-5">Première phrase</p>
      <p className="mt-1.5 border-l-[3px] border-blue pl-3 text-[16px] font-semibold leading-snug text-ink">{firstMessage}</p>

      <details className="mt-5">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.16em] text-faint hover:text-ink">Consignes complètes</summary>
        <pre className="sheet mt-3 max-h-[380px] overflow-auto">{prompt}</pre>
        <div className="mt-3"><CopyButton text={prompt} label="Copier les consignes" /></div>
      </details>

      <p className="label mt-5">Ce que {AGENT_NAME} rapporte après l’appel</p>
      <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
        {fields.map(field => (
          <li key={field.id} className="px-3 py-2">
            <p className="font-mono text-[11px] text-blue">{field.id}</p>
            <p className="text-[12.5px] leading-snug text-muted">{field.description}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function AgentPage() {
  const env = elevenLabsEnv()
  const caps = outreachCapabilities()
  const base = appUrl()
  const webhookUrl = `${base}/api/webhooks/elevenlabs`
  const ingestExample = JSON.stringify({
    prospect: { company: 'Intérim Nord', city: 'Lille', contact: { firstName: 'Paul', lastName: 'Martin', role: 'DAF', phone: '+33612345678' } },
    source: 'linkedin',
    title: 'Nos clients grands comptes règlent à 90 jours',
    excerpt: 'Post du DAF, 42 réactions.',
    weight: 5,
  }, null, 2)

  return (
    <>
      <PageHead
        eyebrow={`Agent vocal · ${AGENT_NAME}`}
        title={<>Une voix, <span className="accent">deux métiers.</span></>}
        lead={`${AGENT_NAME} relance les factures de vos clients, et elle appelle les agences qui pourraient devenir clientes. Chaque métier a ses consignes ; les deux annoncent qu’elles sont une IA dès la première phrase.`}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <AgentCard title={`${AGENT_NAME} relance`} role="Pour vos clients" ready={env.apiKey !== undefined && env.relanceAgentId !== undefined} prompt={RELANCE_SYSTEM_PROMPT} firstMessage={RELANCE_FIRST_MESSAGE} fields={RELANCE_DATA_COLLECTION} />
        <AgentCard title={`${AGENT_NAME} prospection`} role="Pour trouver des clients" ready={env.apiKey !== undefined && env.agentId !== undefined} prompt={SYSTEM_PROMPT} firstMessage={FIRST_MESSAGE} fields={DATA_COLLECTION} />
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <section>
          <p className="eyebrow">Branchements</p>
          <ul className="card mt-4 divide-y divide-line">
            <Check ok={env.apiKey !== undefined} label="ELEVENLABS_API_KEY" hint="Clé du compte ElevenLabs : appels, synthèse vocale, lecture des analyses." />
            <Check ok={env.relanceAgentId !== undefined} label="ELEVENLABS_RELANCE_AGENT_ID" hint="Agent de relance, créé par pnpm sync-agents." />
            <Check ok={env.agentId !== undefined} label="ELEVENLABS_AGENT_ID" hint="Agent de prospection, créé par pnpm sync-agents." />
            <Check ok={caps.tts} label="ELEVENLABS_VOICE_ID" hint="Voix des agents et de la note vocale." />
            <Check ok={env.phoneNumberId !== undefined} label="ELEVENLABS_PHONE_NUMBER_ID" hint="Numéro importé dans ElevenLabs. Sans lui, pas d’appel téléphonique ; le navigateur et la simulation restent disponibles." />
            <Check ok={publicCallbackEnabled()} label="PUBLIC_CALLBACK=1" hint="Autorise « Appelez-moi » sur la page publique. Laissé éteint : n’importe qui avec le lien pourrait faire composer un numéro." />
            <Check ok={accessCode() !== undefined} label="APP_ACCESS_CODE" hint="Code d’accès de l’espace interne. Obligatoire en ligne, puisque l’app lance de vrais appels." />
            <Check ok={redisEnv() !== undefined} label="UPSTASH_REDIS_REST_URL / TOKEN" hint="Persistance. Sans Redis, les données repartent du jeu de test à chaque instance." />
            <Check ok={env.webhookSecret !== undefined} label="ELEVENLABS_WEBHOOK_SECRET" hint="Signature du webhook post-appel. Facultatif : l’app relit déjà l’analyse de chaque appel." />
            <Check ok={toolSecret() !== undefined} label="TOOL_SECRET" hint="Protège l’outil de prise de rendez-vous appelé pendant un appel téléphonique." />
            <Check ok={caps.llm} label="DEEPSEEK_API_KEY" hint="Réécriture des lettres ; sans elle, le modèle de lettre reste disponible." />
            <Check ok={caps.lemlist} label="LEMLIST_API_KEY / CAMPAIGN_ID" hint="Export du prospect vers une campagne lemlist avec les liens en variables." />
            <Check ok={caps.whatsapp} label="WHATSAPP_TOKEN / PHONE_NUMBER_ID" hint="Envoi de la note vocale par l’API ; sans elle, un lien à ouvrir à la main." />
          </ul>
        </section>

        <section className="space-y-6">
          <div>
            <p className="eyebrow">Mettre les agents à jour</p>
            <pre className="sheet mt-4">pnpm sync-agents</pre>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">Crée les deux agents avec ces consignes, ou les met à jour s’ils existent, et écrit leurs identifiants dans <span className="font-mono text-[12px] text-blue">.env.local</span>.</p>
          </div>
          <div>
            <p className="eyebrow">Webhook post-appel</p>
            <pre className="sheet mt-4">{webhookUrl}</pre>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">À déclarer dans ElevenLabs, réglages de l’espace, type <span className="font-mono text-[12px] text-blue">post_call_transcription</span>. Il met la fiche à jour même si personne n’a la page ouverte.</p>
            <div className="mt-3"><CopyButton text={webhookUrl} label="Copier l’adresse" /></div>
          </div>
          <div>
            <p className="eyebrow">Pousser un signal</p>
            <pre className="sheet mt-4">{`POST ${base}/api/signals
Authorization: Bearer <APP_ACCESS_CODE>

${ingestExample}`}</pre>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">Un outil de veille pousse ses trouvailles ici ; une entreprise inconnue est créée à la volée.</p>
          </div>
        </section>
      </div>
    </>
  )
}
