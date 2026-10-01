import { AGENT_NAME } from './agent-prompt.ts'
import { answerUrl } from './client.ts'
import { daysSince, formatDay, formatEur, formatLongDay } from './format.ts'
import { newId } from './ids.ts'
import type { EmailDraft, EmailKind, Invoice } from './types.ts'

export const EMAIL_KIND_META: Record<EmailKind, { label: string; hint: string }> = {
  rappel: { label: 'Rappel courtois', hint: 'Le lendemain de l’échéance, avec la facture et le lien de réponse' },
  date: { label: 'Demande de date', hint: 'Une semaine après, pour obtenir une date de règlement' },
  recap_promesse: { label: 'Récapitulatif de promesse', hint: 'Après un appel qui a donné une date : à confirmer d’un clic' },
  avis_virement: { label: 'Demande d’avis de virement', hint: 'Le client dit avoir déjà réglé : on demande la référence pour le retrouver' },
  promesse_rompue: { label: 'Promesse non tenue', hint: 'Le lendemain d’une date promise sans virement' },
  recap_appel: { label: 'Récapitulatif d’appel', hint: 'Après l’appel ferme, pour garder une trace écrite' },
  litige: { label: 'Réponse au litige', hint: 'La pièce manquante, envoyée par votre équipe' },
  renvoi: { label: 'Facture renvoyée', hint: 'Quand la facture n’était pas arrivée chez la bonne personne' },
}

function firstName(invoice: Invoice): string {
  return invoice.debtor.contactName.split(' ')[0] ?? invoice.debtor.contactName
}

function lastCallDate(invoice: Invoice): string | undefined {
  const call = [...invoice.calls].reverse().find(entry => entry.status === 'termine' && entry.mode !== 'navigateur')
  return call === undefined ? undefined : formatLongDay(call.startedAt)
}


/**
 * Subject and body of an email for `invoice`, written from its current state.
 * The answer link lets the debtor reply in one minute; opening it is logged.
 */
