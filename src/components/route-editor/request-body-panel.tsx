import * as React from 'react'
import { Package } from 'lucide-react'
import { EmptyState, FieldRow, IssueText, Panel, PanelAddRow } from '@/components/shared'
import { SchemaCombobox } from '@/components/schema-editor'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useActions } from '@/lib/openapi/selectors'
import { useEditorStore } from '@/lib/openapi/store'
import { createSchema, generateId, type MediaType, type NodeId, type RequestBody } from '@/lib/openapi/types'
import { cn } from '@/lib/utils'
import { BODY_METHODS } from './path-params'
import { ColumnHeader, RowDeleteButton, RowHeader, StackedLabel, rowClassName } from './row-parts'
import { fieldIssues, useIssuesFor } from './route-issues'
import { fromPick, toPick } from './schema-pick'

export const CONTENT_TYPES = [
  'application/json',
  'application/xml',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
  'application/octet-stream',
] as const

const columns = cn(
  '[grid-template-areas:"type_act"_"schema_schema"] grid-cols-[minmax(0,1fr)_1.5rem]',
  '@[40rem]:[grid-template-areas:"type_schema_act"] @[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_1.5rem]',
)

export function createRequestBody(): RequestBody {
  return {
    id: generateId(),
    required: true,
    content: new Map([['application/json', { schema: { kind: 'inline', schema: createSchema('object') } }]]),
  }
}

function useBodyMethod(routeId: NodeId) {
  const method = useEditorStore((s) => s.document.routes.get(routeId)?.method)
  const hasBody = useEditorStore((s) => s.document.routes.get(routeId)?.requestBody !== undefined)
  return { method, hasBody, takesBody: method !== undefined && BODY_METHODS.has(method) }
}

/**
 * Reads the body at call time so handlers never write back a stale copy, then
 * replaces it with `change(body)`.
 */
function usePatchBody(routeId: NodeId) {
  const { setRequestBody } = useActions()
  return React.useCallback(
    (change: (body: RequestBody) => RequestBody | undefined) => {
      const body = useEditorStore.getState().document.routes.get(routeId)?.requestBody
      if (body) setRequestBody(routeId, change(body))
    },
    [routeId, setRequestBody],
  )
}

/**
 * "Request body" panel (BLUEPRINT §3) for POST, PUT and PATCH, and for any route
 * that already has a body, so imported bodies never go out of sight.
 */
export function RequestBodyPanel({ routeId }: { routeId: NodeId }) {
  const { method, hasBody, takesBody } = useBodyMethod(routeId)
  const { setRequestBody } = useActions()
  if (!takesBody && !hasBody) return null

  const add = () => setRequestBody(routeId, createRequestBody())

  if (!hasBody) {
    return (
      <Panel id="request-body" title="Request body" icon={Package} footer={<PanelAddRow label="Add request body" onClick={add} />}>
        <EmptyState size="panel" title="No request body." description="The request carries no payload." className="py-4" />
      </Panel>
    )
  }
  return <RequestBodyEditor routeId={routeId} unusual={!takesBody} method={method} />
}

/** Footer link for methods that usually have no body (BLUEPRINT §3). */
export function AddRequestBodyLink({ routeId }: { routeId: NodeId }) {
  const { method, hasBody, takesBody } = useBodyMethod(routeId)
  const { setRequestBody } = useActions()
  if (takesBody || hasBody || !method) return null
  return (
    <p className="text-xs text-muted-foreground">
      {method.toUpperCase()} requests usually have no body.{' '}
      <Button
        variant="link"
        size="xs"
        className="h-auto px-0 text-xs text-foreground"
        onClick={() => setRequestBody(routeId, createRequestBody())}
      >
        Add a request body
      </Button>
    </p>
  )
}

