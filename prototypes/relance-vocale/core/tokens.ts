import { randomBytes } from 'node:crypto'

/** Unguessable token for a prospect's public landing page (12 base64url characters). */
export function newLandingToken(): string {
  return randomBytes(9).toString('base64url')
}
