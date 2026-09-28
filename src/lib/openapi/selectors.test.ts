import { describe, expect, it } from 'vitest'
import { buildRouteTree, buildSchemaOptions, buildSchemaUsage, UNTAGGED_GROUP_KEY } from './selectors'
import { createRoute, createSchema, type NodeId, type Route, type SchemaNode, type Tag } from './types'

function routes(...list: Route[]) {
  return new Map<NodeId, Route>(list.map((r) => [r.id, r]))
}

function schemas(...list: SchemaNode[]) {
  return new Map<NodeId, SchemaNode>(list.map((schema) => [schema.id, schema]))
}

function route(path: string, method: Route['method'], tags: string[] = []): Route {
  return { ...createRoute(path, method), tags }
}

describe('buildRouteTree', () => {
  it('is a flat list sorted by path then method when no route has tags', () => {
    const rows = buildRouteTree(routes(route('/pets', 'post'), route('/a', 'get'), route('/pets', 'get')), [])
    expect(rows.map((row) => (row.kind === 'route' ? `${row.method} ${row.path}` : row.label))).toEqual([
      'get /a',
      'get /pets',
      'post /pets',
    ])
    expect(rows.every((row) => row.kind === 'route' && row.groupKey === null)).toBe(true)
  })

  it('groups by defined tags, then unknown tags, then Untagged, repeating multi-tag routes', () => {
    // Defined order (pets, store) differs from the order the sorted routes use them (store, pets).
    const tags: Tag[] = [{ name: 'pets' }, { name: 'unused' }, { name: 'store' }]
    const rows = buildRouteTree(
      routes(route('/pets', 'get', ['pets', 'extra']), route('/orders', 'get', ['store']), route('/health', 'get')),
      tags,
    )
    expect(rows.map((row) => (row.kind === 'group' ? `[${row.label} ${row.count}]` : row.path))).toEqual([
      '[pets 1]',
      '/pets',
      '[store 1]',
      '/orders',
      '[extra 1]',
      '/pets',
      '[Untagged 1]',
      '/health',
    ])
    const keys = rows.map((row) => row.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(rows.at(-2)).toMatchObject({ kind: 'group', key: UNTAGGED_GROUP_KEY, tag: null })
  })

  it('returns the same array for the same inputs', () => {
    const map = routes(route('/a', 'get'))
    const tags: Tag[] = []
    expect(buildRouteTree(map, tags)).toBe(buildRouteTree(map, tags))
  })
})

describe('buildSchemaOptions', () => {
  it('sorts case-insensitively and keeps identity when names and types are unchanged', () => {
    const pet = createSchema('object', 'pet')
    const order = createSchema('string', 'Order')
    const first = buildSchemaOptions(schemas(pet, order))
    expect(first.map((option) => option.name)).toEqual(['Order', 'pet'])
    const second = buildSchemaOptions(schemas({ ...pet, description: 'changed' }, order))
    expect(second).toBe(first)
  })
})

describe('buildSchemaUsage', () => {
  it('finds refs in routes and schemas, including inline schemas, once per referrer', () => {
    const pet = createSchema('object', 'Pet')
    const list: SchemaNode = {
      ...createSchema('array', 'PetList'),
      items: { kind: 'ref', targetId: pet.id },
    }
    const wrapper: SchemaNode = {
      ...createSchema('object', 'Wrapper'),
      properties: new Map([
        [
          'pets',
          {
            name: 'pets',
            required: false,
            schema: {
              kind: 'inline',
              schema: { ...createSchema('array'), items: { kind: 'ref', targetId: pet.id } },
            },
          },
        ],
        ['pet', { name: 'pet', required: false, schema: { kind: 'ref', targetId: pet.id } }],
      ]),
    }
    // a self reference is not a usage
    wrapper.properties!.set('self', { name: 'self', required: false, schema: { kind: 'ref', targetId: wrapper.id } })
    // refs outside properties/items/variants count too, as in the usage counts and the validator
    const dict: SchemaNode = { ...createSchema('object', 'Dict'), additionalProperties: { kind: 'ref', targetId: pet.id } }
    const getPet = route('/pets/{id}', 'get')
    getPet.responses.set('200', {
      id: 'r',
      description: 'ok',
      content: new Map([['application/json', { schema: { kind: 'ref', targetId: pet.id } }]]),
    })
    getPet.responses.set('201', {
      id: 'r2',
      description: 'ok',
      content: new Map([['application/json', { schema: { kind: 'ref', targetId: pet.id } }]]),
    })

    const usage = buildSchemaUsage(routes(getPet), schemas(pet, list, wrapper, dict))
    expect(usage.get(pet.id)).toEqual([
      { kind: 'route', id: getPet.id, label: 'GET /pets/{id}' },
      { kind: 'schema', id: list.id, label: 'PetList' },
      { kind: 'schema', id: wrapper.id, label: 'Wrapper' },
      { kind: 'schema', id: dict.id, label: 'Dict' },
    ])
    expect(usage.has(wrapper.id)).toBe(false)
  })
})
