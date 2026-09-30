import type { Settings } from './types.ts'

export const DAY_MS = 86_400_000

export const DEFAULT_SETTINGS: Settings = { clockOffsetDays: 0, autopilot: 'demo' }

/** Current time of the workspace: real time plus the demo offset. */
export function appNow(settings: Settings): number {
  return Date.now() + settings.clockOffsetDays * DAY_MS
}
