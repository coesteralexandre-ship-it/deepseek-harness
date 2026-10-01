/** Shared-code gate of the internal pages. The cookie stores a digest, never the code. */

export const ACCESS_COOKIE = 'ech_access'

/** Hex SHA-256 of the access code, the value the cookie must carry. */
export async function accessDigest(code: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`echeance:${code}`))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Constant-time equality of two digests, so a mismatch takes as long whatever the first differing byte. */
export function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Paths anyone may reach: the prospect's and the debtor's pages, their APIs, and machine callbacks (the cron checks its own secret). */
const PUBLIC_PREFIXES = ['/l/', '/f/', '/api/l/', '/api/f/', '/api/webhooks/', '/api/tools/', '/api/cron/', '/api/auth', '/connexion']

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix))
}
