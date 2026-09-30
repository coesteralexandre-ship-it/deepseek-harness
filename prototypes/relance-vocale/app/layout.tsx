import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PRODUCT_NAME } from '@/core/agent-prompt'
import './globals.css'

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — relance vocale`,
  description: 'Signaux d’impayés → pipeline → appel par agent vocal. Démo pour agences d’intérim.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,600&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="font-body bg-paper text-ink antialiased min-h-screen">{children}</body>
    </html>
  )
}
