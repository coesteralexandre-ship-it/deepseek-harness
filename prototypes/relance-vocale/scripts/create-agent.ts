/**
 * Create the ElevenLabs agent from the prompt in core/agent-prompt.ts.
 *
 *   ELEVENLABS_API_KEY=… [ELEVENLABS_VOICE_ID=…] pnpm create-agent
 *
 * Prints the agent id to put in ELEVENLABS_AGENT_ID. Data collection and the
 * evaluation criterion are declared too; the post-call webhook is a workspace
 * setting and stays manual (GUIDE.md).
 */
import { AGENT_NAME, DATA_COLLECTION, EVALUATION_CRITERION, FIRST_MESSAGE, PRODUCT_NAME, SYSTEM_PROMPT } from '../core/agent-prompt.ts'

const apiKey = process.env.ELEVENLABS_API_KEY
if (apiKey === undefined || apiKey === '') {
  console.error('ELEVENLABS_API_KEY manquante (export-la ou mets-la dans .env.local).')
  process.exit(1)
}
const voiceId = process.env.ELEVENLABS_VOICE_ID

const body = {
  name: `${PRODUCT_NAME} — ${AGENT_NAME} (démo)`,
  conversation_config: {
    agent: {
      first_message: FIRST_MESSAGE,
      language: 'fr',
      prompt: { prompt: SYSTEM_PROMPT, temperature: 0.4 },
    },
    ...(voiceId !== undefined && voiceId !== '' ? { tts: { voice_id: voiceId } } : {}),
  },
  platform_settings: {
    data_collection: Object.fromEntries(DATA_COLLECTION.map(field => [field.id, { type: field.type, description: field.description }])),
    evaluation: {
      criteria: [{ id: EVALUATION_CRITERION.id, name: EVALUATION_CRITERION.name, conversation_goal_prompt: EVALUATION_CRITERION.prompt }],
    },
  },
}

const response = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
  method: 'POST',
  headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const text = await response.text()
if (!response.ok) {
  console.error(`ElevenLabs ${response.status} : ${text}`)
  console.error('Si le format est refusé, crée l’agent dans le dashboard en collant le prompt affiché sur la page /agent.')
  process.exit(1)
}
const { agent_id: agentId } = JSON.parse(text) as { agent_id: string }
console.log(`Agent créé : ${agentId}`)
console.log(`Ajoute ELEVENLABS_AGENT_ID=${agentId} à .env.local et aux variables Vercel.`)
