import { runAutopilot } from './autopilot.ts'
import { DAY_MS, appNow } from './clock.ts'
import { boardView, type BoardView } from './board-view.ts'
import type { Store } from './store.ts'
import type { Invoice, Settings } from './types.ts'

export interface Board {
  invoices: Invoice[]
  settings: Settings
  /** Workspace time, ms since epoch. */
  now: number
}

/** Invoices, settings and the workspace clock, in one read. */
export async function readBoard(store: Store): Promise<Board> {
  const [invoices, settings] = await Promise.all([store.listInvoices(), store.getSettings()])
  return { invoices, settings, now: appNow(settings) }
}

/**
 * Move the workspace clock `days` ahead (0 runs what is already due), one day
 * at a time, and let the autopilot act on every invoice. Saves and returns the board.
 */
export async function advance(store: Store, days: number): Promise<Board> {
  const board = await readBoard(store)
  let invoices = board.invoices
  const settings: Settings = { ...board.settings, clockOffsetDays: board.settings.clockOffsetDays + days }
  for (let day = 1; day <= Math.max(1, days); day += 1) {
    const at = days === 0 ? board.now : board.now + day * DAY_MS
    invoices = invoices.map(invoice => runAutopilot(invoice, at, settings.autopilot))
  }
  await Promise.all([store.saveInvoices(invoices), store.saveSettings(settings)])
  return { invoices, settings, now: appNow(settings) }
}

/** Workspace time: real time plus the demo offset. */
export async function workspaceNow(store: Store): Promise<number> {
  return appNow(await store.getSettings())
}

/** The rendered board: what the pipeline page and the autopilot API return. */
export async function readBoardView(store: Store): Promise<BoardView> {
  const board = await readBoard(store)
  return boardView(board.invoices, board.settings, board.now)
}
