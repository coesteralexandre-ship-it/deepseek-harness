import { AGENT_NAME } from '@/core/agent-prompt'
import type { TranscriptTurn } from '@/core/types'

export function Transcript({ turns, userName }: { turns: TranscriptTurn[]; userName: string }) {
  return (
    <ol className="space-y-3">
      {turns.map((turn, index) => (
        <li key={index} className={`grid grid-cols-[72px_1fr] gap-3 text-[13px] leading-relaxed ${turn.role === 'user' ? 'text-ink-2' : ''}`}>
          <span className={`font-mono text-[10px] uppercase tracking-[0.14em] pt-0.5 ${turn.role === 'agent' ? 'text-red' : 'text-muted'}`}>
            {turn.role === 'agent' ? AGENT_NAME : userName}
          </span>
          <p>{turn.text}</p>
        </li>
      ))}
    </ol>
  )
}
