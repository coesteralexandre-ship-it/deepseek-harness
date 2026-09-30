import { Redis } from '@upstash/redis'
import { redisEnv, type RedisEnv } from './env.ts'
import { seedData } from './seed.ts'
import type { Prospect, Signal } from './types.ts'

/** Persistence for prospects and signals. Implementations seed themselves on first use. */
export interface Store {
  readonly kind: 'memoire' | 'redis'
  listProspects(): Promise<Prospect[]>
  getProspect(id: string): Promise<Prospect | undefined>
  saveProspect(prospect: Prospect): Promise<void>
  listSignals(): Promise<Signal[]>
  getSignal(id: string): Promise<Signal | undefined>
  saveSignal(signal: Signal): Promise<void>
  /** Drop everything and reload the seed. */
  reset(): Promise<void>
}

/** Process-local store: fine for `next dev`; on Vercel each instance starts from the seed. */
class MemoryStore implements Store {
  readonly kind = 'memoire'
  private prospects = new Map<string, Prospect>()
  private signals = new Map<string, Signal>()

  constructor() {
    void this.reset()
  }

  async listProspects(): Promise<Prospect[]> {
    return [...this.prospects.values()]
  }

  async getProspect(id: string): Promise<Prospect | undefined> {
    return this.prospects.get(id)
  }

  async saveProspect(prospect: Prospect): Promise<void> {
    this.prospects.set(prospect.id, prospect)
  }

  async listSignals(): Promise<Signal[]> {
    return [...this.signals.values()]
  }

  async getSignal(id: string): Promise<Signal | undefined> {
    return this.signals.get(id)
  }

  async saveSignal(signal: Signal): Promise<void> {
    this.signals.set(signal.id, signal)
  }

  async reset(): Promise<void> {
    const { prospects, signals } = seedData()
    this.prospects = new Map(prospects.map(prospect => [prospect.id, prospect]))
    this.signals = new Map(signals.map(signal => [signal.id, signal]))
  }
}

const KEYS = {
  prospects: 'rv:prospects',
  signals: 'rv:signals',
  seeded: 'rv:seeded',
} as const

/** Upstash Redis store: one hash per collection, values stored as JSON. */
class RedisStore implements Store {
  readonly kind = 'redis'
  private readonly redis: Redis

  constructor(env: RedisEnv) {
    this.redis = new Redis({ url: env.url, token: env.token })
  }

  private async ensureSeeded(): Promise<void> {
    if ((await this.redis.exists(KEYS.seeded)) === 0) await this.reset()
  }

  async listProspects(): Promise<Prospect[]> {
    await this.ensureSeeded()
    const all = await this.redis.hgetall<Record<string, Prospect>>(KEYS.prospects)
    return Object.values(all ?? {})
  }

  async getProspect(id: string): Promise<Prospect | undefined> {
    await this.ensureSeeded()
    return (await this.redis.hget<Prospect>(KEYS.prospects, id)) ?? undefined
  }

  async saveProspect(prospect: Prospect): Promise<void> {
    await this.redis.hset(KEYS.prospects, { [prospect.id]: prospect })
  }

  async listSignals(): Promise<Signal[]> {
    await this.ensureSeeded()
    const all = await this.redis.hgetall<Record<string, Signal>>(KEYS.signals)
    return Object.values(all ?? {})
  }

  async getSignal(id: string): Promise<Signal | undefined> {
    await this.ensureSeeded()
    return (await this.redis.hget<Signal>(KEYS.signals, id)) ?? undefined
  }

  async saveSignal(signal: Signal): Promise<void> {
    await this.redis.hset(KEYS.signals, { [signal.id]: signal })
  }

  async reset(): Promise<void> {
    const { prospects, signals } = seedData()
    const pipeline = this.redis.pipeline()
    pipeline.del(KEYS.prospects, KEYS.signals)
    pipeline.hset(KEYS.prospects, Object.fromEntries(prospects.map(prospect => [prospect.id, prospect])))
    pipeline.hset(KEYS.signals, Object.fromEntries(signals.map(signal => [signal.id, signal])))
    pipeline.set(KEYS.seeded, new Date().toISOString())
    await pipeline.exec()
  }
}

const STORE_KEY = Symbol.for('relance-vocale.store')

/** Singleton store for the process, kept on globalThis so `next dev` reloads keep the data. */
export function getStore(): Store {
  const holder = globalThis as unknown as Record<symbol, Store | undefined>
  const existing = holder[STORE_KEY]
  if (existing !== undefined) return existing
  const env = redisEnv()
  const store: Store = env === undefined ? new MemoryStore() : new RedisStore(env)
  holder[STORE_KEY] = store
  return store
}
