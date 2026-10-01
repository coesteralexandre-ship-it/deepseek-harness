import { AGENT_NAME, PRODUCT_NAME } from './agent-prompt.ts'
import { CALLBACK_REQUEST_TITLE, LANDING_VISIT_TITLE } from './landing.ts'
import { sortSignals } from './signals.ts'
import type { Prospect, Signal, SignalSource } from './types.ts'

export interface OutreachInput {
  prospect: Prospect
  signals: readonly Signal[]
  callerName: string
  /** Public page the QR code and the voice note point to. */
  landingUrl: string
  date?: Date
}

/** Signal title without the quotation marks it may already carry. */
function bare(title: string): string {
  return title.replace(/^[«"“\s]+|[»"”\s]+$/gu, '')
}

/**
 * Opening sentence of the letter, keyed by the strongest signal's source. It
 * names the fact; the prospect's angle, printed right after, carries the pitch.
 */
const LETTER_HOOKS: Record<SignalSource, (signal: Signal) => string> = {
  linkedin: signal => `Votre post « ${bare(signal.title)} » m’a arrêtée : vous y décrivez ce que vivent la plupart des agences, des paies avancées chaque vendredi et des clients qui règlent quand ils veulent.`,
  offre_emploi: signal => `Vous recrutez « ${bare(signal.title)} » : le signe que la relance déborde.`,
  pappers: signal => `Vos derniers comptes publiés racontent une histoire que vous connaissez : ${signal.title.charAt(0).toLowerCase()}${signal.title.slice(1)}.`,
  bodacc: signal => `${signal.title}. Quand les clients de votre secteur vacillent, ce sont vos factures en cours qu’il faut sécuriser vite, sans braquer personne.`,
  marches: signal => `${signal.title} : les acheteurs publics paient, mais à leur rythme, et vos paies partent chaque semaine.`,
  presse: signal => `${signal.title} : bravo. La croissance a un revers discret, plus de paies avancées avant d’être encaissées.`,
  avis: () => 'Quand des intérimaires évoquent des paies en retard, c’est rarement une question de volonté : c’est de la trésorerie qui arrive après les salaires.',
  inbound: signal => `${signal.title}. Vous avez donc déjà la question en tête ; je vous propose une réponse que vous pouvez entendre plutôt que lire.`,
  recommandation: signal => `${signal.title}, et on m’a dit que vous aviez la même difficulté avec vos grands comptes.`,
}

/** One sentence for the voice note, keyed by the strongest signal's source. */
const VOICE_HOOKS: Record<SignalSource, (signal: Signal) => string> = {
  linkedin: () => 'J’ai lu votre post sur les clients qui règlent à quatre-vingt-dix jours.',
  offre_emploi: () => 'J’ai vu que vous recrutez pour la relance et le recouvrement.',
  pappers: () => 'Vos derniers comptes publiés montrent un délai client au-dessus de celui des autres agences.',
  bodacc: () => 'Les défaillances d’entreprises clientes de l’intérim montent dans votre département.',
  marches: () => 'Vous travaillez pour des acheteurs publics, et je sais à quel rythme ils paient.',
  presse: () => 'J’ai vu que vous ouvrez de nouvelles agences, et je sais ce que ça fait au BFR.',
  avis: () => 'Je sais qu’avancer les paies avant d’être payé, c’est un sport de combat.',
  inbound: () => 'Vous avez déjà la question en tête, alors je vous réponds de vive voix.',
  recommandation: signal => `${signal.title.replace(/^Recommandée? par /u, '')} m’a parlé de vous.`,
}

/** Strongest signal usable as a hook; landing-page events are engagement, not something to quote back. */
function strongest(signals: readonly Signal[]): Signal | undefined {
  return sortSignals(signals.filter(signal =>
    signal.status !== 'ignore' && signal.title !== LANDING_VISIT_TITLE && signal.title !== CALLBACK_REQUEST_TITLE))[0]
}

function formatLetterDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

/** Full letter text, paragraphs separated by blank lines. Editable before printing. */
export function buildLetter({ prospect, signals, callerName, landingUrl, date = new Date() }: OutreachInput): string {
  const top = strongest(signals)
  const hook = top === undefined
    ? 'Je me permets ce courrier parce que les agences d’intérim avancent les paies chaque semaine et se font payer à quarante-cinq ou soixante jours.'
    : LETTER_HOOKS[top.source](top)
  const { firstName, lastName, role } = prospect.contact
  const fullName = `${firstName} ${lastName}`.trim()
  return [
    // The head office address from the public directory when known, the town otherwise; a company whose representative is not published gets the management.
    `${prospect.company}\n${fullName !== '' ? `À l’attention ${/^[aeiouyhàâéèêîôû]/iu.test(fullName) ? 'd’' : 'de '}${fullName}, ${role}` : 'À l’attention de la direction'}\n${prospect.address ?? prospect.city}`,
    `Le ${formatLetterDate(date)}`,
    'Objet : deux minutes pour entendre ce que vos clients entendraient',
    fullName !== '' ? `Bonjour ${fullName},` : 'Madame, Monsieur,',
    // An angle that already opens on the same fact replaces the hook instead of repeating it.
    ...(hook.slice(0, 10).toLowerCase() === prospect.angle.slice(0, 10).toLowerCase() ? [prospect.angle] : [hook, prospect.angle]),
    `Je m’appelle ${AGENT_NAME}. Je suis l’agent vocal d’${PRODUCT_NAME}, et je suis une intelligence artificielle : je relance par téléphone les factures échues des agences d’intérim, à J+3, J+10 et J+20, avec un ton qui préserve la relation, et je passe la main à un humain dès qu’un litige apparaît.`,
    `Plutôt qu’une plaquette, je vous propose de m’entendre. Scannez le code ci-contre, ou ouvrez ${landingUrl} : je vous rappelle, ou nous parlons directement depuis votre navigateur. Deux minutes, sans engagement.`,
    `Si cela vaut la peine d’aller plus loin, ${callerName} vous montrera l’agent sur vos propres factures, en vingt minutes.`,
    `Bien à vous,\n${AGENT_NAME}, pour ${callerName}\n${PRODUCT_NAME}`,
    'Vos coordonnées professionnelles viennent de sources publiques (annuaire des entreprises, comptes déposés à l’INPI). Vous ne souhaitez plus être contacté ? Répondez « stop » à ce courrier ou au message vocal et nous vous retirons de nos listes.',
  ].join('\n\n')
}

/** Script of the ~40 second voice note, spoken by the agent's voice. */
export function buildVoiceScript({ prospect, signals, callerName }: OutreachInput): string {
  const top = strongest(signals)
  const hook = top === undefined ? 'Je sais qu’avancer les paies avant d’être payé, c’est un sport de combat.' : VOICE_HOOKS[top.source](top)
  const { firstName } = prospect.contact
  const hello = firstName !== '' ? `Bonjour ${firstName}` : 'Bonjour'
  return [
    `${hello}, ici ${AGENT_NAME}, l’assistante vocale d’${PRODUCT_NAME}. Je suis une intelligence artificielle, et je vous laisse ce message plutôt qu’un email.`,
    hook,
    'Je suis l’agent qui relancerait vos clients : ce que vous entendez maintenant, c’est exactement le ton qu’ils entendraient. Courtois, précis, sans pression, et un humain reprend la main dès qu’un litige apparaît.',
    `Si vous voulez m’entendre en vrai, ouvrez le lien qui accompagne ce message : je vous rappelle, ou nous parlons directement. Deux minutes, et vous saurez si ça vaut vingt minutes avec ${callerName}.`,
    firstName !== '' ? `Bonne journée, ${firstName}.` : 'Bonne journée.',
  ].join(' ')
}
