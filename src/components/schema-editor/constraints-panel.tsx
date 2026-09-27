import * as React from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { FieldRow, Panel } from '@/components/shared'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useActions } from '@/lib/openapi/selectors'
import type { SchemaNode, SchemaType } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'
import { FORMATS, formatValue, parseNumber, parseValue, type Parsed } from './schema-model'
import { useDraft } from './use-draft'

type NumericKey = 'minLength' | 'maxLength' | 'minimum' | 'maximum'

const NO_FORMAT = '__none__'
const NO_VALUE = '__none__'

/** Primitive "Constraints": a two-column grid of the keywords that apply to the type. */
export function ConstraintsPanel({ schema }: { schema: SchemaNode }) {
  const { updateSchema } = useActions()
  const update = React.useCallback(
    (updates: Partial<SchemaNode>) => updateSchema(schema.id, updates),
    [schema.id, updateSchema],
  )
  const { type } = schema
  const numeric = type === 'number' || type === 'integer'

  return (
    <Panel id="constraints" title="Constraints" icon={SlidersHorizontal}>
      <div className="grid gap-x-4 gap-y-3 @[36rem]:grid-cols-2">
        {type !== 'boolean' && <FormatField type={type} format={schema.format} onChange={update} />}
        {type === 'string' && (
          <>
            <TextField label="Pattern" value={schema.pattern} mono placeholder="^[a-z]+$" onChange={(pattern) => update({ pattern })} />
            <NumberField label="Min length" field="minLength" schema={schema} integer min={0} onChange={update} />
            <NumberField label="Max length" field="maxLength" schema={schema} integer min={0} onChange={update} />
          </>
        )}
        {numeric && (
          <>
            <NumberField label="Minimum" field="minimum" schema={schema} onChange={update} />
            <NumberField label="Maximum" field="maximum" schema={schema} onChange={update} />
          </>
        )}
        <ValueField label="Example" type={type} value={schema.example} onChange={(example) => update({ example })} />
        <ValueField label="Default" type={type} value={schema.default} onChange={(value) => update({ default: value })} />
      </div>
    </Panel>
  )
}

function FormatField({
  type,
  format,
  onChange,
}: {
  type: SchemaType
  format: string | undefined
  onChange: (updates: Partial<SchemaNode>) => void
}) {
  const id = React.useId()
  const presets = FORMATS[type] ?? []
  // A format from an import that isn't a preset is still shown, and kept.
  const options = format && !presets.includes(format) ? [...presets, format] : presets
  return (
    <FieldRow label="Format" htmlFor={id} layout="stacked">
      <Select
        value={format ?? NO_FORMAT}
        onValueChange={(value) => onChange({ format: value === NO_FORMAT ? undefined : value })}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_FORMAT}>
            <span className="text-muted-foreground">None</span>
          </SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              <span className="font-mono">{option}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  )
}

function TextField({
  label,
  value,
  mono,
  placeholder,
  onChange,
}: {
  label: string
  value: string | undefined
  mono?: boolean
  placeholder?: string
  onChange: (value: string | undefined) => void
}) {
  const id = React.useId()
  const { sealHistory } = useActions()
  return (
    <FieldRow label={label} htmlFor={id} layout="stacked">
      <Input
        id={id}
        value={value ?? ''}
        placeholder={placeholder}
        spellCheck={mono ? false : undefined}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value || undefined)}
        onBlur={sealHistory}
        className={cn(mono && 'font-mono text-[12.5px]')}
      />
    </FieldRow>
  )
}

const formatNumber = (value: number | undefined) => (value === undefined ? '' : String(value))

function NumberField({
  label,
  field,
  schema,
  integer,
  min,
  onChange,
}: {
  label: string
  field: NumericKey
  schema: SchemaNode
  integer?: boolean
  min?: number
  onChange: (updates: Partial<SchemaNode>) => void
}) {
  const id = React.useId()
  const draft = useDraft<number>({
    value: schema[field] as number,
    format: formatNumber,
    parse: (text) => parseNumber(text, { integer, min }),
    onCommit: (value) => onChange({ [field]: value }),
  })
  return (
    <FieldRow
      label={label}
      htmlFor={id}
      layout="stacked"
      issues={draft.error ? [{ message: draft.error, severity: 'error' }] : undefined}
    >
      <Input
        id={id}
        {...draft.inputProps}
        inputMode={integer ? 'numeric' : 'decimal'}
        autoComplete="off"
        aria-invalid={draft.error ? true : undefined}
        aria-describedby={draft.error ? `${id}-issues` : undefined}
        className="font-mono text-[12.5px] tabular-nums"
      />
    </FieldRow>
  )
}

function ValueField({
  label,
  type,
  value,
  onChange,
}: {
  label: string
  type: SchemaType
  value: unknown
  onChange: (value: unknown) => void
}) {
  const id = React.useId()
  if (type === 'boolean') {
    const current = typeof value === 'boolean' ? String(value) : NO_VALUE
    return (
      <FieldRow label={label} htmlFor={id} layout="stacked">
        <Select value={current} onValueChange={(next) => onChange(next === NO_VALUE ? undefined : next === 'true')}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_VALUE}>
              <span className="text-muted-foreground">None</span>
            </SelectItem>
            <SelectItem value="true">
              <span className="font-mono">true</span>
            </SelectItem>
            <SelectItem value="false">
              <span className="font-mono">false</span>
            </SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
    )
  }
  return <ParsedValueField id={id} label={label} type={type} value={value} onChange={onChange} />
}

function ParsedValueField({
  id,
  label,
  type,
  value,
  onChange,
}: {
  id: string
  label: string
  type: SchemaType
  value: unknown
  onChange: (value: unknown) => void
}) {
  const numeric = type === 'number' || type === 'integer'
  const draft = useDraft<unknown>({
    value,
    format: formatValue,
    parse: (text): Parsed<unknown> => parseValue(text, type),
    onCommit: onChange,
  })
  return (
    <FieldRow
      label={label}
      htmlFor={id}
      layout="stacked"
      issues={draft.error ? [{ message: draft.error, severity: 'error' }] : undefined}
    >
      <Input
        id={id}
        {...draft.inputProps}
        inputMode={numeric ? 'decimal' : undefined}
        autoComplete="off"
        aria-invalid={draft.error ? true : undefined}
        aria-describedby={draft.error ? `${id}-issues` : undefined}
        className={cn(numeric && 'font-mono text-[12.5px] tabular-nums')}
      />
    </FieldRow>
  )
}
