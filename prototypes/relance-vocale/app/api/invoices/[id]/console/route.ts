import { NextResponse } from 'next/server'
import { AGENT_NAME } from '@/core/agent-prompt'
import { elevenLabsEnv } from '@/core/env'
import { jsonError } from '@/core/http'
import { relanceVariablesFor } from '@/core/relance-prompt'
import { getStore } from '@/core/store'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

/** Props of the voice console for one invoice, so the board can open it in a side panel. */
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params
  const store = getStore()
  const invoice = await store.getInvoice(id)
  if (invoice === undefined) return jsonError('Facture introuvable', 404)
  const now = await workspaceNow(store)
  const env = elevenLabsEnv()
  const browserReady = env.apiKey !== undefined && env.relanceAgentId !== undefined
  return NextResponse.json({
    id: invoice.id,
    title: `Relancer ${invoice.debtor.company}`,
    roleHint: `Vous jouez ${invoice.debtor.contactName} : ${AGENT_NAME} vous relance au nom de ${invoice.creditor.company}. Répondez librement, la fiche se met à jour.`,
    userName: invoice.debtor.contactName.split(' ')[0] ?? invoice.debtor.contactName,
    phone: invoice.debtor.phone,
    browserReady,
    phoneReady: browserReady && env.phoneNumberId !== undefined,
    dynamicVariables: relanceVariablesFor(invoice, new Date(now), { liveTool: true }),
    defaultAmountEur: invoice.amountEur,
  })
}
