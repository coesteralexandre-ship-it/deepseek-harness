/** Typed access to the environment. Empty strings count as unset. */

function read(name: string): string | undefined {
  const value = process.env[name]
  return value === undefined || value.trim() === '' ? undefined : value.trim()
}

export interface ElevenLabsEnv {
  apiKey?: string
  agentId?: string
  phoneNumberId?: string
  webhookSecret?: string
}

export function elevenLabsEnv(): ElevenLabsEnv {
  return {
    apiKey: read('ELEVENLABS_API_KEY'),
    agentId: read('ELEVENLABS_AGENT_ID'),
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
  return read('NEXT_PUBLIC_APP_URL') ?? (read('VERCEL_URL') !== undefined ? `https://${read('VERCEL_URL')}` : 'http://localhost:3000')
}
