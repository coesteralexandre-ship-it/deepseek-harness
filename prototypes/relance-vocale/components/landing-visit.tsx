'use client'

import { useEffect } from 'react'

/** Tells the server a person opened the public page; renders nothing. Automated browsers are skipped. */
export function LandingVisit({ token }: { token: string }) {
  useEffect(() => {
    if (navigator.webdriver) return
    void fetch(`/api/l/${token}/visite`, { method: 'POST', keepalive: true }).catch(() => undefined)
  }, [token])
  return null
}
