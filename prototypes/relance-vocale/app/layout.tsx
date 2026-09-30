import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { PRODUCT_NAME } from '@/core/agent-prompt'
import './globals.css'

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} · relance vocale`,
  description: 'L’agent vocal qui relance les factures échues des agences d’intérim, obtient une date de règlement et suit la promesse jusqu’au virement.',
}

export const viewport: Viewport = { themeColor: '#f7f4f3' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=DM+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="font-body bg-canvas text-ink antialiased min-h-screen">{children}</body>
    </html>
  )
}
