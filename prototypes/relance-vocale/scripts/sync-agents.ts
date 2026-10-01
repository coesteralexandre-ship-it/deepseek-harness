/**
 * Create or update the two ElevenLabs agents from the prompts in core/.
 *
 *   pnpm sync-agents
 *
 * Reads ELEVENLABS_API_KEY (and optionally ELEVENLABS_VOICE_ID) from the
 * environment or .env.local. An agent whose id variable is already set is
 * updated in place; otherwise it is created and its id is written to
 * .env.local. The post-call webhook is a workspace setting and stays manual
 * (GUIDE.md); the app reads each call's analysis back without it.
 *
 * The reminder agent also gets its client tool `noter_reponse` (a workspace tool resource,
 * id kept in ELEVENLABS_RELANCE_TOOL_ID), the end-call tool and voicemail detection.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { AGENT_NAME, DATA_COLLECTION, EVALUATION_CRITERION, FIRST_MESSAGE, PRODUCT_NAME, SYSTEM_PROMPT, type CollectedField } from '../core/agent-prompt.ts'
import { ANSWER_TOOL, RELANCE_DATA_COLLECTION, RELANCE_EVALUATION_CRITERION, RELANCE_FIRST_MESSAGE, RELANCE_SYSTEM_PROMPT } from '../core/relance-prompt.ts'

const apiKey = process.env.ELEVENLABS_API_KEY
if (apiKey === undefined || apiKey === '') {
  console.error('ELEVENLABS_API_KEY manquante (export-la ou mets-la dans .env.local).')
  process.exit(1)
}
const voiceId = process.env.ELEVENLABS_VOICE_ID

interface AgentSpec {
  envName: string
  name: string
  firstMessage: string
  prompt: string
  fields: CollectedField[]
  criterion: { id: string; name: string; prompt: string }
  /** Client tool to create or update, and the .env.local variable holding its id. */
  tool?: { envName: string; config: unknown }
  /** Built-in system tools to enable. */
  builtIn?: Record<string, unknown>
}

/** Left on an answering machine; ElevenLabs fills the dynamic variables. It promises nothing the engine does not send. */
const VOICEMAIL_MESSAGE = `Bonjour, ici ${AGENT_NAME}, l’assistante vocale de {{creditor}}. Je suis une intelligence artificielle. Je vous appelais au sujet de la facture {{invoice_number}}. Nous reviendrons vers vous. Bonne journée.`

const RELANCE_BUILT_IN = {
  end_call: { type: 'system', name: 'end_call', description: '', params: { system_tool_type: 'end_call' } },
  voicemail_detection: { type: 'system', name: 'voicemail_detection', description: '', params: { system_tool_type: 'voicemail_detection', voicemail_message: VOICEMAIL_MESSAGE } },
}

const AGENTS: AgentSpec[] = [
  { envName: 'ELEVENLABS_AGENT_ID', name: `${PRODUCT_NAME} · ${AGENT_NAME} prospection`, firstMessage: FIRST_MESSAGE, prompt: SYSTEM_PROMPT, fields: DATA_COLLECTION, criterion: EVALUATION_CRITERION },
  {
    envName: 'ELEVENLABS_RELANCE_AGENT_ID',
    name: `${PRODUCT_NAME} · ${AGENT_NAME} relance`,
    firstMessage: RELANCE_FIRST_MESSAGE,
    prompt: RELANCE_SYSTEM_PROMPT,
    fields: RELANCE_DATA_COLLECTION,
    criterion: RELANCE_EVALUATION_CRITERION,
    tool: { envName: 'ELEVENLABS_RELANCE_TOOL_ID', config: ANSWER_TOOL },
    builtIn: RELANCE_BUILT_IN,
  },
  // Phone calls: same reminder agent without the client tool, which no browser would answer.
  {
    envName: 'ELEVENLABS_RELANCE_PHONE_AGENT_ID',
    name: `${PRODUCT_NAME} · ${AGENT_NAME} relance téléphone`,
    firstMessage: RELANCE_FIRST_MESSAGE,
    prompt: RELANCE_SYSTEM_PROMPT,
    fields: RELANCE_DATA_COLLECTION,
    criterion: RELANCE_EVALUATION_CRITERION,
    builtIn: RELANCE_BUILT_IN,
  },
]

