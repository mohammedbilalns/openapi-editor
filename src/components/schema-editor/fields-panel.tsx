import * as React from 'react'
import { Braces } from 'lucide-react'
import { EmptyState, IssueText, Panel, PanelAddRow } from '@/components/shared'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useActions } from '@/lib/openapi/selectors'
import { useEditorStore } from '@/lib/openapi/store'
import { createSchema, type NodeId, type PropertyDef, type SchemaOrRef } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'
import { cellInputClassName, RowIconButton, rowActionClassName, TableHead } from './row-parts'
import { fieldIssues, issueField, type Issue } from './schema-issues'
import { fieldNameProblem, uniqueFieldName, type Parsed } from './schema-model'
import { SchemaTypePicker } from './schema-type-picker'
import { useDraft } from './use-draft'

/** Name · Type · Required · Description · delete. */
const COLUMNS = '@[40rem]:grid-cols-[minmax(0,1fr)_minmax(10rem,1fr)_4.5rem_minmax(0,1.4fr)_1.75rem]'

const getSchema = (id: NodeId) => useEditorStore.getState().document.schemas.get(id)

export function FieldsPanel({
  schemaId,
  properties,
  issues,
}: {
  schemaId: NodeId
  properties: Map<string, PropertyDef> | undefined
  issues: readonly Issue[]
}) {
  const { addFieldToSchema, updateField, deleteField } = useActions()
  const [focusIndex, setFocusIndex] = React.useState<number | null>(null)
  const fields = React.useMemo(() => (properties ? [...properties.values()] : []), [properties])

  const addField = () => {
    const schema = getSchema(schemaId)
    const name = uniqueFieldName(schema)
    addFieldToSchema(schemaId, { name, required: false, schema: { kind: 'inline', schema: createSchema('string') } })
    setFocusIndex(schema?.properties?.size ?? 0)
  }

  // The store keeps the field's position and required status, and refuses a name that's taken.
  const rename = React.useCallback(
    (from: string, to: string) => updateField(schemaId, from, { name: to }),
    [schemaId, updateField],
  )
  const change = React.useCallback(
    (name: string, updates: Partial<PropertyDef>) => updateField(schemaId, name, updates),
    [schemaId, updateField],
  )
  const remove = React.useCallback((name: string) => deleteField(schemaId, name), [schemaId, deleteField])
  const focused = React.useCallback(() => setFocusIndex(null), [])

  const panelIssues = fieldIssues(issues, 'fields')

  return (
    <Panel
      id="fields"
      title="Fields"
      icon={Braces}
      count={fields.length}
      flush
      footer={<PanelAddRow label="Add field" onClick={addField} />}
    >
      {fields.length === 0 ? (
        <EmptyState size="panel" title="No fields yet." description="Add the properties this object has." />
      ) : (
        <>
          <TableHead className={COLUMNS}>
            <span>Name</span>
            <span>Type</span>
            <span>Required</span>
            <span>Description</span>
          </TableHead>
          <ul className="divide-y divide-border/70">
            {fields.map((field, index) => (
              <FieldRow
                // Rows are keyed by position so a rename (which keeps the position) keeps focus in the row.
                // oxlint-disable-next-line react/no-array-index-key
                key={index}
                schemaId={schemaId}
                field={field}
                issues={fieldIssues(issues, issueField.field(field.name))}
                focusName={focusIndex === index}
                onFocused={focused}
                onRename={rename}
                onChange={change}
                onDelete={remove}
              />
            ))}
          </ul>
        </>
      )}
      <IssueText issues={panelIssues} id={`${schemaId}-fields-issues`} className="mx-4 mb-3" />
    </Panel>
  )
}

type FieldRowProps = {
  schemaId: NodeId
  field: PropertyDef
  issues: readonly Issue[]
  focusName: boolean
  onFocused: () => void
  onRename: (from: string, to: string) => void
  onChange: (name: string, updates: Partial<PropertyDef>) => void
  onDelete: (name: string) => void
}

const identity = (value: string | undefined) => value ?? ''

const FieldRow = React.memo(function FieldRow({
  schemaId,
  field,
  issues,
  focusName,
  onFocused,
  onRename,
  onChange,
  onDelete,
}: FieldRowProps) {
  const { name } = field
  const baseId = React.useId()
  const nameInput = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!focusName) return
    nameInput.current?.focus()
    nameInput.current?.select()
    onFocused()
  }, [focusName, onFocused])

  const nameDraft = useDraft<string>({
    value: name,
    format: identity,
    // Commit on blur / Enter so half-typed names never land in the document.
    live: false,
    parse: (text): Parsed<string> => {
      const problem = fieldNameProblem(text, getSchema(schemaId), name)
      return problem ? { ok: false, message: problem } : { ok: true, value: text }
    },
    onCommit: (next) => {
      if (next !== undefined) onRename(name, next)
    },
  })

  const descriptionDraft = useDraft<string>({
    value: field.description ?? '',
    format: identity,
    parse: (text) => ({ ok: true, value: text }),
    onCommit: (next) => onChange(name, { description: next || undefined }),
  })

  const setType = React.useCallback((schema: SchemaOrRef) => onChange(name, { schema }), [name, onChange])

  const rowIssues = nameDraft.error ? [{ message: nameDraft.error, severity: 'error' as const }] : issues
  const issuesId = `${baseId}-issues`
  const invalid = rowIssues.length > 0

  return (
    <li
      id={`field-${encodeURIComponent(name)}`}
      aria-label={`Field ${name}`}
      className={cn(
        'group/row grid scroll-mt-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-4 py-2.5',
        '@[40rem]:gap-y-0 @[40rem]:py-1 transition-colors hover:bg-muted/40',
        COLUMNS,
      )}
    >
      <Input
        ref={nameInput}
        {...nameDraft.inputProps}
        aria-label="Field name"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? issuesId : undefined}
        spellCheck={false}
        autoComplete="off"
        className={cn(cellInputClassName, 'font-mono text-[12.5px]')}
      />
      <RowIconButton
        label={`Delete field ${name}`}
        onClick={() => onDelete(name)}
        className={cn(rowActionClassName, '@[40rem]:col-start-5 @[40rem]:row-start-1')}
      />
      <div className="col-span-2 flex min-w-0 items-center gap-3 @[40rem]:contents">
        <SchemaTypePicker
          aria-label={`Type of ${name}`}
          value={field.schema}
          onChange={setType}
          size="sm"
          className="min-w-0 flex-1 @[40rem]:col-start-2 @[40rem]:row-start-1"
        />
        <label
          htmlFor={`${baseId}-required`}
          className="relative flex h-7 shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground @[40rem]:col-start-3 @[40rem]:row-start-1 @[40rem]:justify-center">
          <Checkbox id={`${baseId}-required`} checked={field.required} onCheckedChange={(checked) => onChange(name, { required: checked })} />
          <span className="@[40rem]:sr-only">Required</span>
        </label>
      </div>
      <Input
        {...descriptionDraft.inputProps}
        aria-label={`Description of ${name}`}
        placeholder="Description"
        className={cn(
          cellInputClassName,
          '@[40rem]:placeholder:text-transparent @[40rem]:focus:placeholder:text-muted-foreground',
          'col-span-2 @[40rem]:col-span-1 @[40rem]:col-start-4 @[40rem]:row-start-1',
        )}
      />
      {invalid && (
        <div className="col-span-2 @[40rem]:col-span-5">
          <IssueText issues={rowIssues} id={issuesId} className="mt-0 mb-1" />
        </div>
      )}
    </li>
  )
})
