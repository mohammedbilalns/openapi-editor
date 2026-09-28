import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '@/lib/openapi/store'
import { changeSchemaType, typeChangeLoss } from './schema-model'
import { getSchema, installDomPolyfills, renderSchemaEditor, seedStore } from './test-utils'

beforeAll(installDomPolyfills)

let ids: ReturnType<typeof seedStore>['ids']
beforeEach(() => {
  ids = seedStore().ids
})

const fieldNames = (id: string) => [...(getSchema(id)?.properties?.keys() ?? [])]
const fieldRow = (name: string) => screen.getByRole('listitem', { name: `Field ${name}` })

describe('Fields', () => {
  it('"Add field" appends a row and focuses its name input', async () => {
    const user = userEvent.setup()
    await renderSchemaEditor(ids.pet)

    await user.click(screen.getByRole('button', { name: 'Add field' }))

    expect(fieldNames(ids.pet)).toEqual(['id', 'name', 'nickname', 'category', 'newField'])
    const input = within(fieldRow('newField')).getByRole('textbox', { name: 'Field name' })
    expect(input).toHaveFocus()
    // The placeholder name is selected, so typing replaces it.
    await user.keyboard('age{Enter}')
    expect(fieldNames(ids.pet)).toEqual(['id', 'name', 'nickname', 'category', 'age'])
    expect(input).toHaveFocus()
  })

  it('renaming a required field keeps it required and in place', async () => {
    const user = userEvent.setup()
    await renderSchemaEditor(ids.pet)

    const input = within(fieldRow('name')).getByRole('textbox', { name: 'Field name' })
    await user.clear(input)
    await user.type(input, 'title')
    await user.tab()

    const pet = getSchema(ids.pet)!
    expect(fieldNames(ids.pet)).toEqual(['id', 'title', 'nickname', 'category'])
    expect(pet.required).toEqual(['id', 'title'])
    expect(pet.properties?.get('title')?.required).toBe(true)
    expect(within(fieldRow('title')).getByRole('checkbox', { name: 'Required' })).toBeChecked()
    expect(fieldRow('title')).toHaveAttribute('id', 'field-title')
  })

  it('refuses a duplicate or empty name, keeps the stored name, and reverts on blur', async () => {
    const user = userEvent.setup()
    await renderSchemaEditor(ids.pet)

    const input = within(fieldRow('nickname')).getByRole('textbox', { name: 'Field name' })
    await user.clear(input)
    expect(input).toHaveAccessibleDescription("Error: Field names can't be empty.")
    await user.type(input, 'name')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Error: Another field is already named name.')
    expect(fieldNames(ids.pet)).toEqual(['id', 'name', 'nickname', 'category'])

    await user.tab()
    expect(input).toHaveValue('nickname')
    expect(input).not.toHaveAttribute('aria-invalid')
  })
})

describe('Type', () => {
  it('asks before an object → array change drops fields, and cancelling keeps them', async () => {
    const user = userEvent.setup()
    await renderSchemaEditor(ids.pet)

    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: /^array/ }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Change type to array?' })
    expect(dialog).toHaveTextContent('Fields will be removed.')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(getSchema(ids.pet)?.type).toBe('object')
    expect(fieldNames(ids.pet)).toEqual(['id', 'name', 'nickname', 'category'])
  })

  it('changes type after confirming and shows the new body', async () => {
    const user = userEvent.setup()
    await renderSchemaEditor(ids.pet)

    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: /^array/ }))
    await user.click(await screen.findByRole('button', { name: 'Change type' }))

    const pet = getSchema(ids.pet)!
    expect(pet.type).toBe('array')
    expect(pet.properties).toBeUndefined()
    expect(pet.items).toMatchObject({ kind: 'inline', schema: { type: 'string' } })
    expect(await screen.findByRole('region', { name: 'Items' })).toBeInTheDocument()
  })

  it('knows which changes lose data', () => {
    const status = getSchema(ids.status)!
    const union = getSchema(ids.union)!
    expect(typeChangeLoss(status, 'string')).toBe('Values will be removed.')
    expect(typeChangeLoss(union, 'anyOf')).toBeNull()
    expect(changeSchemaType(union, 'anyOf').variants).toEqual(union.variants)
    expect(typeChangeLoss(getSchema(ids.tag)!, 'integer')).toBeNull()
    // Leaving string drops string-only constraints.
    expect(changeSchemaType(getSchema(ids.tag)!, 'integer')).toMatchObject({ minLength: undefined, maxLength: undefined })
  })
})

