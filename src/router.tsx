import { createRouter } from '@tanstack/react-router'
import { DefaultErrorComponent } from '@/components/default-error'
import { NotFound } from '@/components/app/not-found'
import { ShellSkeleton } from '@/components/app/shell-skeleton'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
    defaultNotFoundComponent: NotFound,
    defaultPendingComponent: ShellSkeleton,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
