import { AgencySettings } from '@/components/agency-settings'
import { PageHead } from '@/components/page-head'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const settings = await getStore().getSettings()
  return (
    <>
      <PageHead
        eyebrow="Réglages · votre agence"
        title={<>Léa parle <span className="accent">en votre nom.</span></>}
        lead="Ces informations signent les emails, ouvrent chaque appel et fixent la paie hebdomadaire que les promesses doivent couvrir."
      />
      <div className="max-w-3xl"><AgencySettings agency={settings.agency} /></div>
    </>
  )
}
