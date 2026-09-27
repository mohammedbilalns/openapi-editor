import { createSchema, generateId, type ParameterDef } from '@/lib/openapi/types'

const PATH_PARAM_PATTERN = /\{([^{}/]+)\}/g

/** `{name}` segments of a path, in order, without duplicates. */
export function pathParamNames(path: string): string[] {
  const names: string[] = []
  for (const match of path.matchAll(PATH_PARAM_PATTERN)) {
    const name = match[1].trim()
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/** Adds a leading slash and trims whitespace. */
export function normalizePath(input: string): string {
  const path = input.trim()
  if (!path) return ''
  return path.startsWith('/') ? path : `/${path}`
}

export function createPathParam(name: string): ParameterDef {
  return {
    id: generateId(),
    name,
    in: 'path',
    required: true,
    schema: { kind: 'inline', schema: createSchema('string') },
  }
}

/**
 * Brings path parameters in line with `path` after an edit (BLUEPRINT §3): every
 * `{name}` gets a path parameter. Parameters are never removed; the validator
 * flags extras. When the edit replaced some `{names}` with the same number of new
 * ones (`{id}` → `{petId}`), the old parameters are renamed in order instead, so
 * their type and description carry over.
 *
 * Returns `params` itself when nothing changes.
 */
export function syncPathParams(params: ParameterDef[], path: string, previousPath?: string): ParameterDef[] {
  const names = pathParamNames(path)
  const existing = new Set(params.filter((param) => param.in === 'path').map((param) => param.name))
  const missing = names.filter((name) => !existing.has(name))
  if (missing.length === 0) return params

  if (previousPath !== undefined) {
    const removed = pathParamNames(previousPath).filter((name) => !names.includes(name) && existing.has(name))
    if (removed.length === missing.length) {
      const renames = new Map(removed.map((name, index) => [name, missing[index]]))
      return params.map((param) => {
        const next = param.in === 'path' ? renames.get(param.name) : undefined
        return next === undefined ? param : { ...param, name: next }
      })
    }
  }

  const added = missing.map(createPathParam)
  let lastPathIndex = -1
  params.forEach((param, index) => {
    if (param.in === 'path') lastPathIndex = index
  })
  return [...params.slice(0, lastPathIndex + 1), ...added, ...params.slice(lastPathIndex + 1)]
}

/** Methods whose requests conventionally carry a body. */
export const BODY_METHODS = new Set(['post', 'put', 'patch'])
