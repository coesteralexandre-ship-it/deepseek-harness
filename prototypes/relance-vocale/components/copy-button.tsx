'use client'

import { useState } from 'react'

export function CopyButton({ text, label = 'Copier', className = '' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button type="button" onClick={copy} className={`btn btn-sm ${className}`}>
      {copied ? 'Copié ✓' : label}
    </button>
  )
}
