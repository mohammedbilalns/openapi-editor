import React from "react"
import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { ServiceWorkerRegistration } from '@/components/service-worker-registration'
import { Analytics } from '@vercel/analytics/next'

import './globals.css'
import { spaceGrotesk, spaceMono } from "@/lib/fonts"

export const metadata: Metadata = {
  title: 'OpenAPI WYSIWYG Editor',
  description: 'A visual editor for creating and editing OpenAPI 3.x specifications',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'API Author',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#ffc61a',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${spaceGrotesk.variable} ${spaceMono.variable}`}>
      <head>
        <meta name="apple-mobile-web-app-title" content="API Author" />
      </head>
      <body className="font-sans antialiased">
        <ServiceWorkerRegistration />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