describe('Enum values', () => {
  it('adds on Enter and rejects duplicates', async () => {
    const user = userEvent.setup()
    await renderSchemaEditor(ids.status)

    const input = screen.getByRole('textbox', { name: 'Add a value' })
    await user.type(input, 'archived{Enter}')
    expect(getSchema(ids.status)?.enumValues).toEqual(['available', 'pending', 'sold', 'archived'])
    expect(input).toHaveValue('')

    await user.type(input, 'sold{Enter}')
    expect(getSchema(ids.status)?.enumValues).toEqual(['available', 'pending', 'sold', 'archived'])
    expect(input).toHaveAccessibleDescription('Error: sold is already a value.')

    await user.click(screen.getByRole('button', { name: 'Remove pending' }))
    expect(getSchema(ids.status)?.enumValues).toEqual(['available', 'sold', 'archived'])
  })

  it('edits a value in place but not into a duplicate', async () => {
    const user = userEvent.setup()
    await renderSchemaEditor(ids.status)

    const chip = screen.getByRole('textbox', { name: 'Value sold' })
    await user.clear(chip)
    await user.type(chip, 'available{Enter}')
    expect(getSchema(ids.status)?.enumValues).toEqual(['available', 'pending', 'sold'])
    expect(chip).toHaveValue('sold')

    await user.clear(chip)
    await user.type(chip, 'adopted{Enter}')
    expect(getSchema(ids.status)?.enumValues).toEqual(['available', 'pending', 'adopted'])
  })
})

describe('Constraints', () => {
  it('parses numbers, rejects text, and clears the constraint when emptied', async () => {
    const user = userEvent.setup()
    await renderSchemaEditor(ids.tag)

    const max = screen.getByRole('textbox', { name: 'Max length' })
    expect(max).toHaveValue('20')
    await user.clear(max)
    expect(getSchema(ids.tag)).toHaveProperty('maxLength', undefined)

    await user.type(max, '64')
    expect(getSchema(ids.tag)?.maxLength).toBe(64)

    await user.type(max, 'x')
    expect(max).toHaveAccessibleDescription('Error: Enter a number.')
    expect(getSchema(ids.tag)?.maxLength).toBe(64)
  })
})

describe('Header', () => {
  it('"Used in" lists the routes and schemas that reference the schema, as links', async () => {
    const user = userEvent.setup()
    await renderSchemaEditor(ids.pet)

    // Pet is used by GET /pets/{petId} (response) and PetOrTag (variant).
    await user.click(screen.getByRole('button', { name: 'Used in 2 places' }))
    const route = await screen.findByRole('link', { name: 'get /pets/{petId}' })
    const schema = screen.getByRole('link', { name: 'PetOrTag' })
    expect(schema).toHaveAttribute('href', `/schemas/${ids.union}`)
    expect(route.getAttribute('href')).toMatch(/^\/routes\//)
  })

  it('renames the schema without breaking references to it', async () => {
    const user = userEvent.setup()
    await renderSchemaEditor(ids.category)

    const title = screen.getByRole('textbox', { name: 'Schema name' })
    await user.clear(title)
    await user.type(title, 'PetCategory')

    const pet = useEditorStore.getState().document.schemas.get(ids.pet)!
    expect(getSchema(ids.category)?.name).toBe('PetCategory')
    expect(pet.properties?.get('category')?.schema).toEqual({ kind: 'ref', targetId: ids.category })
  })

  it('shows an inline empty state with Undo when the schema disappears', async () => {
    const user = userEvent.setup()
    await renderSchemaEditor(ids.tag)

    useEditorStore.getState().deleteSchema(ids.tag)
    expect(await screen.findByRole('heading', { name: 'This schema is gone.' })).toBeInTheDocument()
    expect(screen.getByText('It may have been deleted or replaced by an import.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('textbox', { name: 'Schema name' })).toHaveValue('Tag')
  })
})
