import type { SchemaOption } from '@/lib/openapi/selectors'
import { createSchema, type NodeId, type SchemaOrRef, type SchemaType } from '@/lib/openapi/types'

/** What a SchemaCombobox selects: nothing, an inline schema, or a reference to a named schema. */
export type SchemaPick = { kind: 'none' } | { kind: 'inline' } | { kind: 'ref'; id: NodeId }

export const NONE_PICK: SchemaPick = Object.freeze({ kind: 'none' })
export const INLINE_PICK: SchemaPick = Object.freeze({ kind: 'inline' })

/** The store's representation → a pick. `undefined` (no schema) is `none`. */
export function schemaPickFrom(value: SchemaOrRef | undefined): SchemaPick {
  if (!value) return NONE_PICK
  if (value.kind === 'ref') return { kind: 'ref', id: value.targetId }
  return INLINE_PICK
}

/**
 * A pick → the store's representation. `none` is `undefined`. `inline` keeps
 * `previous` when it already is inline (so switching back and forth doesn't
 * throw away an inline schema), otherwise creates an empty inline schema of
 * `inlineType` (default `object`).
 */
export function schemaOrRefFromPick(
  pick: SchemaPick,
  previous?: SchemaOrRef,
  inlineType: SchemaType = 'object',
): SchemaOrRef | undefined {
  switch (pick.kind) {
    case 'none':
      return undefined
    case 'inline':
      return previous?.kind === 'inline' ? previous : { kind: 'inline', schema: createSchema(inlineType) }
    case 'ref':
      return previous?.kind === 'ref' && previous.targetId === pick.id ? previous : { kind: 'ref', targetId: pick.id }
  }
}

export function isSamePick(a: SchemaPick, b: SchemaPick): boolean {
  if (a.kind !== b.kind) return false
  return a.kind !== 'ref' || a.id === (b as { id: NodeId }).id
}

// ---------------------------------------------------------------------------
// Option filtering, shared by both pickers

/** How many schema rows a picker renders at most; the rest are reached by typing. */
export const PICKER_RESULT_LIMIT = 50

const optionIndexCache = new WeakMap<readonly SchemaOption[], Map<NodeId, SchemaOption>>()

/** Id → option, cached per options array (the array keeps its identity until a name or type changes). */
export function optionsById(options: readonly SchemaOption[]): Map<NodeId, SchemaOption> {
  let index = optionIndexCache.get(options)
  if (!index) {
    index = new Map(options.map((option) => [option.id, option]))
    optionIndexCache.set(options, index)
  }
  return index
}

export type FilteredOptions = { items: SchemaOption[]; total: number }

/**
 * Case-insensitive substring match on the name, keeping the sorted order but
 * putting prefix matches first. Returns at most `limit` items plus the total.
 */
export function filterSchemaOptions(
  options: readonly SchemaOption[],
  query: string,
  excludeIds?: ReadonlySet<NodeId>,
  limit = PICKER_RESULT_LIMIT,
): FilteredOptions {
  const needle = query.trim().toLowerCase()
  const prefix: SchemaOption[] = []
  const rest: SchemaOption[] = []
  for (const option of options) {
    if (excludeIds?.has(option.id)) continue
    if (!needle) {
      prefix.push(option)
      continue
    }
    const at = option.name.toLowerCase().indexOf(needle)
    if (at === 0) prefix.push(option)
    else if (at > 0) rest.push(option)
  }
  const total = prefix.length + rest.length
  const items = prefix.length >= limit ? prefix.slice(0, limit) : prefix.concat(rest.slice(0, limit - prefix.length))
  return { items, total }
}

export function toIdSet(ids: Iterable<NodeId> | undefined): ReadonlySet<NodeId> | undefined {
  if (!ids) return undefined
  return ids instanceof Set ? ids : new Set(ids)
}
