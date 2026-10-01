import type { Prospect, ProspectRecord } from './types.ts'

/** A way of reaching a prospect; each is refused the same way once the person asked not to be contacted. */
export type Channel = 'appel' | 'lettre' | 'email' | 'whatsapp' | 'lemlist'

const CHANNEL_LABEL: Record<Channel, string> = { appel: 'appel', lettre: 'courrier', email: 'email', whatsapp: 'message WhatsApp', lemlist: 'ajout à une campagne' }

/**
 * Why `channel` must not be used on this prospect, in French; undefined when the contact is allowed.
 * Checked by every route that reaches out (call, lemlist, WhatsApp) and shown on the letter.
 */
export function contactBlock(prospect: Prospect, channel: Channel): string | undefined {
  const optOut = prospect.record?.optOut
  if (optOut !== undefined) return `Opposition reçue le ${new Date(optOut.at).toLocaleDateString('fr-FR')} (${optOut.reason}) : aucun ${CHANNEL_LABEL[channel]}.`
  if (channel === 'appel' && prospect.contact.phone.trim() === '') return 'Aucun numéro de téléphone sur cette fiche.'
  return undefined
}

/**
 * Where the data of a prospect comes from, for the record shown on the fiche and cited in the letter.
 * Prospects built from the signal run carry a SIREN; the others were typed in or found by the radar.
 */
export function recordOf(prospect: Prospect, generatedAt?: string): ProspectRecord {
  if (prospect.record !== undefined) return prospect.record
  const when = generatedAt ?? prospect.createdAt
  return {
    source: prospect.siren !== undefined
      ? 'Sources publiques : annuaire des entreprises (représentant légal, siège), ratios INPI, offres HelloWork, BODACC, site de l’agence et LinkedIn.'
      : 'Saisie dans l’espace, ou trouvée par le radar (annuaire des entreprises et ratios INPI).',
    collectedAt: when,
  }
}

/** Human-readable status for lists: « Ne plus contacter » wins over everything. */
export function contactStatus(prospect: Prospect): 'opposition' | 'ok' {
  return prospect.record?.optOut !== undefined ? 'opposition' : 'ok'
}
