import { describe, expect, it } from 'vitest'
import { createPathParam, pathParamNames, syncPathParams } from './path-params'
import type { ParameterDef } from '@/lib/openapi/types'

const query = (name: string): ParameterDef => ({ ...createPathParam(name), in: 'query', required: false })

describe('pathParamNames', () => {
  it('reads each {segment} once, in order', () => {
    expect(pathParamNames('/a/{x}/b/{y}/{x}')).toEqual(['x', 'y'])
    expect(pathParamNames('/a/{unclosed')).toEqual([])
  })
})

describe('syncPathParams', () => {
  it('returns the same array when every segment already has a parameter', () => {
    const params = [createPathParam('id'), query('limit')]
    expect(syncPathParams(params, '/pets/{id}')).toBe(params)
    expect(syncPathParams(params, '/pets')).toBe(params)
  })

  it('inserts new path parameters after the existing path ones, before query ones', () => {
    const params = [createPathParam('petId'), query('limit')]
    const next = syncPathParams(params, '/pets/{petId}/toys/{toyId}')
    expect(next.map((p) => `${p.in}:${p.name}`)).toEqual(['path:petId', 'path:toyId', 'query:limit'])
    expect(next[2]).toBe(params[1])
  })

  it('renames in place when the edit swapped segment names one for one', () => {
    const params = [createPathParam('a'), createPathParam('b')]
    const next = syncPathParams(params, '/x/{c}/{b}', '/x/{a}/{b}')
    expect(next.map((p) => p.name)).toEqual(['c', 'b'])
    expect(next[0].id).toBe(params[0].id)
  })

  it('adds instead of renaming when segments were added as well as removed', () => {
    const params = [createPathParam('a')]
    const next = syncPathParams(params, '/x/{b}/{c}', '/x/{a}')
    expect(next.map((p) => p.name)).toEqual(['a', 'b', 'c'])
  })
})
