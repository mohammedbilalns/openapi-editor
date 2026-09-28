import { describe, expect, it } from 'vitest'
import type { Issue } from '@/lib/openapi/analysis'
import { createRoute, createSchema } from '@/lib/openapi/types'
import { splitIssues } from './live-issues'

const route = createRoute('/pets', 'get')
const schema = createSchema('object', 'Pet')

function issue(severity: Issue['severity'], entity: Issue['entity'], key: string): Issue {
  const owner = entity.kind === 'route' || entity.kind === 'schema' ? entity.id : 'settings:info'
  return { key, code: 'x', message: key, severity, owner, entity, location: '' }
}

const onRoute = { kind: 'route', id: route.id, method: 'get', path: '/pets' } as const
const onSchema = { kind: 'schema', id: schema.id, name: 'Pet' } as const
const onInfo = { kind: 'settings', section: 'info' } as const

describe('splitIssues', () => {
  const issues = [
    issue('error', onRoute, 'route-error'),
    issue('warning', onInfo, 'info-warning'),
    issue('info', onRoute, 'route-note'),
    issue('info', onSchema, 'schema-note'),
  ]

  it('counts only errors and warnings as problems; info-level issues are suggestions', () => {
    const split = splitIssues(issues, new Map([[route.id, route]]), new Map([[schema.id, schema]]))
    expect(split.problems.map((i) => i.key)).toEqual(['route-error', 'info-warning'])
    expect(split.suggestions.map((i) => i.key)).toEqual(['route-note', 'schema-note'])
    expect([split.errors, split.warnings]).toEqual([1, 1])
  })

  it('drops issues of routes and schemas that no longer exist, before validation reruns', () => {
    const split = splitIssues(issues, new Map(), new Map([[schema.id, schema]]))
    expect(split.problems.map((i) => i.key)).toEqual(['info-warning'])
    expect(split.suggestions.map((i) => i.key)).toEqual(['schema-note'])
    expect([split.errors, split.warnings]).toEqual([0, 1])
  })
})