export function composeEmail(invoice: Invoice, kind: EmailKind, now: number): { subject: string; body: string } {
  const name = firstName(invoice)
  const amount = formatEur(invoice.amountEur, true)
  const due = formatLongDay(invoice.dueDate)
  const late = daysSince(invoice.dueDate, now)
  const link = answerUrl(invoice)
  const promise = [...invoice.promises].reverse().find(entry => entry.status !== 'tenue')
  const called = lastCallDate(invoice)
  // Every payment still expected, in date order: a payment in two parts is recapped in full.
  const pending = invoice.promises.filter(entry => entry.status === 'attendue').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  // The date the debtor gave for a payment already made, not the day the check was scheduled.
  const claimedOn = invoice.answer?.outcome === 'deja_regle' ? invoice.answer.promiseDate : undefined
  const SIGNATURE = `Bien cordialement,\n${invoice.creditor.team}\n${invoice.creditor.company}, ${invoice.creditor.city}`
  switch (kind) {
    case 'rappel':
      return {
        subject: `Facture ${invoice.number} arrivée à échéance`,
        body: `Bonjour ${name},\n\nSauf erreur de notre part, la facture ${invoice.number} de ${amount} (${invoice.mission}) est arrivée à échéance le ${due}. Vous la trouverez en pièce jointe.\n\nSi le règlement est déjà parti, merci d’ignorer ce message. Sinon, vous pouvez nous indiquer la date prévue en une minute, sans compte : ${link}\n\n${SIGNATURE}`,
      }
    case 'date':
      return {
        subject: `Facture ${invoice.number} : pouvez-vous nous donner une date ?`,
        body: `Bonjour ${name},\n\n${called !== undefined ? `Suite à l’appel de ${AGENT_NAME}, notre assistante vocale, le ${called}, je` : 'Je'} reviens vers vous au sujet de la facture ${invoice.number} de ${amount}, échue depuis ${late} jours.\n\nPouvez-vous nous indiquer à quelle date le règlement est prévu ? Un paiement en deux fois nous convient s’il vous arrange. Vous pouvez répondre à cet email ou directement ici : ${link}\n\nS’il manque une pièce (relevé d’heures, contrat de mise à disposition), dites-le-nous : nous vous l’envoyons le jour même.\n\n${SIGNATURE}`,
      }
    case 'recap_promesse': {
      const lines = pending.length > 0
        ? pending.map(entry => `· ${formatEur(entry.amountEur, true)} le ${formatLongDay(entry.dueDate)}`).join('\n')
        : `· Montant : ${amount}\n· Date de règlement : à préciser`
      const first = pending[0]
      const subject = pending.length > 1
        ? `Récapitulatif : règlement en ${pending.length} fois, à partir du ${formatDay(first?.dueDate ?? invoice.dueDate)}`
        : `Récapitulatif : règlement de ${first !== undefined ? formatEur(first.amountEur) : amount} le ${first !== undefined ? formatDay(first.dueDate) : 'jour convenu'}`
      return {
        subject,
        body: `Bonjour ${name},\n\nMerci pour votre retour${called !== undefined ? ` lors de notre échange du ${called}` : ''}. Voici ce que nous avons noté pour la facture ${invoice.number} :\n\n${lines}\n\nPouvez-vous confirmer d’un clic que c’est bien exact ? ${link}\n\nNous ne vous relancerons pas d’ici là.\n\n${SIGNATURE}`,
      }
    }
    case 'avis_virement':
      return {
        subject: `Facture ${invoice.number} : pouvez-vous nous transmettre l’avis de virement ?`,
        body: `Bonjour ${name},\n\nMerci${called !== undefined ? ` pour votre retour lors de notre échange du ${called}` : ' pour votre retour'} : vous nous indiquez que la facture ${invoice.number} de ${amount} a été réglée${claimedOn !== undefined ? ` le ${formatLongDay(claimedOn)}` : ''}.\n\nNous ne retrouvons pas encore ce virement sur notre relevé. Pour le rapprocher sans vous relancer, pouvez-vous nous transmettre l’avis de virement ou sa référence ? Vous pouvez répondre à cet email ou ici : ${link}\n\nNous suspendons les relances le temps de vérifier.\n\n${SIGNATURE}`,
      }
    case 'promesse_rompue': {
      // The promise that just broke, not a later instalment still ahead.
      const broken = [...invoice.promises].reverse().find(entry => entry.status === 'rompue') ?? promise
      if (broken?.claimed === true) {
        return {
          subject: `Facture ${invoice.number} : nous ne retrouvons pas votre virement`,
          body: `Bonjour ${name},\n\nVous nous avez indiqué avoir réglé la facture ${invoice.number} de ${formatEur(broken.amountEur)}${claimedOn !== undefined ? ` le ${formatLongDay(claimedOn)}` : ''}. Nous ne retrouvons pas ce virement sur notre relevé.\n\nPouvez-vous nous transmettre l’avis de virement, ou nous indiquer la date à laquelle il partira ? ${link}\n\n${SIGNATURE}`,
        }
      }
      return {
        subject: `Facture ${invoice.number} : règlement prévu non reçu`,
        body: `Bonjour ${name},\n\nNous n’avons pas encore reçu le règlement de ${broken !== undefined ? formatEur(broken.amountEur) : amount} prévu le ${broken !== undefined ? formatLongDay(broken.dueDate) : 'jour convenu'} pour la facture ${invoice.number}. Il s’agit peut-être d’un simple décalage.\n\nPouvez-vous nous indiquer la nouvelle date ? ${link}\n\n${SIGNATURE}`,
      }
    }
    case 'recap_appel':
      return {
        subject: `Facture ${invoice.number} : suite à notre appel`,
        body: `Bonjour ${name},\n\n${called !== undefined ? `Suite à l’appel du ${called}, ` : ''}la facture ${invoice.number} de ${amount} reste en attente de règlement, ${late} jours après son échéance.\n\nPour que nous puissions clôturer ce dossier, merci de nous indiquer une date de règlement, ou ce qui bloque le paiement : ${link}\n\nSans retour de votre part, un membre de notre équipe vous contactera directement.\n\n${SIGNATURE}`,
      }
    case 'litige':
      return {
        subject: `Facture ${invoice.number} : la pièce que vous attendiez`,
        body: `Bonjour ${name},\n\nVous nous avez signalé un blocage sur la facture ${invoice.number} : ${invoice.disputeReason ?? 'une pièce manquante'}\n\nVous trouverez la pièce corrigée en pièce jointe. Dès validation de votre côté, pouvez-vous nous indiquer la date de règlement ? ${link}\n\n${SIGNATURE}`,
      }
    default:
      return {
        subject: `Facture ${invoice.number} (${amount}), comme convenu`,
        body: `Bonjour ${name},\n\nComme convenu, voici la facture ${invoice.number} de ${amount} pour ${invoice.mission}, échue le ${due}, en pièce jointe.\n\nVous pouvez nous indiquer la date de règlement prévue ici : ${link}\n\n${SIGNATURE}`,
      }
  }
}

/** A new draft of `kind`, addressed to the debtor. */
export function draftEmail(invoice: Invoice, kind: EmailKind, now: number): EmailDraft {
  const { subject, body } = composeEmail(invoice, kind, now)
  return { id: newId('em'), kind, to: invoice.debtor.email, subject, body, status: 'brouillon', createdAt: new Date(now).toISOString() }
}
