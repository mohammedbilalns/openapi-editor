import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { DefaultErrorComponent } from '@/components/default-error'
import { NotFound } from '@/components/not-found'
import { ServiceWorkerRegistration } from '@/components/service-worker-registration'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { THEME_COLORS, themeInitScript } from '@/lib/theme'
import appCss from '@/styles.css?url'

const TITLE = 'OpenAPI Editor'
const DESCRIPTION = 'A visual editor for creating and editing OpenAPI 3.x specifications'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1' },
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      { name: 'theme-color', content: THEME_COLORS.dark },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      { name: 'apple-mobile-web-app-title', content: 'API Author' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/icon.png', type: 'image/png', sizes: '96x96' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
    ],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
  errorComponent: DefaultErrorComponent,
  notFoundComponent: NotFound,
})

function RootComponent() {
  return (
    <ThemeProvider>
      <TooltipProvider delay={300}>
        <Outlet />
      </TooltipProvider>
      <ServiceWorkerRegistration />
    </ThemeProvider>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    // The inline theme script sets the class/colour-scheme before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
