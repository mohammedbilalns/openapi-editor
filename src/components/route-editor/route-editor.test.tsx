import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseYaml } from '@/lib/openapi/parser'
import { useEditorStore } from '@/lib/openapi/store'
import { REALISTIC_SPEC_YAML } from '@/test/fixtures/realistic-spec'
import { NewRouteDialog } from './new-route-dialog'
import { getRoute, installDomPolyfills, renderRouteEditor, renderWithRouter, seedDocument, seedStore } from './test-utils'

beforeAll(installDomPolyfills)

let seeded: ReturnType<typeof seedDocument>
beforeEach(() => {
  seeded = seedDocument()
  seedStore(seeded.doc)
})

const pathParams = (routeId: string) =>
  getRoute(routeId)!
    .parameters.filter((param) => param.in === 'path')
    .map((param) => param.name)

async function editPath(user: ReturnType<typeof userEvent.setup>, value: string) {
  const input = await screen.findByRole('textbox', { name: 'Path' })
  await user.clear(input)
  await user.type(input, value.replace(/[{[]/g, '$&$&'))
  await user.tab()
}

describe('RouteEditor: path and path parameters', () => {
  it('adds parameters for new {segments} and never removes existing ones', async () => {
    const user = userEvent.setup()
    await renderRouteEditor(seeded.getPetId)
    const petParamId = getRoute(seeded.getPetId)!.parameters[0].id

    await editPath(user, '/pets/{petId}/toys/{toyId}')
    expect(getRoute(seeded.getPetId)!.path).toBe('/pets/{petId}/toys/{toyId}')
    expect(pathParams(seeded.getPetId)).toEqual(['petId', 'toyId'])
    expect(getRoute(seeded.getPetId)!.parameters[0].id).toBe(petParamId)

    await editPath(user, '/pets')
    expect(pathParams(seeded.getPetId)).toEqual(['petId', 'toyId'])
    // Once out of the path they are no longer locked, so they can be cleaned up by hand.
    expect(screen.getByRole('button', { name: 'Delete parameter toyId' })).toBeInTheDocument()
  })

  it('renames the parameter when a {segment} is renamed, keeping its settings', async () => {
    const user = userEvent.setup()
    useEditorStore.getState().updateParameter(seeded.getPetId, getRoute(seeded.getPetId)!.parameters[0].id, {
      description: 'The pet',
    })
    await renderRouteEditor(seeded.getPetId)

    await editPath(user, '/pets/{id}')
    const params = getRoute(seeded.getPetId)!.parameters
    expect(params.map((param) => param.name)).toEqual(['id'])
    expect(params[0].description).toBe('The pet')
  })

  it('adds the leading slash when the path loses focus', async () => {
    const user = userEvent.setup()
    await renderRouteEditor(seeded.getPetId)
    await editPath(user, 'owners/{ownerId}')
    expect(getRoute(seeded.getPetId)!.path).toBe('/owners/{ownerId}')
  })

  it('locks parameters that are in the path: no delete, always required', async () => {
    await renderRouteEditor(seeded.getPetId)
    const row = await screen.findByRole('row', { name: 'petId' })

    expect(within(row).getByRole('checkbox', { name: 'Required' })).toBeChecked()
    expect(within(row).getByRole('checkbox', { name: 'Required' })).toHaveAttribute('aria-disabled', 'true')
    expect(within(row).getByRole('textbox', { name: 'Name' })).toHaveAttribute('readonly')
    expect(within(row).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })
})

describe('RouteEditor: tags', () => {
  it('toggles tags from the document’s tag list', async () => {
    const user = userEvent.setup()
    await renderRouteEditor(seeded.getPetId)

    await user.click(screen.getByRole('button', { name: 'Tags' }))
    await user.click(await screen.findByRole('option', { name: 'store' }))
    await user.click(screen.getByRole('option', { name: 'pets' }))
    expect(getRoute(seeded.getPetId)!.tags).toEqual(['store'])
  })

  it('links to the tag settings when the document has no tags', async () => {
    const user = userEvent.setup()
    const { doc, getPetId } = seedDocument()
    doc.tags = []
    doc.routes.get(getPetId)!.tags = []
    seedStore(doc)
    const { router } = await renderRouteEditor(getPetId)

    await user.click(screen.getByRole('link', { name: 'Add tags in settings' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/tags'))
  })
})

describe('RouteEditor: parameters', () => {
  it('adds a query parameter and focuses its name', async () => {
    const user = userEvent.setup()
    await renderRouteEditor(seeded.getPetId)

    await user.click(screen.getByRole('button', { name: 'Add parameter' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Query' }))
    await user.keyboard('limit')

    const added = getRoute(seeded.getPetId)!.parameters.at(-1)!
    expect(added).toMatchObject({ name: 'limit', in: 'query', required: false })
    await user.click(screen.getByRole('button', { name: 'Delete parameter limit' }))
    expect(getRoute(seeded.getPetId)!.parameters.map((param) => param.name)).toEqual(['petId'])
  })
})

describe('RouteEditor: request body', () => {
  it('persists a new content type and keeps the schema', async () => {
    const user = userEvent.setup()
    await renderRouteEditor(seeded.createPetId)

    await user.click(await screen.findByRole('combobox', { name: 'Content type' }))
    await user.click(await screen.findByRole('option', { name: 'multipart/form-data' }))

    const content = getRoute(seeded.createPetId)!.requestBody!.content
    expect([...content.keys()]).toEqual(['multipart/form-data'])
    expect(content.get('multipart/form-data')!.schema).toEqual({ kind: 'ref', targetId: seeded.petId })
    expect(screen.getByRole('combobox', { name: 'Content type' })).toHaveTextContent('multipart/form-data')
  })

  it('hides the panel for GET and offers to add a body instead', async () => {
    const user = userEvent.setup()
    useEditorStore.getState().setRequestBody(seeded.createPetId, undefined)
    await renderRouteEditor(seeded.createPetId)
    expect(await screen.findByRole('region', { name: 'Request body' })).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Method' }))
    await user.click(await screen.findByRole('option', { name: 'get' }))

    expect(getRoute(seeded.createPetId)!.method).toBe('get')
    expect(screen.queryByRole('region', { name: 'Request body' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add a request body' }))
    expect(getRoute(seeded.createPetId)!.requestBody).toBeDefined()
    expect(screen.getByRole('region', { name: 'Request body' })).toHaveTextContent('GET requests usually have no body')
  })
})

describe('RouteEditor: responses', () => {
  it('only offers status codes the route does not have yet', async () => {
    const user = userEvent.setup()
    await renderRouteEditor(seeded.getPetId)

    await user.click(screen.getByRole('button', { name: 'Add response' }))
    const list = await screen.findByRole('listbox', { name: 'Status codes' })
    const labels = within(list)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(labels).not.toContain('200OK')
    expect(labels).not.toContain('404Not Found')
    expect(labels).toContain('201Created')

    await user.click(within(list).getByRole('option', { name: /201\s*Created/ }))
    expect(getRoute(seeded.getPetId)!.responses.get('201')).toMatchObject({ description: 'Created' })
    expect(screen.getByRole('row', { name: '201' })).toBeInTheDocument()
  })
})

describe('RouteEditor: delete', () => {
  it('deletes the route from the actions menu and leaves its page', async () => {
    const user = userEvent.setup()
    const { router } = await renderRouteEditor(seeded.getPetId)

    await user.click(screen.getByRole('button', { name: 'Route actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete route' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(getRoute(seeded.getPetId)).toBeUndefined()
    expect(useEditorStore.getState().canUndo()).toBe(true)
  })
})

describe('RouteEditor: missing route', () => {
  it('shows the empty state with Undo, and undo brings the route back', async () => {
    const user = userEvent.setup()
    useEditorStore.getState().deleteRoute(seeded.getPetId)
    await renderRouteEditor(seeded.getPetId)

    expect(await screen.findByRole('heading', { name: 'This route is gone.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('textbox', { name: 'Path' })).toHaveValue('/pets/{petId}')
  })

  it('offers no Undo when there is nothing to undo', async () => {
    await renderRouteEditor('no-such-route')
    expect(await screen.findByRole('heading', { name: 'This route is gone.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to overview' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })
})

describe('NewRouteDialog', () => {
  it('creates the route with its path parameters and tags', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn<(id: string) => void>()
    await renderWithRouter(<NewRouteDialog open onOpenChange={() => {}} onCreated={onCreated} />)

    await user.type(screen.getByRole('textbox', { name: 'Path' }), 'owners/{{ownerId}')
    expect(screen.getByText(/Adds the path parameter/)).toHaveTextContent('ownerId')
    await user.click(screen.getByRole('button', { name: 'Create' }))

    const id = onCreated.mock.calls[0][0]
    const route = getRoute(id)!
    expect(route).toMatchObject({ path: '/owners/{ownerId}', method: 'get' })
    expect(route.parameters).toEqual([expect.objectContaining({ name: 'ownerId', in: 'path', required: true })])
  })

  it('refuses a method and path that already exist', async () => {
    const user = userEvent.setup()
    await renderWithRouter(<NewRouteDialog open onOpenChange={() => {}} onCreated={() => {}} />)

    await user.type(screen.getByRole('textbox', { name: 'Path' }), '/pets/{{petId}')
    expect(screen.getByRole('textbox', { name: 'Path' })).toHaveAccessibleDescription(/GET \/pets\/\{petId\} already exists/)
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
  })
})

describe('RouteEditor: validation', () => {
  it('marks a path parameter that left the path with the validator’s error', async () => {
    const user = userEvent.setup()
    await renderRouteEditor(seeded.getPetId)
    await editPath(user, '/pets')

    const row = screen.getByRole('row', { name: 'petId' })
    await waitFor(() => expect(within(row).getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true'), {
      timeout: 2000,
    })
    expect(within(row).getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription(/not in the path/)
  })
})

describe('RouteEditor: imported spec', () => {
  function seedRealistic() {
    const { document } = parseYaml(REALISTIC_SPEC_YAML)
    seedStore(document!)
    const find = (method: string, path: string) =>
      [...document!.routes.values()].find((route) => route.method === method && route.path === path)!.id
    return { listPets: find('get', '/pets'), createPet: find('post', '/pets') }
  }

  it('keeps security, response headers and examples it does not edit', async () => {
    const user = userEvent.setup()
    const { listPets } = seedRealistic()
    const before = getRoute(listPets)!
    await renderRouteEditor(listPets)

    // Responses are listed by code with `default` last.
    const codes = within(screen.getByRole('table', { name: 'Responses' }))
      .getAllByRole('row')
      .map((row) => row.getAttribute('aria-label'))
      .filter(Boolean)
    expect(codes).toEqual(['200', 'default'])
    const response = screen.getByRole('row', { name: '200' })
    await user.type(within(response).getByRole('textbox', { name: 'Description' }), ' today')
    await user.type(screen.getByRole('textbox', { name: 'Summary' }), ' now')

    const after = getRoute(listPets)!
    expect(after.summary).toBe('List pets now')
    expect(after.security).toBe(before.security)
    expect(after.responses.get('200')).toMatchObject({ description: 'A page of pets today' })
    expect(after.responses.get('200')!.headers).toBe(before.responses.get('200')!.headers)
  })

  it('keeps a media type example when the content type changes', async () => {
    const user = userEvent.setup()
    const { createPet } = seedRealistic()
    await renderRouteEditor(createPet)

    await user.click(await screen.findByRole('combobox', { name: 'Content type' }))
    await user.click(await screen.findByRole('option', { name: 'application/xml' }))

    const body = getRoute(createPet)!.requestBody!
    expect(body.description).toBe('Pet to add')
    expect(body.content.get('application/xml')!.example).toEqual({ name: 'Rex', kind: 'dog' })
  })
})
