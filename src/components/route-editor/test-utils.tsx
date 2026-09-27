/**
 * Test helpers: a real editor store seeded with a real ApiDocument, and a
 * memory router with the routes the editor links to.
 */
import type * as React from 'react'
import { act, render } from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute as createPageRoute,
  createRouter,
} from '@tanstack/react-router'
import { useEditorStore } from '@/lib/openapi/store'
import {
  createEmptyDocument,
  createRoute,
  createSchema,
  generateId,
  type ApiDocument,
  type HttpMethod,
  type Route,
} from '@/lib/openapi/types'
import { createPathParam } from './path-params'
import { RouteEditor } from './route-editor'

export function installDomPolyfills() {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false
  // The router restores scroll on navigation; jsdom doesn't implement it.
  window.scrollTo = () => {}
}

export function routeWith(path: string, method: HttpMethod, extra: Partial<Route> = {}): Route {
  const route = createRoute(path, method)
  route.parameters = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => createPathParam(match[1]))
  return { ...route, ...extra }
}

/** Petstore-ish: a Pet schema, `GET /pets/{petId}` (200, 404) and `POST /pets` with a JSON body. */
export function seedDocument() {
  const pet = { ...createSchema('object', 'Pet') }
  const getPet = routeWith('/pets/{petId}', 'get', {
    operationId: 'getPetById',
    tags: ['pets'],
    responses: new Map([
      ['200', { id: generateId(), description: 'A pet', content: new Map([['application/json', { schema: { kind: 'ref' as const, targetId: pet.id } }]]) }],
      ['404', { id: generateId(), description: 'Not found' }],
    ]),
  })
  const createPet = routeWith('/pets', 'post', {
    requestBody: {
      id: generateId(),
      required: true,
      content: new Map([['application/json', { schema: { kind: 'ref', targetId: pet.id } }]]),
    },
  })
  const doc: ApiDocument = createEmptyDocument()
  doc.info.title = 'Petstore'
  doc.tags = [{ name: 'pets' }, { name: 'store' }]
  doc.schemas.set(pet.id, pet)
  doc.routes.set(getPet.id, getPet)
  doc.routes.set(createPet.id, createPet)
  return { doc, petId: pet.id, getPetId: getPet.id, createPetId: createPet.id }
}

export function seedStore(doc: ApiDocument = seedDocument().doc) {
  useEditorStore.getState().initializeDocument(doc)
}

export const getRoute = (id: string) => useEditorStore.getState().document.routes.get(id)

/**
 * Renders inside a memory router with the pages the editor links to. `ui` sits
 * above the page outlet; `/routes/$routeId` renders the route editor.
 */
export async function renderWithRouter(ui: React.ReactNode, initialPath = '/') {
  const root = createRootRoute({
    component: () => (
      <>
        {ui}
        <Outlet />
      </>
    ),
  })
  const overview = createPageRoute({ getParentRoute: () => root, path: '/', component: () => <p>Overview page</p> })
  const settings = createPageRoute({
    getParentRoute: () => root,
    path: '/settings/$section',
    component: () => <p>Settings page</p>,
  })
  const editor = createPageRoute({
    getParentRoute: () => root,
    path: '/routes/$routeId',
    component: function EditorPage() {
      const params = editor.useParams() as { routeId: string }
      return <RouteEditor key={params.routeId} routeId={params.routeId} />
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([overview, settings, editor]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  const result = render(<RouterProvider router={router as never} />)
  await act(() => router.load())
  return { ...result, router }
}

/** Renders the route editor page for `routeId`. */
export function renderRouteEditor(routeId: string) {
  return renderWithRouter(null, `/routes/${routeId}`)
}
