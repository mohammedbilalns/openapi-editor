import * as React from 'react'
import { Boxes, Ellipsis, Trash2 } from 'lucide-react'
import {
  confirm,
  FieldRow,
  InlineTitleInput,
  IssueText,
  MetaChip,
  PageHeader,
  SCHEMA_TYPE_ICONS,
  SchemaTypeIcon,
  StatusChip,
} from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MissingEntity } from '@/components/app/not-found'
import { useActions, useSchema, useSchemaOptions } from '@/lib/openapi/selectors'
import { useEditorStore } from '@/lib/openapi/store'
import type { NodeId, SchemaNode, SchemaType } from '@/lib/openapi/types'
import { ConstraintsPanel } from './constraints-panel'
import { EnumPanel } from './enum-panel'
import { FieldsPanel } from './fields-panel'
import { ItemsPanel } from './items-panel'
import { countIssues, fieldIssues, issueProps, useIssuesFor, type Issue } from './schema-issues'
import { changeSchemaType, isComposition, isPrimitive, SCHEMA_TYPES, typeChangeLoss } from './schema-model'
import { UsagePopover } from './usage-popover'
import { useDeleteSchema } from './use-delete-schema'
import { VariantsPanel } from './variants-panel'

const PAGE_CLASS = 'mx-auto flex w-full max-w-[56rem] flex-col gap-6 px-4 py-4 md:px-6 md:py-6'

/** `/schemas/$schemaId` (BLUEPRINT §3 "Schema editor"). */
export function SchemaEditor({ schemaId }: { schemaId: NodeId }) {
  const schema = useSchema(schemaId)
  const issues = useIssuesFor(schemaId)
  if (!schema) return <MissingEntity entity="schema" icon={Boxes} />

  return (
    <div className={PAGE_CLASS}>
      <SchemaHeader schema={schema} issues={issues} />
      <div className="@container flex flex-col gap-3">
        <TypeField schema={schema} />
        <NullableField schemaId={schemaId} nullable={schema.nullable} />
        <DescriptionField schemaId={schemaId} description={schema.description} />
      </div>
      <div className="flex flex-col gap-4">
        {schema.type === 'object' && <FieldsPanel schemaId={schemaId} properties={schema.properties} issues={issues} />}
        {schema.type === 'array' && <ItemsPanel schemaId={schemaId} items={schema.items} issues={issues} />}
        {schema.type === 'enum' && <EnumPanel schema={schema} issues={issues} />}
        {isComposition(schema.type) && <VariantsPanel schema={schema} issues={issues} />}
        {isPrimitive(schema.type) && <ConstraintsPanel schema={schema} />}
      </div>
    </div>
  )
}

function IssueChips({ issues }: { issues: readonly Issue[] }) {
  const { errors, warnings } = countIssues(issues)
  return (
    <>
      {errors > 0 && <StatusChip tone="destructive">{errors === 1 ? '1 error' : `${errors} errors`}</StatusChip>}
      {warnings > 0 && (
        <StatusChip tone="warning">{warnings === 1 ? '1 warning' : `${warnings} warnings`}</StatusChip>
      )}
    </>
  )
}

