import type * as React from 'react'
import { render } from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

/**
 * Renders `ui` inside a minimal TanStack router (memory history) with the app's
 * URL shapes, so components can use `Link` and `useNavigate`. Returns the
 * router for asserting on `router.state.location`.
 */
const empty = () => null

export function renderWithRouter(ui: React.ReactNode, { initialPath = '/' }: { initialPath?: string } = {}) {
  // jsdom doesn't implement scrolling; the router's scroll restoration calls it on navigation.
  window.scrollTo = (() => {}) as typeof window.scrollTo
  const rootRoute = createRootRoute({
    component: () => (
      <>
        {ui}
        <Outlet />
      </>
    ),
  })
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/', component: empty }),
    createRoute({ getParentRoute: () => rootRoute, path: '/routes/$routeId', component: empty }),
    createRoute({ getParentRoute: () => rootRoute, path: '/schemas/$schemaId', component: empty }),
    createRoute({ getParentRoute: () => rootRoute, path: '/settings/$section', component: empty }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [initialPath] }) })
  const result = render(<RouterProvider router={router} />)
  return { router, ...result }
}
