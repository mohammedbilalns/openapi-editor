import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ConfirmHost } from '@/components/shared'
import { useEditorStore } from '@/lib/openapi/store'
import { createEmptyDocument, createRoute, type ApiDocument } from '@/lib/openapi/types'
import { TagsSection } from './tags-section'

function seed(): ApiDocument {
  const doc = createEmptyDocument()
  doc.tags = [{ name: 'pets', description: 'Everything about pets' }, { name: 'store' }]
  for (const [path, tags] of [
    ['/pets', ['pets']],
    ['/pets/{petId}', ['pets', 'store']],
    ['/orders', ['store']],
    ['/health', []],
  ] as const) {
    const route = createRoute(path, 'get')
    route.tags = [...tags]
    doc.routes.set(route.id, route)
  }
  useEditorStore.getState().initializeDocument(doc)
  return doc
}

function setup() {
  render(
    <>
      <TagsSection />
      <ConfirmHost />
    </>,
  )
  return userEvent.setup()
}

const routeTags = () => [...useEditorStore.getState().document.routes.values()].map((route) => route.tags)

beforeEach(() => {
  seed()
})

describe('TagsSection', () => {
  it('shows how many routes use each tag', () => {
    setup()
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getAllByRole('cell')[2].textContent)).toEqual(['Used by 2 routes', 'Used by 2 routes'])
  })

  it('asks before deleting a tag that routes use, and keeps it on cancel', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Delete tag pets' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Delete pets?')
    expect(dialog).toHaveTextContent('2 routes use pets. The tag is removed from them.')

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(useEditorStore.getState().document.tags.map((tag) => tag.name)).toEqual(['pets', 'store'])
  })

  it('deletes a used tag after confirmation and strips it from routes', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Delete tag pets' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete tag' }))

    await waitFor(() => expect(useEditorStore.getState().document.tags.map((tag) => tag.name)).toEqual(['store']))
    expect(routeTags().flat()).not.toContain('pets')
    expect(routeTags().flat().filter((tag) => tag === 'store')).toHaveLength(2)
  })

  it('deletes an unused tag without asking', async () => {
    const doc = useEditorStore.getState().document
    useEditorStore.getState().initializeDocument({ ...doc, tags: [...doc.tags, { name: 'unused' }] })
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Delete tag unused' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(useEditorStore.getState().document.tags.map((tag) => tag.name)).toEqual(['pets', 'store'])
  })

  it('renames a tag on Enter and cascades to routes; refuses duplicates', async () => {
    const user = setup()
    const [petsName] = screen.getAllByRole('textbox', { name: 'Tag name' })
    await user.clear(petsName)
    await user.type(petsName, 'store')
    expect(screen.getByText('store already exists.')).toBeInTheDocument()
    expect(petsName).toHaveAttribute('aria-invalid', 'true')

    await user.clear(petsName)
    await user.type(petsName, 'animals{Enter}')
    await waitFor(() =>
      expect(useEditorStore.getState().document.tags.map((tag) => tag.name)).toEqual(['animals', 'store']),
    )
    expect(routeTags().flat().filter((tag) => tag === 'animals')).toHaveLength(2)
    expect(routeTags().flat()).not.toContain('pets')
  })

  it('adds a tag from the inline row and rejects duplicates', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Add tag' }))
    const name = screen.getByRole('textbox', { name: 'New tag name' })
    await user.type(name, 'pets')
    expect(screen.getByText('pets already exists.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeDisabled()

    await user.clear(name)
    await user.type(name, 'users{Enter}')
    expect(useEditorStore.getState().document.tags.map((tag) => tag.name)).toEqual(['pets', 'store', 'users'])
  })
})
