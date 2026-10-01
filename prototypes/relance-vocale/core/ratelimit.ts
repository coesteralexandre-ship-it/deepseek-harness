import { NextResponse } from 'next/server'

/**
 * In-memory rate limits for the routes that cost money or guard access. Per server instance: on Vercel each
 * instance counts on its own, which still bounds what one visitor can spend. Windows are sliding.
 */

const hits = new Map<string, number[]>()

/** Whether `key` may act now, allowing `max` actions per `windowMs`; a refused action is not counted. */
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter(at => now - at < windowMs)
  if (recent.length >= max) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  // Keep the map small: forget keys idle for longer than any window used here.
  if (hits.size > 5000) for (const [k, list] of hits) if (list.every(at => now - at > 86_400_000)) hits.delete(k)
  return true
}

/** The caller's address as the platform reports it; « inconnue » when nothing is forwarded (local runs). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? ''
  return forwarded.split(',')[0]?.trim() || 'inconnue'
}

/** 429 with a French message and a Retry-After hint. */
export function tooMany(what: string, retryAfterSeconds: number): NextResponse {
  return NextResponse.json({ error: `Trop de ${what} : réessayez dans ${retryAfterSeconds >= 3600 ? `${Math.round(retryAfterSeconds / 3600)} h` : `${Math.max(1, Math.round(retryAfterSeconds / 60))} min`}.` }, { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } })
}

// ---------------------------------------------------------------- daily spending cap on paid APIs

const spent = { day: '', usd: 0 }

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Dollars spent today on paid enrichment by this instance. */
export function spentToday(): number {
  return spent.day === today() ? spent.usd : 0
}

export function recordSpend(usd: number): void {
  if (spent.day !== today()) {
    spent.day = today()
    spent.usd = 0
  }
  spent.usd += usd
}

/** Daily cap in dollars for paid enrichment (`ENRICH_DAILY_USD`, 5 by default). */
export function dailyCapUsd(): number {
  const raw = Number(process.env.ENRICH_DAILY_USD ?? '5')
  return Number.isFinite(raw) && raw >= 0 ? raw : 5
}
