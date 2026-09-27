import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { parseYaml } from '@/lib/openapi/parser'
import { useEditorStore } from '@/lib/openapi/store'
import { REALISTIC_SPEC_YAML } from '@/test/fixtures/realistic-spec'
import { installDomPolyfills, renderSchemaEditor } from './test-utils'

beforeAll(installDomPolyfills)

let byName: (name: string) => string
beforeEach(() => {
  const { document } = parseYaml(REALISTIC_SPEC_YAML)
  if (!document) throw new Error('fixture did not parse')
  useEditorStore.getState().initializeDocument(document)
  byName = (name) => [...document.schemas.values()].find((schema) => schema.name === name)!.id
})

const schema = (id: string) => useEditorStore.getState().document.schemas.get(id)!

describe('schema editor on a realistic spec', () => {
  it('opens every schema of the fixture', async () => {
    for (const node of useEditorStore.getState().document.schemas.values()) {
      const { unmount } = await renderSchemaEditor(node.id)
      expect(screen.getByRole('textbox', { name: 'Schema name' })).toHaveValue(node.name)
      unmount()
    }
  })

  it('keeps integer enum values as numbers and converts them when the value type changes', async () => {
    const user = userEvent.setup()
    const id = byName('Priority')
    await renderSchemaEditor(id)

    const input = screen.getByRole('textbox', { name: 'Add a value' })
    await user.type(input, '4{Enter}')
    expect(schema(id).enumValues).toEqual([1, 2, 3, 4])
    await user.type(input, '4.5{Enter}')
    expect(input).toHaveAccessibleDescription('Error: Enter a whole number.')
    expect(schema(id).enumValues).toEqual([1, 2, 3, 4])

    await user.click(screen.getByRole('combobox', { name: 'Value type' }))
    await user.click(await screen.findByRole('option', { name: 'string' }))
    expect(schema(id)).toMatchObject({ enumType: 'string', enumValues: ['1', '2', '3', '4'] })
  })

  it('edits the discriminator without losing its mapping', async () => {
    const user = userEvent.setup()
    const id = byName('PetKind')
    await renderSchemaEditor(id)

    const property = screen.getByRole('textbox', { name: 'Property' })
    await user.clear(property)
    await user.type(property, 'kind')
    expect(schema(id).discriminator).toEqual({
      propertyName: 'kind',
      mapping: { dog: '#/components/schemas/Dog', cat: '#/components/schemas/Cat' },
    })
  })

  it('shows inline variants as inline and can swap one for a reference', async () => {
    const user = userEvent.setup()
    const id = byName('Tag')
    await renderSchemaEditor(id)

    const variants = screen.getByRole('region', { name: /Variants/ })
    const first = within(variants).getByRole('combobox', { name: 'Variant 1' })
    expect(first).toHaveTextContent('Inline schema')
    await user.click(first)
    // TagObject is already variant 2, and a schema can't be its own variant.
    expect(screen.queryByRole('option', { name: 'TagObject' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Tag' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Error' }))
    expect(schema(id).variants?.[0]).toEqual({ kind: 'ref', targetId: byName('Error') })
  })

  it('toggles nullable and keeps keywords the editor does not model', async () => {
    const user = userEvent.setup()
    const id = byName('Error')
    const extra = schema(id).extraKeywords
    await renderSchemaEditor(id)

    await user.click(screen.getByRole('checkbox', { name: 'Nullable' }))
    expect(schema(id).nullable).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Add field' }))
    expect(schema(id).extraKeywords).toBe(extra)
    expect(extra).toMatchObject({ 'x-internal': true })
  })
})
