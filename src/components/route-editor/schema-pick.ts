import type { SchemaPick } from '@/components/schema-editor'
import { createSchema, type SchemaOrRef } from '@/lib/openapi/types'

const NONE: SchemaPick = { kind: 'none' }
const INLINE: SchemaPick = { kind: 'inline' }

/** Store value → SchemaCombobox value. */
export function toPick(value: SchemaOrRef | undefined): SchemaPick {
  if (!value) return NONE
  return value.kind === 'ref' ? { kind: 'ref', id: value.targetId } : INLINE
}

/**
 * SchemaCombobox value → store value. Picking "inline" keeps an existing inline
 * schema rather than replacing it with an empty object.
 */
export function fromPick(pick: SchemaPick, previous: SchemaOrRef | undefined): SchemaOrRef | undefined {
  switch (pick.kind) {
    case 'none':
      return undefined
    case 'inline':
      return previous?.kind === 'inline' ? previous : { kind: 'inline', schema: createSchema('object') }
    case 'ref':
      return { kind: 'ref', targetId: pick.id }
  }
}
