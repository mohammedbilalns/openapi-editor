import * as React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '@/lib/openapi/store'
import { createSchema, type SchemaOrRef } from '@/lib/openapi/types'
import { SchemaCombobox } from './schema-combobox'
import { filterSchemaOptions, PICKER_RESULT_LIMIT, type SchemaPick } from './schema-pick'
import { SchemaTypePicker } from './schema-type-picker'
import { installDomPolyfills, seedStore } from './test-utils'

beforeAll(installDomPolyfills)

let ids: ReturnType<typeof seedStore>['ids']
beforeEach(() => {
  ids = seedStore().ids
})

function optionNames() {
  return within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((option) => option.textContent)
}

function ControlledCombobox(props: { initial: SchemaPick; excludeIds?: string[]; onPicked: (v: SchemaPick) => void }) {
  const [value, setValue] = React.useState(props.initial)
  return (
    <SchemaCombobox
      aria-label="Response body"
      allowNone="No body"
      allowInline="Inline object"
      value={value}
      excludeIds={props.excludeIds}
      onChange={(next) => {
        setValue(next)
        props.onPicked(next)
      }}
    />
  )
}

describe('SchemaCombobox', () => {
  it('lists schemas sorted by name, leaves out excluded ids, and returns a ref pick', async () => {
    const user = userEvent.setup()
    const picks: SchemaPick[] = []
    render(<ControlledCombobox initial={{ kind: 'none' }} excludeIds={[ids.union]} onPicked={(v) => picks.push(v)} />)

    await user.click(screen.getByRole('combobox', { name: 'Response body' }))
    expect(optionNames()).toEqual(['No body', 'Inline object', 'Category', 'Pet', 'Status', 'Tag'])

    await user.click(screen.getByRole('option', { name: 'Pet' }))
    expect(picks).toEqual([{ kind: 'ref', id: ids.pet }])
    expect(screen.getByRole('combobox', { name: 'Response body' })).toHaveTextContent('Pet')
  })

  it('filters as you type and picks the highlighted row with Enter', async () => {
    const user = userEvent.setup()
    const picks: SchemaPick[] = []
    render(<ControlledCombobox initial={{ kind: 'none' }} onPicked={(v) => picks.push(v)} />)

    await user.click(screen.getByRole('combobox', { name: 'Response body' }))
    await user.keyboard('ta')
    // "Tag" starts with the query, "PetOrTag" and "Status" only contain it.
    expect(optionNames()).toEqual(['Tag', 'PetOrTag', 'Status'])
    await user.keyboard('{Enter}')
    expect(picks).toEqual([{ kind: 'ref', id: ids.tag }])
  })

  it('caps rendered results and says how many more there are', () => {
    const options = Array.from({ length: 3000 }, (_, i) => ({ id: `s${i}`, name: `Schema${i}`, type: 'object' as const }))
    const result = filterSchemaOptions(options, 'schema1')
    expect(result.items).toHaveLength(PICKER_RESULT_LIMIT)
    expect(result.total).toBe(1111) // Schema1, Schema10–19, Schema100–199, Schema1000–1999
  })
})

describe('SchemaTypePicker', () => {
  it('offers types and schemas and returns an inline schema or a ref', async () => {
    const user = userEvent.setup()
    const changes: SchemaOrRef[] = []
    function Harness() {
      const [value, setValue] = React.useState<SchemaOrRef>({ kind: 'inline', schema: createSchema('string') })
      return (
        <SchemaTypePicker
          aria-label="Field type"
          value={value}
          excludeIds={[ids.pet]}
          onChange={(next) => {
            setValue(next)
            changes.push(next)
          }}
        />
      )
    }
    render(<Harness />)

    const trigger = screen.getByRole('combobox', { name: 'Field type' })
    await user.click(trigger)
    expect(optionNames()).toEqual([
      'string',
      'number',
      'integer',
      'boolean',
      'object',
      'array',
      'Category',
      'PetOrTag',
      'Status',
      'Tag',
    ])

    await user.click(screen.getByRole('option', { name: 'integer' }))
    expect(changes.at(-1)).toMatchObject({ kind: 'inline', schema: { type: 'integer' } })

    await user.click(trigger)
    await user.click(screen.getByRole('option', { name: 'Status' }))
    expect(changes.at(-1)).toEqual({ kind: 'ref', targetId: ids.status })
    expect(trigger).toHaveTextContent('Status')
  })

  it('keeps an inline schema when its own type is picked again', async () => {
    const user = userEvent.setup()
    const changes: SchemaOrRef[] = []
    render(
      <SchemaTypePicker
        aria-label="Field type"
        value={{ kind: 'inline', schema: createSchema('string') }}
        allowedTypes={['string', 'number']}
        allowRef={false}
        onChange={(next) => changes.push(next)}
      />,
    )
    await user.click(screen.getByRole('combobox', { name: 'Field type' }))
    expect(optionNames()).toEqual(['string', 'number'])
    await user.click(screen.getByRole('option', { name: 'string' }))
    expect(changes).toEqual([])
  })

  it('shows the referenced schema by its current name after a rename', () => {
    useEditorStore.getState().updateSchema(ids.category, { name: 'PetCategory' })
    render(
      <SchemaTypePicker aria-label="Field type" value={{ kind: 'ref', targetId: ids.category }} onChange={() => {}} />,
    )
    expect(screen.getByRole('combobox', { name: 'Field type' })).toHaveTextContent('PetCategory')
  })
})
