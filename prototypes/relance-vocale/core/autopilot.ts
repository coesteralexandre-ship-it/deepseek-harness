import { DAY_MS } from './clock.ts'
import { formatDay, formatEur } from './format.ts'
import { addDraft, applyRelanceResult, breakPromise, keepPromise, logActivity, nextAction, openPromise, sendDraft } from './receivables.ts'
import { demoCallOutcome, demoPays, simulatedCall } from './simulation.ts'
import type { Invoice, Settings } from './types.ts'

/**
 * Run one due action of `invoice` at `now`. In `demo` mode every step completes
 * on its own (simulated calls, emails marked sent, payments from the debtor's
 * profile). In `reel` mode the engine only prepares: drafts wait for a person,
 * calls wait in the call queue, payments wait for a person to confirm them.
 * Returns the invoice unchanged when nothing is due.
 */
export function runDueAction(invoice: Invoice, now: number, mode: Settings['autopilot'], force = false): Invoice {
  const action = nextAction(invoice)
  if (action === undefined || (!force && Date.parse(action.at) > now)) return invoice
  const step = action.playbookIndex !== undefined ? { ...invoice, playbookIndex: action.playbookIndex + 1 } : invoice
  switch (action.kind) {
    case 'email': {
      const drafted = addDraft(step, action.email ?? 'rappel', now)
      if (mode === 'reel') return drafted
      const draft = drafted.emails[drafted.emails.length - 1]
      return draft === undefined ? drafted : sendDraft(drafted, draft.id, now, 'autopilote', true)
    }
    case 'appel': {
      const cleared = { ...step, followUpAt: undefined }
      if (mode === 'reel') {
        // A callback asked for while a promise is pending keeps the card in Promesse: the verification stays scheduled.
        const pending = openPromise(cleared)
        const queued = pending !== undefined ? { ...cleared, knows: `Rappel convenu à passer · ${formatEur(pending.amountEur)} attendus le ${formatDay(pending.dueDate)}` } : { ...cleared, status: 'appel' as const }
        return logActivity(queued, { kind: 'appel', actor: 'autopilote', title: 'Appel à lancer', detail: `${action.label} : dans la file d’appels du jour.` }, now)
      }
      const attempt = invoice.calls.filter(call => call.status === 'termine').length
      const plan = demoCallOutcome(invoice, attempt)
      // A playbook call was consumed by `step`; a dated callback may still consume a playbook call that came due.
      return applyRelanceResult(cleared, simulatedCall(invoice, plan.outcome, now, plan.promiseInDays), now, action.playbookIndex === undefined)
    }
    case 'verification': {
      const promise = openPromise(invoice)
      if (promise === undefined || mode === 'reel') return invoice
      // Only the promise being checked is kept: a later instalment stays pending until its own date.
      return demoPays(invoice) ? keepPromise(invoice, promise.id, now, 'client') : breakPromise(invoice, promise.id, now, 'autopilote')
    }
    default:
      return logActivity({ ...step, status: 'a_vous', knows: 'Séquence terminée sans règlement' }, { kind: 'etape', actor: 'autopilote', title: 'Passage à votre équipe', detail: 'Trente jours de relance sans règlement.' }, now)
  }
}

/** Send every waiting draft, in demo mode only: the demo pretends, real mode never sends. */
function sendWaitingDrafts(invoice: Invoice, now: number): Invoice {
  return invoice.emails.filter(email => email.status === 'brouillon').reduce((current, email) => sendDraft(current, email.id, now, 'autopilote', true), invoice)
}

/** Run every action that came due, oldest first, at most eight per invoice per run. */
export function runAutopilot(invoice: Invoice, now: number, mode: Settings['autopilot']): Invoice {
  let current = invoice
  for (let round = 0; round < 8; round += 1) {
    const action = nextAction(current)
    if (action === undefined || Date.parse(action.at) > now) break
    // Run each action at its own time so the journal reads in order.
    const at = Math.min(now, Math.max(Date.parse(action.at), now - 6 * DAY_MS))
    const after = runDueAction(current, at, mode)
    if (after === current) break
    current = mode === 'demo' ? sendWaitingDrafts(after, at) : after
  }
  return current
}
