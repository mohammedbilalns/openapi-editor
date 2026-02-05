import React from "react"
import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { Analytics } from '@vercel/analytics/next'

import './globals.css'
import { spaceGrotesk, spaceMono } from "@/lib/fonts"

export const metadata: Metadata = {
  title: 'OpenAPI WYSIWYG Editor',
  description: 'A visual editor for creating and editing OpenAPI 3.x specifications',
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
