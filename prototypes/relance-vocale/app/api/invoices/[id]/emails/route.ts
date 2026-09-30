import { NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse, jsonError, parseBody } from '@/core/http'
import { llmConfigured, rewriteWithLlm } from '@/core/llm'
import { addDraft, logActivity, sendDraft } from '@/core/receivables'
import { getStore } from '@/core/store'
import { workspaceNow } from '@/core/workspace'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

const create = z.object({ kind: z.enum(['rappel', 'date', 'recap_promesse', 'promesse_rompue', 'recap_appel', 'litige', 'renvoi']) })

/** Prepare a new draft for the debtor. */
export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, create)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const invoice = await store.getInvoice(id)
  if (invoice === undefined) return jsonError('Facture introuvable', 404)
  const updated = addDraft(invoice, parsed.data.kind, await workspaceNow(store), 'vous')
  await store.saveInvoice(updated)
  return NextResponse.json(updated)
}

const edit = z.object({
  emailId: z.string(),
  action: z.enum(['save', 'sent', 'delete', 'polish']),
  subject: z.string().max(300).optional(),
  body: z.string().max(8000).optional(),
})

/**
 * Edit, rewrite, discard, or mark a draft as sent. Nothing is sent from here:
 * the person sends it from their own mailbox, then marks it sent.
 */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params
  const parsed = await parseBody(request, edit)
  if (!parsed.ok) return parsed.response
  const store = getStore()
  const invoice = await store.getInvoice(id)
  if (invoice === undefined) return jsonError('Facture introuvable', 404)
  const email = invoice.emails.find(entry => entry.id === parsed.data.emailId)
  if (email === undefined) return jsonError('Email introuvable', 404)
  if (email.status === 'envoye' && parsed.data.action !== 'delete') return jsonError('Cet email est déjà parti.', 409)
  const now = await workspaceNow(store)
  const edited = { ...email, subject: parsed.data.subject ?? email.subject, body: parsed.data.body ?? email.body }
  let updated = { ...invoice, emails: invoice.emails.map(entry => (entry.id === email.id ? edited : entry)) }
  try {
    switch (parsed.data.action) {
      case 'polish': {
        if (!llmConfigured()) return jsonError('Réécriture non configurée : renseigner DEEPSEEK_API_KEY.', 503)
        const body = await rewriteWithLlm('Réécris cet email de relance de facture B2B, envoyé au nom de l’agence créancière. Garde le numéro de facture, le montant, les dates et le lien. Pas plus de 120 mots.', edited.body)
        updated = { ...updated, emails: updated.emails.map(entry => (entry.id === email.id ? { ...edited, body } : entry)) }
        break
      }
      case 'sent':
        updated = sendDraft(updated, email.id, now, 'vous', false)
        break
      case 'delete':
        updated = logActivity({ ...updated, emails: updated.emails.filter(entry => entry.id !== email.id) }, { kind: 'email', actor: 'vous', title: 'Brouillon supprimé', detail: email.subject }, now)
        break
      default:
        break
    }
  } catch (error) {
    return errorResponse(error)
  }
  await store.saveInvoice(updated)
  return NextResponse.json(updated)
}
