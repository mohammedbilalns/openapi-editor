/**
 * Test helpers for the schema editor: seeds the real editor store with a real
 * ApiDocument and polyfills the few DOM APIs jsdom lacks (cmdk and Base UI use them).
 */
import { act, render } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute as createPageRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from '@tanstack/react-router'
import { ConfirmHost } from '@/components/shared'
import { SchemaEditor } from './schema-editor'
import { useEditorStore } from '@/lib/openapi/store'
import {
  createEmptyDocument,
  createRoute,
  createSchema,
  type ApiDocument,
  type PropertyDef,
  type SchemaNode,
  type SchemaType,
} from '@/lib/openapi/types'

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
}

export function schemaWith(type: SchemaType, name: string, extra: Partial<SchemaNode> = {}): SchemaNode {
  return { ...createSchema(type, name), ...extra }
}

export function field(name: string, type: SchemaType, required = false): PropertyDef {
  return { name, required, schema: { kind: 'inline', schema: createSchema(type) } }
}

export function objectSchema(name: string, fields: PropertyDef[]): SchemaNode {
  return schemaWith('object', name, {
    properties: new Map(fields.map((f) => [f.name, f])),
    required: fields.filter((f) => f.required).map((f) => f.name),
  })
}

/** A small petstore: Pet (object), Category (object), Status (enum), Tag (string), PetOrTag (oneOf), plus a route that returns Pet. */
export function seedDocument(): { doc: ApiDocument; ids: Record<'pet' | 'category' | 'status' | 'tag' | 'union', string>; routeId: string } {
  const category = objectSchema('Category', [field('id', 'integer'), field('name', 'string')])
  const status = schemaWith('enum', 'Status', { enumValues: ['available', 'pending', 'sold'] })
  const tag = schemaWith('string', 'Tag', { minLength: 1, maxLength: 20 })
  const pet = objectSchema('Pet', [
    field('id', 'integer', true),
    field('name', 'string', true),
    field('nickname', 'string'),
    { name: 'category', required: false, schema: { kind: 'ref', targetId: category.id } },
  ])
  const union = schemaWith('oneOf', 'PetOrTag', {
    variants: [
      { kind: 'ref', targetId: pet.id },
      { kind: 'ref', targetId: tag.id },
    ],
  })

  const route = createRoute('/pets/{petId}', 'get')
  route.responses.set('200', {
    id: 'response-200',
    description: 'A pet',
    content: new Map([['application/json', { schema: { kind: 'ref', targetId: pet.id } }]]),
  })

  const doc = createEmptyDocument()
  doc.info.title = 'Petstore'
  for (const schema of [pet, category, status, tag, union]) doc.schemas.set(schema.id, schema)
  doc.routes.set(route.id, route)
  return {
    doc,
    ids: { pet: pet.id, category: category.id, status: status.id, tag: tag.id, union: union.id },
    routeId: route.id,
  }
}

export function seedStore() {
  const seeded = seedDocument()
  useEditorStore.getState().initializeDocument(seeded.doc)
  return seeded
}

export const getSchema = (id: string) => useEditorStore.getState().document.schemas.get(id)

/** Renders the schema editor page for `schemaId` in a memory router with the pages it links to, plus the confirm host. */
export async function renderSchemaEditor(schemaId: string) {
  const root = createRootRoute({
    component: () => (
      <>
        <Outlet />
        <ConfirmHost />
      </>
    ),
  })
  const overview = createPageRoute({ getParentRoute: () => root, path: '/', component: () => <p>Overview page</p> })
  const routePage = createPageRoute({
    getParentRoute: () => root,
    path: '/routes/$routeId',
    component: () => <p>Route page</p>,
  })
  const schemaPage = createPageRoute({
    getParentRoute: () => root,
    path: '/schemas/$schemaId',
    component: SchemaPage,
  })
  const router = createRouter({
    routeTree: root.addChildren([overview, routePage, schemaPage]),
    history: createMemoryHistory({ initialEntries: [`/schemas/${schemaId}`] }),
  })
  const result = render(<RouterProvider router={router as never} />)
  await act(() => router.load())
  return { ...result, router }
}

function SchemaPage() {
  const { schemaId } = useParams({ strict: false }) as { schemaId: string }
  return <SchemaEditor key={schemaId} schemaId={schemaId} />
}
