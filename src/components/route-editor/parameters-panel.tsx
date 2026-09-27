import * as React from 'react'
import { ChevronDown, Variable } from 'lucide-react'
import { EmptyState, IssueText, MetaChip, Panel } from '@/components/shared'
import { SchemaTypePicker } from '@/components/schema-editor'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useActions } from '@/lib/openapi/selectors'
import { useEditorStore } from '@/lib/openapi/store'
import { createSchema, generateId, type NodeId, type ParameterDef, type SchemaOrRef, type SchemaType } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'
import { pathParamNames } from './path-params'
import { fieldIssues, issueField, useIssuesFor, type RouteIssue } from './route-issues'
import {
  ColumnHeader,
  RowDeleteButton,
  RowHeader,
  RowLock,
  StackedLabel,
  cellInputClassName,
  headerPlaceholderClass,
  rowClass,
  useFocusWhen,
} from './row-parts'

type NewLocation = Exclude<ParameterDef['in'], 'path'>

const ADDABLE: { value: NewLocation; label: string }[] = [
  { value: 'query', label: 'Query' },
  { value: 'header', label: 'Header' },
  { value: 'cookie', label: 'Cookie' },
]

/** Parameter schemas are usually scalars; arrays and enums cover `?ids=1,2` and fixed choices. */
const PARAM_TYPES: readonly SchemaType[] = ['string', 'integer', 'number', 'boolean', 'array', 'enum']

const columns = cn(
  '[grid-template-areas:"name_name_req_act"_"in_type_type_type"_"desc_desc_desc_desc"] grid-cols-[4.5rem_minmax(0,1fr)_auto_auto]',
  '@[48rem]:[grid-template-areas:"name_in_type_req_desc_act"] @[48rem]:grid-cols-[minmax(0,1.1fr)_4.5rem_minmax(10rem,1fr)_4.25rem_minmax(0,1.5fr)_1.5rem]',
)

const EMPTY_PARAMS: ParameterDef[] = []

