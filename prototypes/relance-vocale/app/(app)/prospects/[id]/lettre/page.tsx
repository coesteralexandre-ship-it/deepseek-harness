import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { LetterBuilder } from '@/components/letter-builder'
import { llmConfigured } from '@/core/llm'
import { letterFor, outreachUrls } from '@/core/outreach'
import { getStore } from '@/core/store'

export const dynamic = 'force-dynamic'

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const store = getStore()
  const prospect = await store.getProspect(id)
  if (prospect === undefined) notFound()
  const signals = (await store.listSignals()).filter(signal => signal.prospectId === prospect.id)
  const urls = outreachUrls(prospect)
  const qrSvg = await QRCode.toString(urls.landingUrl, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#17150f', light: '#0000' },
  })

  return (
    <LetterBuilder
      prospectId={prospect.id}
      company={prospect.company}
      initialText={letterFor(prospect, signals)}
      saved={prospect.letter !== undefined}
      qrSvg={qrSvg}
      landingUrl={urls.landingUrl}
      llm={llmConfigured()}
    />
  )
}
