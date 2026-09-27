import { Braces, Brackets, Combine, Hash, List, ToggleLeft, Type, type LucideIcon } from 'lucide-react'
import type { SchemaType } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'

export const SCHEMA_TYPE_ICONS: Record<SchemaType, LucideIcon> = {
  object: Braces,
  array: Brackets,
  string: Type,
  number: Hash,
  integer: Hash,
  boolean: ToggleLeft,
  enum: List,
  oneOf: Combine,
  anyOf: Combine,
  allOf: Combine,
}

/** Neutral 14px lucide icon for a schema type (BLUEPRINT §2.5). Decorative: pair it with text. */
export function SchemaTypeIcon({ type, className }: { type: SchemaType; className?: string }) {
  const Icon = SCHEMA_TYPE_ICONS[type]
  return <Icon aria-hidden className={cn('size-3.5 shrink-0 text-muted-foreground', className)} />
}
