'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { STAGE_META } from '@/core/stages'
import { STAGES, type Stage } from '@/core/types'

export function StageSelect({ prospectId, stage }: { prospectId: string; stage: Stage }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function change(next: Stage) {
    setPending(true)
    try {
      await fetch(`/api/prospects/${prospectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage: next }),
      })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <label className="block">
      <span className="label">Étape du pipeline</span>
      <select className="field mt-1.5" value={stage} disabled={pending} onChange={event => change(event.target.value as Stage)}>
        {STAGES.map(option => (
          <option key={option} value={option}>{STAGE_META[option].label}</option>
        ))}
      </select>
    </label>
  )
}
