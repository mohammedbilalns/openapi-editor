import { describe, expect, it } from 'vitest'
import { createEmptyDocument, createRoute, createSchema, type ApiDocument, type ParameterDef } from '../types'
import { validateToIssues } from './handler'
import { INFO_ISSUES, countIssues, fieldIssues, issueField, issueProps, problemHref, type Issue } from './issues'

function param(name: string, location: ParameterDef['in'], schema: ParameterDef['schema']): ParameterDef {
  return { id: `param-${name}`, name, in: location, required: location === 'path', schema }
}

function docWith(build: (doc: ApiDocument) => void): ApiDocument {
  const doc = createEmptyDocument()
  doc.info.description = 'Test API'
  doc.servers = [{ url: 'https://api.example.com' }]
  build(doc)
  return doc
}

describe('toIssues / validateToIssues', () => {
  it('locates a broken parameter reference on the parameter row', () => {
    const route = createRoute('/pets/{petId}', 'get')
    route.operationId = 'getPet'
    route.parameters = [
      param('petId', 'path', { kind: 'inline', schema: createSchema('string') }),
      param('limit', 'query', { kind: 'ref', targetId: 'missing-schema' }),
    ]
    const doc = docWith((d) => d.routes.set(route.id, route))

    const broken = validateToIssues(doc).find((issue) => issue.code === 'BROKEN_REFERENCE')!
    expect(broken.owner).toBe(route.id)
    expect(broken.field).toBe(issueField.param('param-limit'))
    expect(broken.location).toBe('parameters.limit')
    expect(problemHref(broken)).toBe(`/routes/${route.id}#param-param-limit`)
  })

  it('flags path parameters that are not in the path, on their row', () => {
    const route = createRoute('/pets', 'get')
    route.operationId = 'listPets'
    route.parameters = [param('petId', 'path', { kind: 'inline', schema: createSchema('string') })]
    const doc = docWith((d) => d.routes.set(route.id, route))

    const extra = validateToIssues(doc).find((issue) => issue.code === 'EXTRA_PATH_PARAM')!
    expect(extra.severity).toBe('error')
    expect(problemHref(extra)).toBe(`/routes/${route.id}#param-param-petId`)
  })

  it('points a success response without a body at that response', () => {
    const route = createRoute('/pets', 'get')
    route.operationId = 'listPets'
    const doc = docWith((d) => d.routes.set(route.id, route))
    const issue = validateToIssues(doc).find((i) => i.code === 'SUCCESS_WITHOUT_BODY')!
    expect(problemHref(issue)).toBe(`/routes/${route.id}#response-200`)
  })

  it('maps schema field issues to the field anchor and info issues to settings', () => {
    const pet = createSchema('object', 'Pet')
    pet.required = ['name tag']
    const doc = docWith((d) => {
      d.schemas.set(pet.id, pet)
      d.info.title = ' '
    })
    const issues = validateToIssues(doc)

    const required = issues.find((i) => i.code === 'INVALID_REQUIRED')!
    expect(problemHref(required)).toBe(`/schemas/${pet.id}#field-name%20tag`)

    const title = issues.find((i) => i.code === 'MISSING_TITLE')!
    expect(title.owner).toBe(INFO_ISSUES)
    expect(title.field).toBe('title')
    expect(problemHref(title)).toBe('/settings/info')
  })

  it('sorts API info first, then routes by path, then schemas by name; errors first', () => {
    const b = createRoute('/b', 'get')
    const a = createRoute('/a/{id}', 'get') // {id} has no parameter: an error
    const zeta = createSchema('enum', 'Zeta')
    const alpha = createSchema('enum', 'Alpha')
    const doc = docWith((d) => {
      d.routes.set(b.id, b).set(a.id, a)
      d.schemas.set(zeta.id, zeta).set(alpha.id, alpha)
      d.info.version = ''
    })
    const owners = [...new Set(validateToIssues(doc).map((issue) => issue.owner))]
    expect(owners).toEqual([INFO_ISSUES, a.id, b.id, alpha.id, zeta.id])

    const forA = validateToIssues(doc).filter((issue) => issue.owner === a.id)
    expect(forA.map((issue) => [issue.severity, issue.code])).toEqual([
      ['error', 'UNDEFINED_PATH_PARAM'],
      ['warning', 'MISSING_OPERATION_ID'],
      ['warning', 'SUCCESS_WITHOUT_BODY'],
      ['info', 'NO_ERROR_RESPONSE'],
    ])
  })

  it('gives every issue a unique key', () => {
    const schema = createSchema('enum', 'Status')
    schema.enumValues = ['a', 'a', 'a']
    const doc = docWith((d) => d.schemas.set(schema.id, schema))
    const keys = validateToIssues(doc).map((issue) => issue.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

const issue = (severity: Issue['severity'], field: string): Issue => ({
  key: `${severity}-${field}`,
  code: 'X',
  message: 'Message',
  severity,
  owner: 'route-1',
  entity: { kind: 'route', id: 'route-1', method: 'get', path: '/a' },
  field,
  location: field,
})

describe('issueProps / fieldIssues', () => {

  it('marks the control invalid only for errors; warnings only describe it', () => {
    const issues = [issue('warning', 'operationId'), issue('info', 'path'), issue('error', 'responses')]
    expect(issueProps(issues, 'responses', 'res')).toEqual({ 'aria-invalid': true, 'aria-describedby': 'res-issues' })
    expect(issueProps(issues, 'operationId', 'op')).toEqual({ 'aria-invalid': undefined, 'aria-describedby': 'op-issues' })
    expect(issueProps(issues, 'path', 'path')).toEqual({ 'aria-invalid': undefined, 'aria-describedby': undefined })
    expect(fieldIssues(issues, 'operationId').map((i) => i.severity)).toEqual(['warning'])
    expect(fieldIssues(issues, 'path')).toHaveLength(0)
  })

  it('treats a field with both a warning and an error as invalid', () => {
    const issues = [issue('warning', 'operationId'), { ...issue('error', 'operationId'), key: 'e2' }]
    expect(issueProps(issues, 'operationId', 'op')['aria-invalid']).toBe(true)
  })
})

describe('countIssues', () => {
  it('counts each severity separately (info-level suggestions are not warnings)', () => {
    const issues = [issue('info', 'a'), issue('warning', 'b'), issue('error', 'c'), issue('info', 'd'), issue('error', 'e')]
    expect(countIssues(issues)).toEqual({ errors: 2, warnings: 1, infos: 2 })
  })
})