function SchemaHeader({ schema, issues }: { schema: SchemaNode; issues: readonly Issue[] }) {
  const { updateSchema, sealHistory } = useActions()
  const deleteSchema = useDeleteSchema()
  const options = useSchemaOptions()
  const name = schema.name ?? ''
  const titleId = React.useId()

  const nameIssues = fieldIssues(issues, 'name')
  const localProblem = !name.trim()
    ? 'Name the schema. References use the name in the exported YAML.'
    : options.some((option) => option.id !== schema.id && option.name === name)
      ? `Another schema is already named ${name}.`
      : null
  const shownIssues = nameIssues.length > 0 ? nameIssues : localProblem ? [{ message: localProblem, severity: 'error' as const }] : []
  const aria = issueProps(issues, 'name', titleId)

  return (
    <PageHeader
      meta={
        <>
          <MetaChip icon={SCHEMA_TYPE_ICONS[schema.type]} className="font-mono">
            {schema.type}
          </MetaChip>
          <UsagePopover schemaId={schema.id} />
          <IssueChips issues={issues} />
        </>
      }
      title={
        <InlineTitleInput
          id={titleId}
          mono
          value={name}
          placeholder="SchemaName"
          aria-label="Schema name"
          invalid={shownIssues.length > 0 || aria['aria-invalid']}
          aria-describedby={shownIssues.length > 0 ? `${titleId}-issues` : undefined}
          onChange={(next) => updateSchema(schema.id, { name: next })}
          onBlur={sealHistory}
        />
      }
      description={
        shownIssues.length > 0 ? <IssueText issues={shownIssues} id={`${titleId}-issues`} className="mt-0" /> : undefined
      }
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Schema actions" />}>
            <Ellipsis aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={() => void deleteSchema(schema.id)}>
              <Trash2 aria-hidden />
              Delete schema
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  )
}

const getSchema = (id: NodeId) => useEditorStore.getState().document.schemas.get(id)

function TypeField({ schema }: { schema: SchemaNode }) {
  const { updateSchema, sealHistory } = useActions()
  const id = React.useId()

  const change = async (next: SchemaType) => {
    const current = getSchema(schema.id)
    if (!current || (current.type === next && !current.untyped)) return
    const loss = typeChangeLoss(current, next)
    if (loss) {
      const ok = await confirm({ title: `Change type to ${next}?`, description: loss, confirmLabel: 'Change type' })
      if (!ok) return
    }
    // Re-read: the document may have changed while the dialog was open.
    const latest = getSchema(schema.id)
    if (!latest) return
    sealHistory()
    updateSchema(schema.id, changeSchemaType(latest, next))
    sealHistory()
  }

  // An untyped schema (imported without `type`) has no selected value, so picking
  // the type it is shown as still sets it.
  return (
    <FieldRow label="Type" htmlFor={id}>
      <Select<SchemaType | null>
        value={schema.untyped ? null : schema.type}
        onValueChange={(next) => void change(next as SchemaType)}
      >
        <SelectTrigger id={id} className="w-full max-w-60">
          <SelectValue>
            {(value: SchemaType | null) => (
              <>
                <SchemaTypeIcon type={value ?? schema.type} />
                <span className="font-mono">{value ?? schema.type}</span>
                {value === null && <span className="text-subtle-foreground">untyped</span>}
              </>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SCHEMA_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              <SchemaTypeIcon type={type.value} />
              <span className="font-mono">{type.label}</span>
              <span className="ml-2 text-subtle-foreground">{type.hint}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  )
}

function DescriptionField({ schemaId, description }: { schemaId: NodeId; description: string | undefined }) {
  const { updateSchema, sealHistory } = useActions()
  const id = React.useId()
  return (
    <FieldRow label="Description" htmlFor={id}>
      <Textarea
        id={id}
        rows={3}
        value={description ?? ''}
        placeholder="What this schema represents"
        onChange={(event) => updateSchema(schemaId, { description: event.target.value || undefined })}
        onBlur={sealHistory}
        className="min-h-0 resize-y"
      />
    </FieldRow>
  )
}

function NullableField({ schemaId, nullable }: { schemaId: NodeId; nullable: boolean | undefined }) {
  const { updateSchema } = useActions()
  const id = React.useId()
  return (
    <FieldRow label="Nullable" htmlFor={id}>
      <div className="flex min-h-8 items-center gap-2">
        <Checkbox
          id={id}
          checked={nullable === true}
          aria-describedby={`${id}-note`}
          onCheckedChange={(checked) => updateSchema(schemaId, { nullable: checked || undefined })}
        />
        <span id={`${id}-note`} className="text-xs text-muted-foreground">
          <span className="font-mono">null</span> is allowed as well.
        </span>
      </div>
    </FieldRow>
  )
}
