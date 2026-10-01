import { Redis } from '@upstash/redis'
import { redisEnv, type RedisEnv } from './env.ts'
import { DEFAULT_SETTINGS } from './clock.ts'
import { seedInvoices } from './seed-invoices.ts'
import { seedData } from './seed.ts'
import type { AudioFormat, Invoice, Prospect, Settings, Signal, StoredAudio } from './types.ts'

/** Persistence for prospects, signals, invoices and generated audio. Implementations seed themselves on first use. */
export interface Store {
  readonly kind: 'memoire' | 'redis'
  listProspects(): Promise<Prospect[]>
  getProspect(id: string): Promise<Prospect | undefined>
  /** Prospect owning a public landing token. */
  findProspectByToken(token: string): Promise<Prospect | undefined>
  saveProspect(prospect: Prospect): Promise<void>
  listSignals(): Promise<Signal[]>
  getSignal(id: string): Promise<Signal | undefined>
  saveSignal(signal: Signal): Promise<void>
  getAudio(prospectId: string, format: AudioFormat): Promise<StoredAudio | undefined>
  saveAudio(prospectId: string, audio: StoredAudio): Promise<void>
  listInvoices(): Promise<Invoice[]>
  getInvoice(id: string): Promise<Invoice | undefined>
  /** Invoice owning a public answer-page token. */
  findInvoiceByToken(token: string): Promise<Invoice | undefined>
  saveInvoice(invoice: Invoice): Promise<void>
  saveInvoices(invoices: Invoice[]): Promise<void>
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
  /** Drop everything and reload the seed. */
  reset(): Promise<void>
}

const AUDIO_FORMATS: AudioFormat[] = ['mp3', 'ogg']

/** Process-local store: fine for `next dev`; on Vercel each instance starts from the seed. */
class MemoryStore implements Store {
  readonly kind = 'memoire'
  private prospects = new Map<string, Prospect>()
  private signals = new Map<string, Signal>()
  private audio = new Map<string, StoredAudio>()
  private invoices = new Map<string, Invoice>()
  private settings: Settings = DEFAULT_SETTINGS

  constructor() {
    void this.reset()
  }

  async listProspects(): Promise<Prospect[]> {
    return [...this.prospects.values()]
  }

  async getProspect(id: string): Promise<Prospect | undefined> {
    return this.prospects.get(id)
  }

  async findProspectByToken(token: string): Promise<Prospect | undefined> {
    return [...this.prospects.values()].find(prospect => prospect.landingToken === token)
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

  async getAudio(prospectId: string, format: AudioFormat): Promise<StoredAudio | undefined> {
    return this.audio.get(`${prospectId}:${format}`)
  }

  async saveAudio(prospectId: string, audio: StoredAudio): Promise<void> {
    this.audio.set(`${prospectId}:${audio.format}`, audio)
  }

  async listInvoices(): Promise<Invoice[]> {
    return [...this.invoices.values()]
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    return this.invoices.get(id)
  }

  async findInvoiceByToken(token: string): Promise<Invoice | undefined> {
    return [...this.invoices.values()].find(invoice => invoice.token === token)
  }

  async saveInvoice(invoice: Invoice): Promise<void> {
    this.invoices.set(invoice.id, invoice)
  }

  async saveInvoices(invoices: Invoice[]): Promise<void> {
    for (const invoice of invoices) this.invoices.set(invoice.id, invoice)
  }

  async getSettings(): Promise<Settings> {
    return this.settings
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.settings = settings
  }

  async reset(): Promise<void> {
    const { prospects, signals } = seedData()
    this.prospects = new Map(prospects.map(prospect => [prospect.id, prospect]))
    this.signals = new Map(signals.map(signal => [signal.id, signal]))
    this.invoices = new Map(seedInvoices().map(invoice => [invoice.id, invoice]))
    this.settings = DEFAULT_SETTINGS
    this.audio = new Map()
  }
}

const KEYS = {
  prospects: 'rv:prospects',
  signals: 'rv:signals',
  invoices: 'rv:invoices',
  settings: 'rv:settings',
  seeded: 'rv:seeded',
  audio: (prospectId: string, format: AudioFormat) => `rv:audio:${prospectId}:${format}`,
} as const

/** Upstash Redis store: one hash per collection, one key per generated audio, values stored as JSON. */
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

  async findProspectByToken(token: string): Promise<Prospect | undefined> {
    return (await this.listProspects()).find(prospect => prospect.landingToken === token)
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

  async getAudio(prospectId: string, format: AudioFormat): Promise<StoredAudio | undefined> {
    return (await this.redis.get<StoredAudio>(KEYS.audio(prospectId, format))) ?? undefined
  }

  async saveAudio(prospectId: string, audio: StoredAudio): Promise<void> {
    await this.redis.set(KEYS.audio(prospectId, audio.format), audio)
  }

  async listInvoices(): Promise<Invoice[]> {
    await this.ensureSeeded()
    const all = await this.redis.hgetall<Record<string, Invoice>>(KEYS.invoices)
    return Object.values(all ?? {})
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    await this.ensureSeeded()
    return (await this.redis.hget<Invoice>(KEYS.invoices, id)) ?? undefined
  }

  async findInvoiceByToken(token: string): Promise<Invoice | undefined> {
    return (await this.listInvoices()).find(invoice => invoice.token === token)
  }

  async saveInvoice(invoice: Invoice): Promise<void> {
    await this.redis.hset(KEYS.invoices, { [invoice.id]: invoice })
  }

  async saveInvoices(invoices: Invoice[]): Promise<void> {
    if (invoices.length > 0) await this.redis.hset(KEYS.invoices, Object.fromEntries(invoices.map(invoice => [invoice.id, invoice])))
  }

  async getSettings(): Promise<Settings> {
    const stored = (await this.redis.get<Partial<Settings>>(KEYS.settings)) ?? {}
    return { ...DEFAULT_SETTINGS, ...stored, agency: { ...DEFAULT_SETTINGS.agency, ...(stored.agency ?? {}) } }
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.redis.set(KEYS.settings, settings)
  }

  async reset(): Promise<void> {
    const { prospects, signals } = seedData()
    const pipeline = this.redis.pipeline()
    pipeline.del(KEYS.prospects, KEYS.signals, KEYS.invoices, KEYS.settings, ...prospects.flatMap(prospect => AUDIO_FORMATS.map(format => KEYS.audio(prospect.id, format))))
    pipeline.hset(KEYS.prospects, Object.fromEntries(prospects.map(prospect => [prospect.id, prospect])))
    pipeline.hset(KEYS.signals, Object.fromEntries(signals.map(signal => [signal.id, signal])))
    pipeline.hset(KEYS.invoices, Object.fromEntries(seedInvoices().map(invoice => [invoice.id, invoice])))
    pipeline.set(KEYS.seeded, new Date().toISOString())
    await pipeline.exec()
  }
}

// Bump the suffix when the Store interface changes, so `next dev` drops the instance built from older code.
const STORE_KEY = Symbol.for('relance-vocale.store.v9')

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
