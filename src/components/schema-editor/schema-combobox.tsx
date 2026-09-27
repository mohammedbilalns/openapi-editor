import * as React from 'react'
import { Ban, SquareDashed, TriangleAlert } from 'lucide-react'
import { SchemaTypeIcon } from '@/components/shared'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSchemaOptions } from '@/lib/openapi/selectors'
import type { NodeId } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'
import {
  matchesQuery,
  PickerChevron,
  pickerPopupClassName,
  pickerTriggerClassName,
  SchemaName,
  SchemaResultsGroup,
  useFilteredOptions,
  useIdSet,
  type PickerSize,
} from './picker-parts'
import { INLINE_PICK, NONE_PICK, optionsById, type SchemaPick } from './schema-pick'

export type SchemaComboboxProps = {
  value: SchemaPick
  onChange: (value: SchemaPick) => void
  /** Offers a "none" row with this label (e.g. "No body"). */
  allowNone?: string
  /** Offers an "inline" row with this label (e.g. "Inline object"). */
  allowInline?: string
  /** Schemas that can't be picked (e.g. the schema being edited). */
  excludeIds?: readonly NodeId[] | ReadonlySet<NodeId>
  size?: PickerSize
  invalid?: boolean
  'aria-label': string
  'aria-describedby'?: string
  className?: string
  /** Placeholder when nothing is picked and there's no "none" row. */
  placeholder?: string
  /** Opens on mount (e.g. a row that was just added). */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  id?: string
}

/**
 * Picks nothing, an inline schema or a named schema (BLUEPRINT §4 C). Options
 * come from `useSchemaOptions()`; the list filters as you type and renders at
 * most 50 schemas.
 */
export const SchemaCombobox = React.memo(function SchemaCombobox({
  value,
  onChange,
  allowNone,
  allowInline,
  excludeIds,
  size,
  invalid,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  className,
  placeholder = 'Choose a schema',
  defaultOpen,
  onOpenChange,
  id,
}: SchemaComboboxProps) {
  const [open, setOpen] = React.useState(defaultOpen ?? false)
  const options = useSchemaOptions()

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  const choose = (next: SchemaPick) => {
    handleOpenChange(false)
    onChange(next)
  }

  const selected = value.kind === 'ref' ? optionsById(options).get(value.id) : undefined

  let display: React.ReactNode
  if (value.kind === 'ref') {
    display = selected ? (
      <>
        <SchemaTypeIcon type={selected.type} />
        <SchemaName name={selected.name} />
      </>
    ) : (
      <>
        <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-destructive-foreground" />
        <span className="truncate text-destructive-foreground">Missing schema</span>
      </>
    )
  } else if (value.kind === 'inline') {
    display = (
      <>
        <SquareDashed aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{allowInline ?? 'Inline schema'}</span>
      </>
    )
  } else {
    display = <span className="truncate text-muted-foreground">{allowNone ?? placeholder}</span>
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {/* Select-only combobox pattern (ARIA 1.2): the name is the label, the value is the text. Base UI adds aria-controls while open. */}
      <PopoverTrigger
        id={id}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/role-has-required-aria-props
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        className={pickerTriggerClassName(size, cn('w-full min-w-0', className))}
      >
        {display}
        <PickerChevron />
      </PopoverTrigger>
      <PopoverContent align="start" className={pickerPopupClassName}>
        {open && (
          <SchemaComboboxList
            value={value}
            allowNone={allowNone}
            allowInline={allowInline}
            excludeIds={excludeIds}
            onChoose={choose}
          />
        )}
      </PopoverContent>
    </Popover>
  )
})

function SchemaComboboxList({
  value,
  allowNone,
  allowInline,
  excludeIds,
  onChoose,
}: {
  value: SchemaPick
  allowNone?: string
  allowInline?: string
  excludeIds?: readonly NodeId[] | ReadonlySet<NodeId>
  onChoose: (value: SchemaPick) => void
}) {
  const [query, setQuery] = React.useState('')
  const options = useSchemaOptions()
  const excluded = useIdSet(excludeIds)
  const results = useFilteredOptions(options, query, excluded)
  const showNone = allowNone !== undefined && matchesQuery(allowNone, query)
  const showInline = allowInline !== undefined && matchesQuery(allowInline, query)

  return (
    <Command
      shouldFilter={false}
      loop
      // Start on the current value so Enter keeps it and arrows move from it.
      defaultValue={value.kind === 'ref' ? value.id : value.kind === 'inline' ? '__inline__' : '__none__'}
      label="Search schemas"
    >
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search schemas…" />
      <CommandList>
        <CommandEmpty>No schemas match.</CommandEmpty>
        {(showNone || showInline) && (
          <CommandGroup>
            {showNone && (
              <CommandItem
                value="__none__"
                data-checked={value.kind === 'none' ? 'true' : undefined}
                onSelect={() => onChoose(NONE_PICK)}
              >
                <Ban aria-hidden />
                {allowNone}
              </CommandItem>
            )}
            {showInline && (
              <CommandItem
                value="__inline__"
                data-checked={value.kind === 'inline' ? 'true' : undefined}
                onSelect={() => onChoose(INLINE_PICK)}
              >
                <SquareDashed aria-hidden />
                {allowInline}
              </CommandItem>
            )}
          </CommandGroup>
        )}
        <SchemaResultsGroup
          results={results}
          selectedId={value.kind === 'ref' ? value.id : undefined}
          onSelect={(id) => onChoose({ kind: 'ref', id })}
        />
      </CommandList>
    </Command>
  )
}
