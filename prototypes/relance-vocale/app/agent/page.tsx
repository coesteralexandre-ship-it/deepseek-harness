import { CopyButton } from '@/components/copy-button'
import { AGENT_NAME, CLIENT_TOOL, DATA_COLLECTION, EVALUATION_CRITERION, FIRST_MESSAGE, PRODUCT_NAME, SYSTEM_PROMPT, dynamicVariablesFor } from '@/core/agent-prompt'
import { appUrl, elevenLabsEnv, redisEnv, toolSecret } from '@/core/env'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center border text-[10px] leading-none ${ok ? 'border-green text-green' : 'border-red text-red'}`}>{ok ? '✓' : '✗'}</span>
      <div>
        <p className="font-mono text-[12px]">{label}</p>
        <p className="text-[12px] text-muted">{hint}</p>
      </div>
    </li>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="rule pt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default async function AgentPage() {
  const env = elevenLabsEnv()
  const store = getStore()
  const [prospects, signals] = await Promise.all([store.listProspects(), store.listSignals()])
  const sample = prospects[0]
  const variables = sample !== undefined ? dynamicVariablesFor(sample, signals.filter(signal => signal.prospectId === sample.id)) : {}
  const base = appUrl()
  const webhookUrl = `${base}/api/webhooks/elevenlabs`
  const toolUrl = `${base}/api/tools/book-meeting`
  const ingestExample = JSON.stringify({
    prospect: { company: 'Intérim Nord', city: 'Lille', contact: { firstName: 'Paul', lastName: 'Martin', role: 'DAF', phone: '+33612345678' } },
    source: 'linkedin',
    title: '« Nos clients grands comptes règlent à 90 jours »',
    excerpt: 'Post du DAF, 42 réactions.',
    weight: 5,
  }, null, 2)

  return (
    <div className="py-10">
      <div className="max-w-2xl animate-rise">
        <h1 className="font-display text-[40px] leading-[0.95] tracking-tight">L’agent {AGENT_NAME}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Tout ce qu’il faut coller dans ElevenLabs pour que {AGENT_NAME} appelle, se présente comme la démo et renvoie l’issue de l’appel dans le pipeline.
        </p>
      </div>

      <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        <div>
          <Section title="Configuration">
            <ul className="divide-y divide-line">
              <Check ok={env.apiKey !== undefined} label="ELEVENLABS_API_KEY" hint="Clé API du compte ElevenLabs." />
              <Check ok={env.agentId !== undefined} label="ELEVENLABS_AGENT_ID" hint="Agent Conversational AI. Sans lui, pas de conversation navigateur." />
              <Check ok={env.phoneNumberId !== undefined} label="ELEVENLABS_PHONE_NUMBER_ID" hint="Numéro Twilio ou SIP importé dans ElevenLabs. Sans lui, pas d’appel sortant, mais la simulation reste disponible." />
              <Check ok={env.webhookSecret !== undefined} label="ELEVENLABS_WEBHOOK_SECRET" hint="Vérifie la signature des webhooks post-appel. Sans lui, le webhook est accepté sans vérification." />
              <Check ok={redisEnv() !== undefined} label="UPSTASH_REDIS_REST_URL / TOKEN" hint="Persistance. Sans Redis, les données repartent du jeu de test à chaque instance." />
              <Check ok={toolSecret() !== undefined} label="TOOL_SECRET" hint="Protège l’outil de prise de rendez-vous appelé par l’agent." />
            </ul>
          </Section>

          <Section title="1 · Prompt système">
            <p className="mb-3 text-[13px] text-ink-2">Agent → System prompt. Les <code className="font-mono text-[12px]">{'{{variables}}'}</code> sont envoyées au début de chaque appel.</p>
            <pre className="sheet max-h-[420px] overflow-auto">{SYSTEM_PROMPT}</pre>
            <div className="mt-3"><CopyButton text={SYSTEM_PROMPT} label="Copier le prompt" /></div>
          </Section>

          <Section title="2 · Premier message">
            <pre className="sheet">{FIRST_MESSAGE}</pre>
            <div className="mt-3"><CopyButton text={FIRST_MESSAGE} label="Copier le premier message" /></div>
          </Section>

          <Section title="3 · Variables dynamiques">
            <p className="mb-3 text-[13px] text-ink-2">Déclarez-les dans Agent → Dynamic variables avec une valeur par défaut. Exemple pour {sample?.company ?? 'un prospect'} :</p>
            <table className="w-full text-[12px]">
              <tbody className="divide-y divide-line">
                {Object.entries(variables).map(([name, value]) => (
                  <tr key={name}>
                    <td className="py-2 pr-4 align-top font-mono text-[11px]">{name}</td>
                    <td className="py-2 text-ink-2">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>

        <div>
          <Section title="4 · Collecte de données">
            <p className="mb-3 text-[13px] text-ink-2">Analysis → Data collection. Le webhook lit ces identifiants pour déplacer la carte.</p>
            <ul className="divide-y divide-line">
              {DATA_COLLECTION.map(field => (
                <li key={field.id} className="py-2">
                  <p className="font-mono text-[11px]">{field.id} <span className="text-muted">· {field.type}</span></p>
                  <p className="text-[12px] text-ink-2">{field.description}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Critère d’évaluation</p>
            <p className="mt-1 font-mono text-[11px]">{EVALUATION_CRITERION.id} <span className="text-muted">· {EVALUATION_CRITERION.name}</span></p>
            <p className="text-[12px] text-ink-2">{EVALUATION_CRITERION.prompt}</p>
          </Section>

          <Section title="5 · Webhook post-appel">
            <p className="mb-3 text-[13px] text-ink-2">Settings → Webhooks → Post-call, type <span className="font-mono text-[12px]">post_call_transcription</span>. Mettez le secret affiché par ElevenLabs dans <span className="font-mono text-[12px]">ELEVENLABS_WEBHOOK_SECRET</span>.</p>
            <pre className="sheet">{webhookUrl}</pre>
            <div className="mt-3"><CopyButton text={webhookUrl} label="Copier l’URL" /></div>
          </Section>

          <Section title="6 · Outil « prise de rendez-vous »">
            <p className="mb-3 text-[13px] text-ink-2">
              Dans le navigateur, l’outil client <span className="font-mono text-[12px]">{CLIENT_TOOL.name}</span> est fourni par cette app. Au téléphone, déclarez-le comme Webhook tool (POST) :
            </p>
            <pre className="sheet">{`${toolUrl}
