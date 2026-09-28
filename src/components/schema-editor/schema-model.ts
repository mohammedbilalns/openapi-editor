/**
 * Pure helpers for schema edits: type changes, field renames, value parsing.
 * Kept out of the components so they can be tested without rendering.
 */
import { createSchema, type SchemaNode, type SchemaType } from '@/lib/openapi/types'

export const SCHEMA_TYPES: readonly { value: SchemaType; label: string; hint: string }[] = [
  { value: 'object', label: 'object', hint: 'Named fields' },
  { value: 'array', label: 'array', hint: 'A list of items' },
  { value: 'string', label: 'string', hint: 'Text' },
  { value: 'number', label: 'number', hint: 'Any number' },
  { value: 'integer', label: 'integer', hint: 'Whole number' },
  { value: 'boolean', label: 'boolean', hint: 'true or false' },
  { value: 'enum', label: 'enum', hint: 'One of fixed values' },
  { value: 'oneOf', label: 'oneOf', hint: 'Exactly one variant' },
  { value: 'anyOf', label: 'anyOf', hint: 'One or more variants' },
  { value: 'allOf', label: 'allOf', hint: 'All variants combined' },
]

export const COMPOSITION_TYPES: readonly SchemaType[] = ['oneOf', 'anyOf', 'allOf']
const PRIMITIVES: readonly SchemaType[] = ['string', 'number', 'integer', 'boolean']
const NUMERIC: readonly SchemaType[] = ['number', 'integer']

export const isComposition = (type: SchemaType) => COMPOSITION_TYPES.includes(type)
export const isPrimitive = (type: SchemaType) => PRIMITIVES.includes(type)

/** Formats offered per primitive type (a format outside this list is still shown and kept). */
export const FORMATS: Partial<Record<SchemaType, readonly string[]>> = {
  string: ['date', 'date-time', 'email', 'uri', 'uuid', 'password', 'byte', 'binary'],
  number: ['float', 'double'],
  integer: ['int32', 'int64'],
}

type TypeSpecificKey =
  | 'properties'
  | 'required'
  | 'items'
  | 'variants'
  | 'discriminator'
  | 'enumValues'
  | 'enumType'
  | 'format'
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'minimum'
  | 'maximum'
  | 'example'
  | 'default'

/**
 * What changing `schema` to `next` would throw away, as the confirm description
 * ("Fields will be removed."), or `null` when nothing the user entered is lost.
 */
export function typeChangeLoss(schema: SchemaNode, next: SchemaType): string | null {
  if (schema.type === next) return null
  if (schema.type === 'object' && (schema.properties?.size ?? 0) > 0) return 'Fields will be removed.'
  if (schema.type === 'enum' && (schema.enumValues?.length ?? 0) > 0) return 'Values will be removed.'
  if (isComposition(schema.type) && !isComposition(next) && (schema.variants?.length ?? 0) > 0) {
    return 'Variants will be removed.'
  }
  if (schema.type === 'array' && schema.items) {
    const items = schema.items
    const trivial = items.kind === 'inline' && items.schema.type === 'string' && !items.schema.properties?.size
    if (!trivial) return 'The item type will be removed.'
  }
  return null
}

/**
 * Updates for `updateSchema` that turn `schema` into `next`: structures for the
 * new type are created, ones it can't have are cleared, and an untyped
 * (imported without `type`) schema becomes typed. Compatible parts are
 * kept (variants between oneOf/anyOf/allOf; constraints between number and
 * integer; example and default between primitives).
 */
export function changeSchemaType(schema: SchemaNode, next: SchemaType): Partial<SchemaNode> {
  // Choosing a type sets it: an imported schema without `type` exports one from now on.
  const typed = schema.untyped ? { untyped: undefined } : {}
  // Same type on an untyped schema: only the type keyword is new, the structure stays.
  if (schema.type === next) return { type: next, ...typed }
  const fresh = createSchema(next)
  const updates: Partial<Record<TypeSpecificKey | 'untyped', unknown>> & { type: SchemaType } = { type: next, ...typed }
  const clear = (...keys: TypeSpecificKey[]) => {
    for (const key of keys) if (schema[key] !== undefined) updates[key] = undefined
  }

  if (next === 'object') {
    updates.properties = new Map()
    updates.required = []
  } else clear('properties', 'required')

  if (next === 'array') updates.items = fresh.items
  else clear('items')

  if (next === 'enum') updates.enumValues = []
  else clear('enumValues', 'enumType')

  if (isComposition(next)) {
    updates.variants = isComposition(schema.type) ? (schema.variants ?? []) : []
    if (next !== 'oneOf') clear('discriminator')
  } else clear('variants', 'discriminator')

  const bothNumeric = NUMERIC.includes(schema.type) && NUMERIC.includes(next)
  if (next !== 'string') clear('minLength', 'maxLength', 'pattern')
  if (!NUMERIC.includes(next)) clear('minimum', 'maximum')
  if (!(schema.type === 'string' && next === 'string') && !bothNumeric) clear('format')
  if (!isPrimitive(next) || !isPrimitive(schema.type) || (next === 'boolean') !== (schema.type === 'boolean')) {
    clear('example', 'default')
  }
  return updates as Partial<SchemaNode>
}

