import * as React from 'react'
import { List, X } from 'lucide-react'
import { confirm, FieldRow, IssueText, Panel } from '@/components/shared'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useActions } from '@/lib/openapi/selectors'
import type { SchemaNode } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'
import { fieldIssues, type Issue } from './schema-issues'
import {
  convertEnumValue,
  effectiveEnumType,
  ENUM_TYPE_NOUN,
  formatValue,
  parseEnumValue,
  type EnumType,
  type EnumValue,
  type Parsed,
} from './schema-model'
import { useDraft } from './use-draft'

const EMPTY_VALUES: readonly EnumValue[] = []
const ENUM_TYPES: readonly EnumType[] = ['string', 'integer', 'number']

function duplicateMessage(value: EnumValue) {
  return `${formatValue(value)} is already a value.`
}

/**
 * Enum "Values": the JSON type of the values, editable chips with a remove
 * button, and an input that adds on Enter.
 */
export function EnumPanel({ schema, issues }: { schema: SchemaNode; issues: readonly Issue[] }) {
  const { updateSchema } = useActions()
  const inputId = React.useId()
  const typeId = React.useId()
  const [text, setText] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const values = schema.enumValues ?? EMPTY_VALUES
  const enumType = effectiveEnumType(schema)
  const types = ENUM_TYPES.includes(enumType) ? ENUM_TYPES : [...ENUM_TYPES, enumType]

  const setValues = (next: readonly EnumValue[], type: EnumType = enumType) =>
    updateSchema(schema.id, { enumValues: [...next], enumType: type })

  const add = () => {
    const parsed = parseEnumValue(text, enumType)
    if (!parsed.ok) {
      setError(parsed.message)
      return
    }
    if (parsed.value === undefined) return
    if (values.some((v) => Object.is(v, parsed.value))) {
      setError(duplicateMessage(parsed.value))
      return
    }
    setValues([...values, parsed.value])
    setText('')
    setError(null)
  }

  const changeType = async (next: EnumType) => {
    if (next === enumType) return
    const converted: EnumValue[] = []
    let dropped = 0
    for (const value of values) {
      const result = convertEnumValue(value, next)
      if (result === undefined || converted.some((v) => Object.is(v, result))) dropped += 1
      else converted.push(result)
    }
    if (dropped > 0) {
      const ok = await confirm({
        title: `Change values to ${next}?`,
        description: `${dropped === 1 ? '1 value' : `${dropped} values`} can't be ${ENUM_TYPE_NOUN[next]} and will be removed.`,
        confirmLabel: 'Change type',
      })
      if (!ok) return
    }
    setValues(converted, next)
  }

  const panelIssues = error ? [{ message: error, severity: 'error' as const }] : fieldIssues(issues, 'enum')
  const issuesId = `${inputId}-issues`
  const numeric = enumType === 'integer' || enumType === 'number'

  return (
    <Panel id="values" title="Values" icon={List} count={values.length}>
      <div className="flex flex-col gap-4">
        <FieldRow label="Value type" htmlFor={typeId}>
          <Select value={enumType} onValueChange={(next) => void changeType(next as EnumType)}>
            <SelectTrigger id={typeId} className="w-full max-w-40">
              <SelectValue>{(value: EnumType) => <span className="font-mono">{value}</span>}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {types.map((type) => (
                <SelectItem key={type} value={type}>
                  <span className="font-mono">{type}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        {values.length > 0 && (
          <ul aria-label="Values" className="flex flex-wrap gap-1.5">
            {values.map((value, index) => (
              <EnumChip
                // Values are unique, but a chip keeps its identity while its value is edited.
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                value={value}
                values={values}
                enumType={enumType}
                onChange={(next) => setValues(values.map((v, i) => (i === index ? next : v)))}
                onRemove={() => setValues(values.filter((_, i) => i !== index))}
              />
            ))}
          </ul>
        )}
        <div>
          <label htmlFor={inputId} className="sr-only">
            Add a value
          </label>
          <Input
            id={inputId}
            value={text}
            placeholder="Add a value and press Enter"
            inputMode={numeric ? 'decimal' : undefined}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={panelIssues.length > 0 || undefined}
            aria-describedby={panelIssues.length > 0 ? issuesId : undefined}
            onChange={(event) => {
              setText(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                add()
              }
            }}
            className="h-8 max-w-sm font-mono text-[12.5px] placeholder:font-sans placeholder:text-sm"
          />
          <IssueText issues={panelIssues} id={issuesId} />
        </div>
      </div>
    </Panel>
  )
}

function EnumChip({
  value,
  values,
  enumType,
  onChange,
  onRemove,
}: {
  value: EnumValue
  values: readonly EnumValue[]
  enumType: EnumType
  onChange: (value: EnumValue) => void
  onRemove: () => void
}) {
  const errorId = React.useId()
  const label = formatValue(value)
  const draft = useDraft<EnumValue>({
    value,
    format: formatValue,
    live: false,
    parse: (text): Parsed<EnumValue> => {
      const parsed = parseEnumValue(text, enumType)
      if (!parsed.ok) return parsed
      if (parsed.value === undefined) return { ok: false, message: "Values can't be empty. Use × to remove one." }
      if (!Object.is(parsed.value, value) && values.some((v) => Object.is(v, parsed.value))) {
        return { ok: false, message: duplicateMessage(parsed.value) }
      }
      return parsed
    },
    onCommit: (next) => {
      if (next !== undefined) onChange(next)
    },
  })

  return (
    <li className="flex flex-col">
      <span
        className={cn(
          'inline-flex h-6 items-center rounded border border-border/70 bg-muted/55 pr-0.5 pl-1.5',
          'transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/24 dark:focus-within:ring-ring/48',
          draft.error && 'border-destructive/36 ring-2 ring-destructive/16',
        )}
      >
        <input
          {...draft.inputProps}
          aria-label={`Value ${label}`}
          aria-invalid={draft.error ? true : undefined}
          aria-describedby={draft.error ? errorId : undefined}
          spellCheck={false}
          autoComplete="off"
          className="field-sizing-content min-w-[2ch] bg-transparent font-mono text-xs text-foreground outline-none"
        />
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={onRemove}
          className={cn(
            'relative ml-0.5 flex size-5 cursor-pointer items-center justify-center rounded-sm text-subtle-foreground outline-none',
            'transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            'pointer-coarse:after:absolute pointer-coarse:after:size-11',
          )}
        >
          <X aria-hidden className="size-3" />
        </button>
      </span>
      {draft.error && (
        <IssueText issues={[{ message: draft.error, severity: 'error' }]} id={errorId} className="mt-1 max-w-56" />
      )}
    </li>
  )
}
