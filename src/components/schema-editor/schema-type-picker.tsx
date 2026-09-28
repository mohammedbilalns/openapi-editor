import * as React from 'react'
import { TriangleAlert } from 'lucide-react'
import { SchemaTypeIcon } from '@/components/shared'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSchemaOptions, type SchemaOption } from '@/lib/openapi/selectors'
import { createSchema, type NodeId, type SchemaNode, type SchemaOrRef, type SchemaType } from '@/lib/openapi/types'
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
import { optionsById } from './schema-pick'

/** Types offered for an inline schema when `allowedTypes` isn't given. */
export const DEFAULT_INLINE_TYPES: readonly SchemaType[] = ['string', 'number', 'integer', 'boolean', 'object', 'array']

export const PRIMITIVE_TYPES: readonly SchemaType[] = ['string', 'number', 'integer', 'boolean']

export type SchemaTypePickerProps = {
  value: SchemaOrRef
  onChange: (value: SchemaOrRef) => void
  /** Inline types offered in the "Types" group. */
  allowedTypes?: readonly SchemaType[]
  /** Offers named schemas as references (default `true`). */
  allowRef?: boolean
  excludeIds?: readonly NodeId[] | ReadonlySet<NodeId>
  size?: PickerSize
  invalid?: boolean
  'aria-label': string
  'aria-describedby'?: string
  className?: string
  id?: string
}

/** Short label for an inline schema: `string`, `string[]`, `Pet[]` (the format shows next to it). */
function inlineLabel(schema: SchemaNode, options: readonly SchemaOption[]): string {
  if (schema.type === 'array' && schema.items) {
    const items = schema.items
    const inner =
      items.kind === 'ref'
        ? (optionsById(options).get(items.targetId)?.name ?? 'unknown')
        : items.schema.type === 'array'
          ? inlineLabel(items.schema, options)
          : items.schema.type
    return `${inner || 'unnamed'}[]`
  }
  return schema.type
}

/**
 * Picks an inline type or a reference (BLUEPRINT §4 C): parameter and field
 * types. Choosing the type the value already has keeps the inline schema as it
 * is, so nested details aren't thrown away.
 */
export const SchemaTypePicker = React.memo(function SchemaTypePicker({
  value,
  onChange,
  allowedTypes = DEFAULT_INLINE_TYPES,
  allowRef = true,
  excludeIds,
  size,
  invalid,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  className,
  id,
}: SchemaTypePickerProps) {
  const [open, setOpen] = React.useState(false)
  const options = useSchemaOptions()

  const chooseType = (type: SchemaType) => {
    setOpen(false)
    if (value.kind === 'inline' && value.schema.type === type) {
      // An untyped schema (imported without `type`) keeps its details and gets the type keyword.
      if (value.schema.untyped) onChange({ kind: 'inline', schema: { ...value.schema, untyped: undefined } })
      return
    }
    onChange({ kind: 'inline', schema: createSchema(type) })
  }
  const chooseRef = (targetId: NodeId) => {
    setOpen(false)
    if (value.kind === 'ref' && value.targetId === targetId) return
    onChange({ kind: 'ref', targetId })
  }

  let display: React.ReactNode
  if (value.kind === 'ref') {
    const target = optionsById(options).get(value.targetId)
    display = target ? (
      <>
        <SchemaTypeIcon type={target.type} />
        <SchemaName name={target.name} />
      </>
    ) : (
      <>
        <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-destructive-foreground" />
        <span className="truncate text-destructive-foreground">Missing schema</span>
      </>
    )
  } else {
    display = (
      <>
        <SchemaTypeIcon type={value.schema.type} />
        <span className="truncate font-mono">{inlineLabel(value.schema, options)}</span>
        {value.schema.format && (
          <span className="truncate font-mono text-subtle-foreground">{value.schema.format}</span>
        )}
      </>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          <SchemaTypeList
            value={value}
            allowedTypes={allowedTypes}
            allowRef={allowRef}
            excludeIds={excludeIds}
            onChooseType={chooseType}
            onChooseRef={chooseRef}
          />
        )}
      </PopoverContent>
    </Popover>
  )
})

function SchemaTypeList({
  value,
  allowedTypes,
  allowRef,
  excludeIds,
  onChooseType,
  onChooseRef,
}: {
  value: SchemaOrRef
  allowedTypes: readonly SchemaType[]
  allowRef: boolean
  excludeIds?: readonly NodeId[] | ReadonlySet<NodeId>
  onChooseType: (type: SchemaType) => void
  onChooseRef: (id: NodeId) => void
}) {
  const [query, setQuery] = React.useState('')
  const options = useSchemaOptions()
  const excluded = useIdSet(excludeIds)
  const results = useFilteredOptions(allowRef ? options : EMPTY, query, excluded)
  const types = allowedTypes.filter((type) => matchesQuery(type, query))
  const currentType = value.kind === 'inline' ? value.schema.type : undefined

  return (
    <Command
      shouldFilter={false}
      loop
      // Start on the current value so Enter keeps it and arrows move from it.
      defaultValue={value.kind === 'ref' ? value.targetId : `type:${value.schema.type}`}
      label={allowRef ? 'Search types and schemas' : 'Search types'}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={allowRef ? 'Search types and schemas…' : 'Search types…'}
      />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {types.length > 0 && (
          <CommandGroup heading="Types">
            {types.map((type) => (
              <CommandItem
                key={type}
                value={`type:${type}`}
                data-checked={type === currentType ? 'true' : undefined}
                onSelect={() => onChooseType(type)}
              >
                <SchemaTypeIcon type={type} />
                <span className="font-mono text-[12.5px]">{type}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {allowRef && (
          <SchemaResultsGroup
            results={results}
            selectedId={value.kind === 'ref' ? value.targetId : undefined}
            onSelect={onChooseRef}
          />
        )}
      </CommandList>
    </Command>
  )
}

const EMPTY: readonly SchemaOption[] = []
