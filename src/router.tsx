import { createRouter } from '@tanstack/react-router'
import { DefaultErrorComponent } from '@/components/default-error'
import { NotFound } from '@/components/not-found'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
    defaultNotFoundComponent: NotFound,
    defaultPendingComponent: PendingShell,
    scrollRestoration: true,
  })
}

/** Rendered into the prerendered SPA shell in place of the matched route. */
function PendingShell() {
  return <div className="min-h-svh bg-background" aria-busy="true" />
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
