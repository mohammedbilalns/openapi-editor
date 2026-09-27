import * as React from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { SchemaTypeIcon } from '@/components/shared'
import { CommandGroup, CommandItem } from '@/components/ui/command'
import { fieldClassName } from '@/components/ui/recipes'
import type { SchemaOption } from '@/lib/openapi/selectors'
import type { NodeId } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'
import { filterSchemaOptions, type FilteredOptions } from './schema-pick'

export type PickerSize = 'sm' | 'default'

/** Trigger that looks like a Select trigger (§9.8), for the popover pickers. */
export function pickerTriggerClassName(size: PickerSize | undefined, className?: string) {
  return cn(
    fieldClassName,
    'flex cursor-pointer items-center gap-1.5 pr-2 pl-2.5 text-left whitespace-nowrap select-none',
    'data-popup-open:border-ring',
    size === 'sm' ? 'h-7 rounded-md text-xs' : 'h-8 text-sm',
    className,
  )
}

export function PickerChevron() {
  return <ChevronsUpDown aria-hidden className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
}

/** Popup sizing shared by both pickers: at least the trigger's width, never wider than the screen. */
export const pickerPopupClassName = 'w-(--anchor-width) min-w-64 max-w-[calc(100vw-2rem)] gap-0 p-0'

/** Filters with a deferred query so typing stays responsive with thousands of schemas. */
export function useFilteredOptions(
  options: readonly SchemaOption[],
  query: string,
  excludeIds: ReadonlySet<NodeId> | undefined,
): FilteredOptions {
  const deferredQuery = React.useDeferredValue(query)
  return React.useMemo(
    () => filterSchemaOptions(options, deferredQuery, excludeIds),
    [options, deferredQuery, excludeIds],
  )
}

/** Stable Set from an `excludeIds` prop, so an inline array literal doesn't refilter on every render. */
export function useIdSet(ids: readonly NodeId[] | ReadonlySet<NodeId> | undefined): ReadonlySet<NodeId> | undefined {
  const key = ids ? [...ids].join('\u0000') : ''
  // Keyed on the ids, not the prop identity.
  // oxlint-disable-next-line react/exhaustive-deps
  return React.useMemo(() => (ids ? new Set(ids) : undefined), [key])
}

export function SchemaName({ name, className }: { name: string; className?: string }) {
  return name ? (
    <span className={cn('truncate font-mono', className)}>{name}</span>
  ) : (
    <span className={cn('truncate text-muted-foreground', className)}>Unnamed schema</span>
  )
}

/** The "Schemas" group: rows with type icon and mono name, capped, with a note when more match. */
export function SchemaResultsGroup({
  results,
  selectedId,
  onSelect,
}: {
  results: FilteredOptions
  selectedId: NodeId | undefined
  onSelect: (id: NodeId) => void
}) {
  if (results.items.length === 0) return null
  const hidden = results.total - results.items.length
  return (
    <CommandGroup heading="Schemas">
      {results.items.map((option) => (
        <CommandItem
          key={option.id}
          value={option.id}
          data-checked={option.id === selectedId ? 'true' : undefined}
          onSelect={() => onSelect(option.id)}
        >
          <SchemaTypeIcon type={option.type} />
          <SchemaName name={option.name} className="text-[12.5px]" />
        </CommandItem>
      ))}
      {hidden > 0 && (
        <p className="px-2 py-1.5 text-[11px] text-subtle-foreground">
          {hidden.toLocaleString()} more. Type to narrow the list.
        </p>
      )}
    </CommandGroup>
  )
}

/** Plain-label match for the fixed rows (types, "No body", "Inline object"). */
export function matchesQuery(label: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  return !needle || label.toLowerCase().includes(needle)
}