export function ParametersPanel({ routeId }: { routeId: NodeId }) {
  const params = useEditorStore((s) => s.document.routes.get(routeId)?.parameters) ?? EMPTY_PARAMS
  const path = useEditorStore((s) => s.document.routes.get(routeId)?.path) ?? ''
  const issues = useIssuesFor(routeId)
  const { addParameter, updateParameter, deleteParameter } = useActions()
  const [focusId, setFocusId] = React.useState<NodeId | null>(null)

  const namesInPath = React.useMemo(() => new Set(pathParamNames(path)), [path])

  const add = (location: NewLocation) => {
    const id = generateId()
    addParameter(routeId, {
      id,
      name: '',
      in: location,
      required: false,
      schema: { kind: 'inline', schema: createSchema('string') },
    })
    setFocusId(id)
  }

  const update = React.useCallback(
    (paramId: NodeId, updates: Partial<ParameterDef>) => updateParameter(routeId, paramId, updates),
    [routeId, updateParameter],
  )
  const remove = React.useCallback((paramId: NodeId) => deleteParameter(routeId, paramId), [routeId, deleteParameter])

  return (
    <Panel
      id="parameters"
      title="Parameters"
      icon={Variable}
      count={params.length}
      flush
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="xs" />}>
            Add parameter
            <ChevronDown aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ADDABLE.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => add(option.value)}>
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {params.length === 0 ? (
        <EmptyState
          size="panel"
          title="No parameters."
          description="Path parameters appear when the path has a {name} segment. Add query, header or cookie parameters above."
        />
      ) : (
        <div role="table" aria-label="Parameters" className="text-[13px]">
          <RowHeader className={columns} breakpoint="lg">
            <ColumnHeader className="[grid-area:name]">Name</ColumnHeader>
            <ColumnHeader className="[grid-area:in]">In</ColumnHeader>
            <ColumnHeader className="[grid-area:type]">Type</ColumnHeader>
            <ColumnHeader className="text-center [grid-area:req]">Required</ColumnHeader>
            <ColumnHeader className="[grid-area:desc]">Description</ColumnHeader>
            <ColumnHeader className="[grid-area:act]">
              <span className="sr-only">Actions</span>
            </ColumnHeader>
          </RowHeader>
          <div role="rowgroup">
            {params.map((param) => (
              <ParameterRow
                key={param.id}
                param={param}
                inPath={param.in === 'path' && namesInPath.has(param.name)}
                focusName={param.id === focusId}
                issues={fieldIssues(issues, issueField.param(param.id))}
                onUpdate={update}
                onDelete={remove}
              />
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

type ParameterRowProps = {
  param: ParameterDef
  /** A path parameter whose `{name}` is in the path: locked (name, required, delete). */
  inPath: boolean
  /** Focus the name input (the row was just added). */
  focusName: boolean
  issues: readonly RouteIssue[]
  onUpdate: (paramId: NodeId, updates: Partial<ParameterDef>) => void
  onDelete: (paramId: NodeId) => void
}

const ParameterRow = React.memo(function ParameterRow({
  param,
  inPath,
  focusName,
  issues,
  onUpdate,
  onDelete,
}: ParameterRowProps) {
  const isPath = param.in === 'path'
  const label = param.name || `new ${param.in} parameter`
  const issuesId = `param-${param.id}-issues`
  const invalid = issues.length > 0 || undefined
  const nameRef = useFocusWhen<HTMLInputElement>(focusName)
  const { sealHistory } = useActions()

  return (
    <div id={`param-${param.id}`} role="row" aria-label={label} className={cn(rowClass('lg'), columns)}>
      <div role="cell" className="min-w-0 [grid-area:name]">
        <Input
          aria-label="Name"
          value={param.name}
          readOnly={isPath}
          placeholder="name"
          spellCheck={false}
          autoComplete="off"
          ref={nameRef}
          aria-invalid={invalid}
          aria-describedby={invalid ? issuesId : undefined}
          title={isPath ? 'Set by the path. Rename it in the path above.' : undefined}
          onChange={(event) => onUpdate(param.id, { name: event.target.value })}
          onBlur={sealHistory}
          className={cn(cellInputClassName, 'font-mono text-[12.5px]', isPath && 'border-transparent bg-transparent shadow-none dark:bg-transparent dark:shadow-none')}
        />
      </div>
      <div role="cell" className="[grid-area:in]">
        <MetaChip className="font-mono">{param.in}</MetaChip>
      </div>
      <div role="cell" className="min-w-0 [grid-area:type]">
        <SchemaTypePicker
          value={param.schema}
          onChange={(schema: SchemaOrRef) => onUpdate(param.id, { schema })}
          allowedTypes={PARAM_TYPES}
          allowRef
          size="sm"
          aria-label="Type"
        />
      </div>
      <div role="cell" className="flex items-center gap-1.5 [grid-area:req] @[48rem]:justify-center">
        <Checkbox
          aria-label="Required"
          checked={isPath || param.required}
          disabled={isPath}
          title={isPath ? 'Path parameters are always required.' : undefined}
          onCheckedChange={(checked) => onUpdate(param.id, { required: checked })}
        />
        <StackedLabel breakpoint="lg">Required</StackedLabel>
      </div>
      <div role="cell" className="min-w-0 [grid-area:desc]">
        <Input
          aria-label="Description"
          value={param.description ?? ''}
          placeholder="Description"
          onChange={(event) => onUpdate(param.id, { description: event.target.value || undefined })}
          onBlur={sealHistory}
          className={cn(cellInputClassName, headerPlaceholderClass('lg'))}
        />
      </div>
      <div role="cell" className="flex justify-end [grid-area:act]">
        {inPath ? (
          <RowLock reason="Set by the path. Edit the path to rename it." />
        ) : (
          <RowDeleteButton label={`Delete parameter ${param.name || param.in}`} onClick={() => onDelete(param.id)} />
        )}
      </div>
      {issues.length > 0 && (
        <div className="col-span-full">
          <IssueText issues={issues} id={issuesId} className="mt-0" />
        </div>
      )}
    </div>
  )
})