/** Every `{{name}}` of the prompt and first message, with a neutral default so a call never starts with a hole. */
function placeholders(spec: AgentSpec): Record<string, string> {
  const names = new Set([...`${spec.prompt} ${spec.firstMessage}`.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1] as string))
  return Object.fromEntries([...names].map(name => [name, '…']))
}

function body(spec: AgentSpec, toolIds: string[]): unknown {
  return {
    name: spec.name,
    conversation_config: {
      agent: {
        first_message: spec.firstMessage,
        language: 'fr',
        prompt: { prompt: spec.prompt, temperature: 0.4, ...(spec.builtIn !== undefined ? { tool_ids: toolIds } : {}), ...(spec.builtIn !== undefined ? { built_in_tools: spec.builtIn } : {}) },
        dynamic_variables: { dynamic_variable_placeholders: placeholders(spec) },
      },
      // French agents need a multilingual model.
      tts: { model_id: 'eleven_flash_v2_5', ...(voiceId !== undefined && voiceId !== '' ? { voice_id: voiceId } : {}) },
    },
    platform_settings: {
      data_collection: Object.fromEntries(spec.fields.map(field => [field.id, { type: field.type, description: field.description }])),
      evaluation: {
        criteria: [{ id: spec.criterion.id, name: spec.criterion.name, conversation_goal_prompt: spec.criterion.prompt }],
      },
    },
  }
}

/** Set `name` in .env.local, replacing an existing (possibly empty) line. */
function writeEnv(name: string, value: string): void {
  const current = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : ''
  const line = new RegExp(`^${name}=.*$`, 'm')
  writeFileSync('.env.local', line.test(current) ? current.replace(line, `${name}=${value}`) : `${current.replace(/\n*$/, '\n')}${name}=${value}\n`)
}

/** Create the client tool, or update it in place when its id is already known; returns its id. */
async function upsertTool(tool: NonNullable<AgentSpec['tool']>): Promise<string> {
  const existing = process.env[tool.envName]
  const update = existing !== undefined && existing !== ''
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/tools${update ? `/${existing}` : ''}`, {
    method: update ? 'PATCH' : 'POST',
    headers: { 'xi-api-key': apiKey as string, 'content-type': 'application/json' },
    body: JSON.stringify({ tool_config: tool.config }),
  })
  const text = await response.text()
  if (!response.ok) {
    console.error(`Outil ${tool.envName} : ElevenLabs ${response.status} : ${text.slice(0, 600)}`)
    process.exit(1)
  }
  if (update) return existing
  const { id } = JSON.parse(text) as { id: string }
  writeEnv(tool.envName, id)
  process.env[tool.envName] = id
  console.log(`Outil créé, ${tool.envName} ajouté à .env.local.`)
  return id
}

for (const spec of AGENTS) {
  const toolIds = spec.tool !== undefined ? [await upsertTool(spec.tool)] : []
  const existing = process.env[spec.envName]
  const update = existing !== undefined && existing !== ''
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${update ? existing : 'create'}`, {
    method: update ? 'PATCH' : 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify(body(spec, toolIds)),
  })
  const text = await response.text()
  if (!response.ok) {
    console.error(`${spec.name} : ElevenLabs ${response.status} : ${text.slice(0, 600)}`)
    process.exit(1)
  }
  if (update) {
    console.log(`${spec.name} : mis à jour (${spec.envName} inchangé).`)
    continue
  }
  const { agent_id: agentId } = JSON.parse(text) as { agent_id: string }
  writeEnv(spec.envName, agentId)
  console.log(`${spec.name} : créé, ${spec.envName} ajouté à .env.local.`)
}
