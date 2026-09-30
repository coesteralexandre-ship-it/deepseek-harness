import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AGENT_NAME, PRODUCT_NAME } from '@/core/agent-prompt'
import { callerName } from '@/core/env'
import { jsonError, parseBody } from '@/core/http'
import { applyCallResult } from '@/core/outcome'
import { getStore } from '@/core/store'
import type { CallOutcome, Prospect, TranscriptTurn } from '@/core/types'
import { toView } from '@/core/views'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const body = z.object({
  outcome: z.enum(['rdv', 'rappel', 'refus']).optional(),
})

function pickOutcome(): CallOutcome {
  const roll = Math.random()
  if (roll < 0.45) return 'rdv'
  if (roll < 0.8) return 'rappel'
  return 'refus'
}

function script(prospect: Prospect, outcome: CallOutcome): { transcript: TranscriptTurn[]; summary: string; meetingSlot?: string; callbackAt?: string } {
  const first = prospect.contact.firstName
  const opening: TranscriptTurn[] = [
    { role: 'agent', text: `Bonjour ${first}, ici ${AGENT_NAME}, l’assistante vocale d’${PRODUCT_NAME}. Je suis une intelligence artificielle. Je vous appelle deux minutes au sujet des retards de paiement de vos clients : c’est le bon moment ?` },
  ]
  switch (outcome) {
    case 'rdv':
      return {
        transcript: [
          ...opening,
          { role: 'user', text: 'Allez-y, deux minutes.' },
          { role: 'agent', text: `${prospect.angle} Là, vous entendez exactement ce que vos clients entendraient : un rappel courtois à J+3, jamais de pression.` },
          { role: 'user', text: 'Et si le client conteste la facture ?' },
          { role: 'agent', text: 'Je note le motif et je passe la main à votre équipe le jour même. Je vous propose 20 minutes avec ' + callerName() + ' pour le voir sur vos vraies factures : jeudi 11 h, ça vous va ?' },
          { role: 'user', text: 'Jeudi 11 h, c’est bon.' },
          { role: 'agent', text: 'Parfait, jeudi 11 h avec ' + callerName() + '. Merci ' + first + ', bonne journée.' },
        ],
        summary: `${first} a écouté la démo et veut voir l’escalade vers un humain sur ses factures. Rendez-vous jeudi 11 h.`,
        meetingSlot: 'jeudi 11 h',
      }
    case 'rappel':
      return {
        transcript: [
          ...opening,
          { role: 'user', text: 'Je suis en réunion, rappelez-moi plutôt.' },
          { role: 'agent', text: 'Bien sûr. Demain 9 h 30, ça vous convient ?' },
          { role: 'user', text: 'Oui, demain 9 h 30.' },
          { role: 'agent', text: 'Noté, demain 9 h 30. Bonne réunion.' },
        ],
        summary: `${first} était en réunion. Rappel demandé demain 9 h 30.`,
        callbackAt: 'demain 9 h 30',
      }
    default:
      return {
        transcript: [
          ...opening,
          { role: 'user', text: 'On a déjà un prestataire pour ça, merci.' },
          { role: 'agent', text: `Compris, je n’insiste pas. Merci ${first}, bonne journée.` },
        ],
        summary: `${first} a déjà un prestataire de recouvrement. Pas d’intérêt pour l’instant ; à recycler dans 90 jours.`,
      }
  }
}

/** Fake a finished call so the pipeline can be shown without an ElevenLabs account. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, body)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) return jsonError('Prospect introuvable', 404)
  const outcome = parsed.data.outcome ?? pickOutcome()
  const played = script(prospect, outcome)
  const updated = applyCallResult(prospect, { mode: 'simulation', outcome, ...played })
  await store.saveProspect(updated)
  return NextResponse.json(toView(updated, await store.listSignals()))
}