function RequestBodyEditor({ routeId, unusual, method }: { routeId: NodeId; unusual: boolean; method?: string }) {
  const body = useEditorStore((s) => s.document.routes.get(routeId)?.requestBody)
  const { setRequestBody, updateRequestBody } = useActions()
  const patch = usePatchBody(routeId)
  const baseId = React.useId()
  const issues = fieldIssues(useIssuesFor(routeId), 'requestBody')
  const issuesId = `${baseId}-issues`

  const rename = React.useCallback(
    (from: string, to: string) =>
      patch((current) => {
        if (from === to || current.content.has(to)) return current
        const content = new Map<string, MediaType>()
        for (const [type, media] of current.content) content.set(type === from ? to : type, media)
        return { ...current, content }
      }),
    [patch],
  )
  const setMedia = React.useCallback(
    (type: string, media: MediaType) =>
      patch((current) => ({ ...current, content: new Map(current.content).set(type, media) })),
    [patch],
  )
  const removeMedia = React.useCallback(
    (type: string) =>
      patch((current) => {
        const content = new Map(current.content)
        content.delete(type)
        return { ...current, content }
      }),
    [patch],
  )

  const content = body?.content
  const types = React.useMemo(() => (content ? [...content.keys()] : []), [content])

  if (!body) return null
  const nextType = CONTENT_TYPES.find((type) => !body.content.has(type))

  return (
    <Panel
      id="request-body"
      title="Request body"
      icon={Package}
      flush
      actions={
        <Button variant="ghost" size="xs" onClick={() => setRequestBody(routeId, undefined)}>
          Remove
        </Button>
      }
      footer={
        nextType ? (
          <PanelAddRow
            label="Add content type"
            onClick={() => setMedia(nextType, { schema: { kind: 'inline', schema: createSchema('object') } })}
          />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3">
        {issues.length > 0 && <IssueText issues={issues} id={issuesId} className="mt-0" />}
        {unusual && (
          <p className="text-xs text-muted-foreground">
            {method?.toUpperCase()} requests usually have no body. Remove it unless your API expects one.
          </p>
        )}
        <FieldRow label="Required" htmlFor={`${baseId}-required`}>
          <div className="flex min-h-8 items-center gap-2">
            <Checkbox
              id={`${baseId}-required`}
              aria-label="Body required"
              aria-describedby={`${baseId}-required-note`}
              checked={body.required}
              onCheckedChange={(checked) => patch((current) => ({ ...current, required: checked }))}
            />
            <span id={`${baseId}-required-note`} className="text-xs text-muted-foreground">
              Clients must send a body.
            </span>
          </div>
        </FieldRow>
        <FieldRow label="Description" htmlFor={`${baseId}-description`}>
          <Input
            id={`${baseId}-description`}
            value={body.description ?? ''}
            placeholder="What the client sends"
            onChange={(event) => updateRequestBody(routeId, { description: event.target.value || undefined })}
          />
        </FieldRow>
      </div>
      {types.length === 0 ? (
        <EmptyState size="panel" title="No content types." description="Add one to describe the payload." />
      ) : (
        <div role="table" aria-label="Request body content" className="text-[13px]">
          <RowHeader className={columns}>
            <ColumnHeader className="[grid-area:type]">Content type</ColumnHeader>
            <ColumnHeader className="[grid-area:schema]">Schema</ColumnHeader>
            <ColumnHeader className="[grid-area:act]">
              <span className="sr-only">Actions</span>
            </ColumnHeader>
          </RowHeader>
          <div role="rowgroup">
            {types.map((type) => (
              <MediaRow
                key={type}
                type={type}
                media={body.content.get(type)!}
                usedTypes={types}
                canDelete={types.length > 1}
                issuesId={issues.length > 0 ? issuesId : undefined}
                onRename={rename}
                onChange={setMedia}
                onDelete={removeMedia}
              />
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

type MediaRowProps = {
  type: string
  media: MediaType
  usedTypes: readonly string[]
  canDelete: boolean
  /** Set while the body has issues (e.g. a broken reference): marks the schema pickers invalid. */
  issuesId: string | undefined
  onRename: (from: string, to: string) => void
  onChange: (type: string, media: MediaType) => void
  onDelete: (type: string) => void
}

const MediaRow = React.memo(function MediaRow({
  type,
  media,
  usedTypes,
  canDelete,
  issuesId,
  onRename,
  onChange,
  onDelete,
}: MediaRowProps) {
  const options = CONTENT_TYPES.includes(type as (typeof CONTENT_TYPES)[number]) ? CONTENT_TYPES : [type, ...CONTENT_TYPES]
  return (
    <div role="row" aria-label={type} className={cn(rowClassName, columns)}>
      <div role="cell" className="flex min-w-0 flex-col gap-1 [grid-area:type]">
        <StackedLabel>Content type</StackedLabel>
        <Select value={type} onValueChange={(next: string) => onRename(type, next)}>
          <SelectTrigger size="sm" aria-label="Content type" className="w-full font-mono text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem
                key={option}
                value={option}
                disabled={option !== type && usedTypes.includes(option)}
                className="font-mono text-[12px]"
              >
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div role="cell" className="flex min-w-0 flex-col gap-1 [grid-area:schema]">
        <StackedLabel>Schema</StackedLabel>
        <SchemaCombobox
          value={toPick(media.schema)}
          onChange={(pick) => {
            const schema = fromPick(pick, media.schema)
            if (schema) onChange(type, { ...media, schema })
          }}
          allowInline="Inline object"
          size="sm"
          aria-label={`Schema for ${type}`}
          invalid={issuesId !== undefined}
          aria-describedby={issuesId}
          className="w-full"
        />
      </div>
      <div role="cell" className="flex justify-end self-end [grid-area:act] @[40rem]:self-center">
        {canDelete && <RowDeleteButton label={`Remove ${type}`} onClick={() => onDelete(type)} />}
      </div>
    </div>
  )
})
