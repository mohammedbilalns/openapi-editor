import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseYaml } from '@/lib/openapi/parser'
import { serializeDocument } from '@/lib/openapi/serializer'
import { useEditorStore } from '@/lib/openapi/store'
import { changeSchemaType } from './schema-model'
import { installDomPolyfills, renderSchemaEditor } from './test-utils'

beforeAll(installDomPolyfills)

const SPEC = `openapi: 3.0.3
info: { title: Untyped, version: 1.0.0 }
paths: {}
components:
  schemas:
    Anything: {}
    Keyed:
      properties:
        id: { type: string }
`

type Json = Record<string, Record<string, Record<string, Record<string, unknown>>>>

function load() {
  const { document } = parseYaml(SPEC)
  if (!document) throw new Error('fixture did not parse')
  useEditorStore.getState().initializeDocument(document)
  const idOf = (name: string) => [...document.schemas.values()].find((s) => s.name === name)!.id
  return { anything: idOf('Anything'), keyed: idOf('Keyed') }
}

const exported = (name: string) =>
  (serializeDocument(useEditorStore.getState().document) as unknown as Json).components.schemas[name]

describe('Type of an imported untyped schema', () => {
  it('exports `type: object` once the user picks object, the type it was shown as', async () => {
    const ids = load()
    expect(exported('Anything')).toEqual({})
    const user = userEvent.setup()
    await renderSchemaEditor(ids.anything)

    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: /^object/ }))

    expect(useEditorStore.getState().document.schemas.get(ids.anything)?.untyped).toBeUndefined()
    expect(exported('Anything')).toEqual({ type: 'object' })
  })

  it('exports the new type after a change to another type', async () => {
    const ids = load()
    const user = userEvent.setup()
    await renderSchemaEditor(ids.anything)

    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: /^string/ }))

    expect(exported('Anything')).toEqual({ type: 'string' })
  })

  it('keeps the fields of an object known by its keywords when it gets its type', () => {
    const ids = load()
    const keyed = useEditorStore.getState().document.schemas.get(ids.keyed)!
    expect(changeSchemaType(keyed, 'object')).toEqual({ type: 'object', untyped: undefined })
    useEditorStore.getState().updateSchema(ids.keyed, changeSchemaType(keyed, 'object'))
    expect(exported('Keyed')).toEqual({ type: 'object', properties: { id: { type: 'string' } } })
  })
})
