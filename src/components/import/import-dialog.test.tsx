import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toaster } from '@/components/shared'
import { useEditorStore } from '@/lib/openapi/store'
import { createEmptyDocument } from '@/lib/openapi/types'
import { ImportDialog, splitCodeFrame } from './import-dialog'
import { renderWithRouter } from './test-router'

const PETSTORE = `openapi: 3.0.3
info:
  title: Petstore
  version: 1.0.0
paths:
  /pets:
    get:
      operationId: listPets
      responses:
        '200':
          description: OK
    post:
      operationId: createPet
      responses:
        '201':
          description: Created
components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
`

function setup(initialPath = '/settings/info') {
  const onOpenChange = vi.fn<(open: boolean) => void>()
  const view = renderWithRouter(
    <>
      <ImportDialog open onOpenChange={onOpenChange} />
      <Toaster />
    </>,
    { initialPath },
  )
  return { ...view, onOpenChange, user: userEvent.setup() }
}

async function paste(user: ReturnType<typeof userEvent.setup>, text: string) {
  const textarea = await screen.findByRole('textbox', { name: 'OpenAPI document' })
  await user.click(textarea)
  await user.paste(text)
}

beforeEach(() => {
  useEditorStore.getState().initializeDocument(createEmptyDocument())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ImportDialog', () => {
  it('replaces the document with a pasted spec, closes, goes to the overview and reports counts', async () => {
    const { user, onOpenChange, router } = setup()
    const before = useEditorStore.getState().document
    await paste(user, PETSTORE)
    await user.click(screen.getByRole('button', { name: 'Import' }))

    await waitFor(() => expect(useEditorStore.getState().document).not.toBe(before))
    const doc = useEditorStore.getState().document
    expect(doc.info.title).toBe('Petstore')
    expect(doc.routes.size).toBe(2)
    expect(doc.schemas.size).toBe(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(await screen.findByText('Imported Petstore. 2 routes, 1 schema.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))

    // Undoable: the previous document comes back.
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().document.info.title).toBe(before.info.title)
  })

  it("shows the parser's error for invalid YAML and leaves the document alone", async () => {
    const { user, onOpenChange } = setup()
    const before = useEditorStore.getState().document
    await paste(user, 'openapi: 3.0.3\ninfo: [unclosed\n  title: x')
    await user.click(screen.getByRole('button', { name: 'Import' }))

    const list = await screen.findByRole('list', { name: 'Import problems' })
    expect(list).toHaveTextContent(/Failed to parse YAML/)
    // The code frame keeps its line breaks in a code block under the one-line message.
    const frame = list.querySelector('pre')
    expect(frame?.textContent).toMatch(/\n/)
    expect(list.querySelector('p')?.textContent).not.toContain('|')
    expect(screen.getByText(/1 error stops the import/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled()
    expect(useEditorStore.getState().document).toBe(before)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('requires "Import anyway" when the spec only has warnings', async () => {
    const { user } = setup()
    const before = useEditorStore.getState().document
    await paste(user, 'openapi: 3.0.3\ninfo:\n  version: 2.0.0\npaths: {}\n')
    await user.click(screen.getByRole('button', { name: 'Import' }))

    const anyway = await screen.findByRole('button', { name: 'Import anyway' })
    expect(screen.getByRole('list', { name: 'Import problems' })).toHaveTextContent('info.title')
    expect(useEditorStore.getState().document).toBe(before)

    await user.click(anyway)
    await waitFor(() => expect(useEditorStore.getState().document).not.toBe(before))
    expect(useEditorStore.getState().document.info.version).toBe('2.0.0')
  })

  it('starts over when the pasted text changes after a warning', async () => {
    const { user } = setup()
    await paste(user, 'openapi: 3.0.3\ninfo:\n  version: 2.0.0\npaths: {}\n')
    await user.click(screen.getByRole('button', { name: 'Import' }))
    await screen.findByRole('button', { name: 'Import anyway' })
    await user.type(screen.getByRole('textbox', { name: 'OpenAPI document' }), ' ')
    expect(screen.queryByRole('button', { name: 'Import anyway' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Import problems' })).not.toBeInTheDocument()
  })

  it('disables the URL source while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    setup()
    const urlTab = await screen.findByRole('tab', { name: /URL/ })
    expect(urlTab).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Fetching from a URL needs a connection.')).toBeInTheDocument()
  })

  it('loads a dropped file and rejects other file types', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('tab', { name: /File/ }))
    const zone = screen.getByRole('button', { name: /Drop a file here/ })

    const bad = new File(['nope'], 'notes.txt', { type: 'text/plain' })
    zone.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: { files: [bad] } }))
    expect(await screen.findByText("notes.txt isn't a .yaml, .yml or .json file.")).toBeInTheDocument()

    const good = new File([PETSTORE], 'petstore.yaml', { type: 'application/yaml' })
    zone.dispatchEvent(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer: { files: [good] } }))
    expect(await screen.findByText(/petstore\.yaml · /)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Import' }))
    await waitFor(() => expect(useEditorStore.getState().document.info.title).toBe('Petstore'))
  })
})

describe('splitCodeFrame', () => {
  it('keeps the first line as the message and the rest as an aligned frame', () => {
    expect(splitCodeFrame('Bad thing (2:1)\n\n 1 | a: 1\n 2 | b: [\n-----^\n')).toEqual({
      text: 'Bad thing (2:1)',
      frame: ' 1 | a: 1\n 2 | b: [\n-----^',
    })
  })

  it('leaves one-line messages alone', () => {
    expect(splitCodeFrame('Missing required "info" object')).toEqual({ text: 'Missing required "info" object' })
    expect(splitCodeFrame('Trailing newline\n\n')).toEqual({ text: 'Trailing newline' })
  })
})