Header  x-tool-secret: <TOOL_SECRET>
Body    prospect_id  ← variable dynamique prospect_id
        slot         ← LLM : ${CLIENT_TOOL.parameters.slot}
        notes        ← LLM : ${CLIENT_TOOL.parameters.notes}`}</pre>
            <div className="mt-3"><CopyButton text={toolUrl} label="Copier l’URL de l’outil" /></div>
          </Section>

          <Section title="7 · Ingestion de signaux">
            <p className="mb-3 text-[13px] text-ink-2">Un outil d’enrichissement pousse ses trouvailles ici ; une entreprise inconnue est créée à la volée.</p>
            <pre className="sheet">{`POST ${base}/api/signals
${ingestExample}`}</pre>
          </Section>

          <Section title="8 · Créer l’agent par script">
            <pre className="sheet">{`ELEVENLABS_API_KEY=… pnpm create-agent`}</pre>
            <p className="mt-3 text-[13px] text-ink-2">Crée « {PRODUCT_NAME} — {AGENT_NAME} (démo) » avec ce prompt, la collecte de données et le critère d’évaluation, puis affiche l’identifiant à mettre dans <span className="font-mono text-[12px]">ELEVENLABS_AGENT_ID</span>.</p>
          </Section>
        </div>
      </div>
    </div>
  )
}
