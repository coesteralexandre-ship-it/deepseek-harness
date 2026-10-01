/** Typed access to the environment. Empty strings count as unset. */

function read(name: string): string | undefined {
  const value = process.env[name]
  return value === undefined || value.trim() === '' ? undefined : value.trim()
}

export interface ElevenLabsEnv {
  apiKey?: string
  /** Agent that prospects agencies. */
  agentId?: string
  /** Agent that reminds the client's customers about invoices. */
  relanceAgentId?: string
  /** Same reminder agent without the browser-only answer tool, for phone calls; the reminder agent when unset. */
  relancePhoneAgentId?: string
  phoneNumberId?: string
  webhookSecret?: string
}

export function elevenLabsEnv(): ElevenLabsEnv {
  return {
    apiKey: read('ELEVENLABS_API_KEY'),
    agentId: read('ELEVENLABS_AGENT_ID'),
    relanceAgentId: read('ELEVENLABS_RELANCE_AGENT_ID'),
    relancePhoneAgentId: read('ELEVENLABS_RELANCE_PHONE_AGENT_ID'),
    phoneNumberId: read('ELEVENLABS_PHONE_NUMBER_ID'),
    webhookSecret: read('ELEVENLABS_WEBHOOK_SECRET'),
  }
}

export interface RedisEnv {
  url: string
  token: string
}

/** Upstash credentials under either the Upstash or the Vercel KV variable names. */
export function redisEnv(): RedisEnv | undefined {
  const url = read('UPSTASH_REDIS_REST_URL') ?? read('KV_REST_API_URL')
  const token = read('UPSTASH_REDIS_REST_TOKEN') ?? read('KV_REST_API_TOKEN')
  return url !== undefined && token !== undefined ? { url, token } : undefined
}

export function toolSecret(): string | undefined {
  return read('TOOL_SECRET')
}

export function callerName(): string {
  return read('CALLER_NAME') ?? 'Alexandre'
}

export function appUrl(): string {
  // On Vercel the production domain is the public one; the per-deployment URL sits behind Vercel's own login.
  const vercelHost = read('VERCEL_PROJECT_PRODUCTION_URL') ?? read('VERCEL_URL')
  return read('NEXT_PUBLIC_APP_URL') ?? (vercelHost !== undefined ? `https://${vercelHost}` : 'http://localhost:3000')
}

/** Whether « Réinitialiser » may wipe the data: always in development, in production only with `ALLOW_RESET=1`. */
export function resetAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || read('ALLOW_RESET') === '1'
}

/** Shared access code of the internal pages; unset leaves them open (local development). */
export function accessCode(): string | undefined {
  return read('APP_ACCESS_CODE')
}

/** Whether anyone holding a public link may trigger an outbound phone call to a number they type. Off unless `PUBLIC_CALLBACK=1`. */
export function publicCallbackEnabled(): boolean {
  return read('PUBLIC_CALLBACK') === '1'
}