// ---------------------------------------------------------------------------
// Fields

/** Why a field name can't be used, or `null` when it can. */
export function fieldNameProblem(name: string, schema: SchemaNode | undefined, current?: string): string | null {
  if (!name.trim()) return "Field names can't be empty."
  if (name !== current && schema?.properties?.has(name)) return `Another field is already named ${name}.`
  return null
}

/** `base`, or `base2`, `base3`… whichever isn't taken. */
export function uniqueFieldName(schema: SchemaNode | undefined, base = 'newField'): string {
  if (!schema?.properties?.has(base)) return base
  let n = 2
  while (schema.properties.has(`${base}${n}`)) n += 1
  return `${base}${n}`
}

// ---------------------------------------------------------------------------
// Values

export type Parsed<T> = { ok: true; value: T | undefined } | { ok: false; message: string }

/** Parses a number input: "" clears, anything else must be a finite number (and whole, when `integer`). */
export function parseNumber(text: string, options: { integer?: boolean; min?: number } = {}): Parsed<number> {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true, value: undefined }
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return { ok: false, message: 'Enter a number.' }
  if (options.integer && !Number.isInteger(value)) return { ok: false, message: 'Enter a whole number.' }
  if (options.min !== undefined && value < options.min) return { ok: false, message: `Enter ${options.min} or more.` }
  return { ok: true, value }
}

/** Parses an example/default for a primitive type. "" clears. */
export function parseValue(text: string, type: SchemaType): Parsed<unknown> {
  if (type === 'number' || type === 'integer') return parseNumber(text, { integer: type === 'integer' })
  if (text === '') return { ok: true, value: undefined }
  return { ok: true, value: text }
}

/** How an example/default shows in an input. */
export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

// ---------------------------------------------------------------------------
// Enums

export type EnumType = NonNullable<SchemaNode['enumType']>

/** One JSON value of an enum. */
export type EnumValue = NonNullable<SchemaNode['enumValues']>[number]

export const ENUM_TYPE_NOUN: Record<EnumType, string> = {
  string: 'text',
  integer: 'whole numbers',
  number: 'numbers',
  boolean: 'true or false',
}

/** The enum's JSON type: explicit, or inferred from the values like the serializer does. */
export function effectiveEnumType(schema: Pick<SchemaNode, 'enumType' | 'enumValues'>): EnumType {
  if (schema.enumType) return schema.enumType
  const values = schema.enumValues ?? []
  if (values.length > 0) {
    if (values.every((v) => typeof v === 'number')) return values.every((v) => Number.isInteger(v)) ? 'integer' : 'number'
    if (values.every((v) => typeof v === 'boolean')) return 'boolean'
  }
  return 'string'
}

/** Parses an enum value typed into an input. "" is `undefined` (nothing to add). */
export function parseEnumValue(text: string, type: EnumType): Parsed<EnumValue> {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true, value: undefined }
  if (type === 'integer' || type === 'number') return parseNumber(trimmed, { integer: type === 'integer' })
  if (type === 'boolean') {
    if (trimmed === 'true' || trimmed === 'false') return { ok: true, value: trimmed === 'true' }
    return { ok: false, message: 'Enter true or false.' }
  }
  return { ok: true, value: trimmed }
}

/** A value converted to another enum type, or `undefined` when it can't be. */
export function convertEnumValue(value: EnumValue, type: EnumType): EnumValue | undefined {
  const parsed = parseEnumValue(formatValue(value), type)
  return parsed.ok ? parsed.value : undefined
}
