import { AutopilotMode } from '@/components/autopilot-mode'
import { PageHead } from '@/components/page-head'
import { AGENT_NAME } from '@/core/agent-prompt'
import { EMAIL_KIND_META } from '@/core/emails'
import { PLAYBOOK } from '@/core/receivables'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

const KIND_STYLE = {
  email: { band: 'var(--color-amethyst-vivid)', pill: 'pill-amethyst', label: 'Email' },
  appel: { band: 'var(--color-turquoise-vivid)', pill: 'pill-turquoise', label: 'Appel de Léa' },
  humain: { band: 'var(--color-sienna-vivid)', pill: 'pill-sienna', label: 'Humain' },
} as const

const RULES = [
  { when: 'Le client donne une date au téléphone', then: 'Promesse créée, récapitulatif à confirmer d’un clic, plus aucune relance jusqu’à la date.', tone: 'pill-warn', move: 'Promesse' },
  { when: 'La date promise passe sans virement', then: 'Email « règlement non reçu » et rappel de Léa le lendemain à 9 h.', tone: 'pill-turquoise', move: 'Appel' },
  { when: 'Deux promesses non tenues', then: 'Votre équipe reprend : demander un acompte ou plafonner l’encours.', tone: 'pill-sienna', move: 'À vous' },
  { when: 'Trois appels sans réponse', then: 'Léa passe la main, avec l’historique complet.', tone: 'pill-sienna', move: 'À vous' },
  { when: 'Le client conteste (relevé d’heures, contrat, montant)', then: 'La séquence s’arrête, un brouillon avec la pièce attend votre équipe.', tone: 'pill-hot', move: 'Litige' },
  { when: 'La facture n’est jamais arrivée', then: 'Brouillon de renvoi à la bonne personne, rappel dans trois jours.', tone: 'pill-amethyst', move: 'Email envoyé' },
  { when: 'Le client répond sur sa page', then: 'La carte bouge tout de suite : date, litige, bon interlocuteur ou rappel.', tone: 'pill-neutral', move: 'Selon la réponse' },
  { when: 'Le virement arrive', then: 'Promesse tenue, facture close, fiabilité du payeur mise à jour.', tone: 'pill-ok', move: 'Encaissé' },
]

export default async function AutomationsPage() {
  const settings = await getStore().getSettings()
  return (
    <>
      <PageHead
        eyebrow="Automatisations · la séquence et ses règles"
        title={<>Trente jours de relance, <span className="accent">écrits une fois.</span></>}
        lead={`Chaque facture échue suit cette séquence. Une date obtenue, un litige ou un virement l’interrompent ; les règles décident de la colonne suivante.`}
      />

      <section className="card overflow-x-auto p-6">
        <p className="label">La séquence</p>
        <div className="relative mt-6 min-w-[900px]">
          <div className="absolute left-0 right-0 top-[22px] h-[2px] bg-line" aria-hidden="true" />
          <ol className="relative grid grid-cols-6 gap-4">
            {PLAYBOOK.map(step => {
              const style = KIND_STYLE[step.kind]
              return (
                <li key={step.id} className="min-w-0">
                  <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-card bg-ink text-[13px] font-bold text-white shadow-[0_0_0_1px_var(--color-line)]">J+{step.day}</span>
                  <div className="card mt-4 p-4" style={{ boxShadow: `inset 0 3px 0 ${style.band}, 0 1px 2px rgba(2,13,35,.05)` }}>
                    <span className={`pill ${style.pill}`}>{style.label}</span>
                    <p className="mt-2.5 text-[14.5px] font-bold leading-snug text-ink">{step.label}</p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{step.goal}</p>
                    {step.email !== undefined && <p className="mt-2 text-[11.5px] font-semibold text-amethyst">Brouillon : {EMAIL_KIND_META[step.email].label}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section>
          <p className="eyebrow">Les règles</p>
          <ul className="card mt-3 divide-y divide-line">
            {RULES.map(rule => (
              <li key={rule.when} className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <p className="text-[14px] font-bold text-ink">Si {rule.when.charAt(0).toLowerCase()}{rule.when.slice(1)}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{rule.then}</p>
                </div>
                <span className={`pill ${rule.tone} justify-self-start sm:justify-self-end`}>→ {rule.move}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-6">
          <div>
            <p className="eyebrow">Mode</p>
            <div className="mt-3"><AutopilotMode mode={settings.autopilot} /></div>
          </div>
          <div className="card p-5">
            <p className="label">Garde-fous</p>
            <ul className="mt-3 space-y-2.5 text-[13.5px] leading-relaxed text-ink-2">
              <li className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" />{AGENT_NAME} dit qu’elle est une IA dès sa première phrase et parle au nom de votre agence.</li>
              <li className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" />Jamais de menace ni de pénalité à la voix, jamais de coordonnées bancaires modifiées.</li>
              <li className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" />Au plus un appel par jour et par facture, du lundi au vendredi.</li>
              <li className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" />En mode réel, aucun email ne part sans vous.</li>
            </ul>
          </div>
          <div className="card p-5">
            <p className="label">Chaque matin</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted">Une tâche planifiée Vercel appelle <span className="font-mono text-[12px] text-blue">/api/cron/autopilot</span> à 8 h : elle exécute ce qui est dû, sans que personne n’ouvre l’application.</p>
          </div>
        </section>
      </div>
    </>
  )
}
